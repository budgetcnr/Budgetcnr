import { readFile, appendFile } from 'node:fs/promises';
import { createDecipheriv, createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const version = 'arrears-term269-20261105';
const sourceUrl = 'https://docs.google.com/spreadsheets/d/1q1-shGYQ2tmhmH9DMneej_BcwusFr8ve/edit';
const asOf = '2026-11-05';
const term = 'academic_year=2569 AND semester=2';

async function query(sql, params = []) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.CLOUDFLARE_D1_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  assert(response.ok && result.success && result.result.every(row => row.success), 'D1 request failed');
  return result.result.flatMap(row => row.results ?? []);
}

async function insert(table, columns, rows) {
  const size = Math.floor(90 / columns.length);
  for (let offset = 0; offset < rows.length; offset += size) {
    const chunk = rows.slice(offset, offset + size);
    const placeholders = '(' + columns.map(() => '?').join(',') + ')';
    await query('INSERT INTO ' + table + ' (' + columns.join(',') + ') VALUES ' +
      chunk.map(() => placeholders).join(','), chunk.flat());
  }
}

let stage = 'validate encrypted input';
try {
  const secret = process.env.ROSTER_CREDENTIAL_KEY?.trim();
  assert(secret && process.env.CLOUDFLARE_D1_API_TOKEN);
  const encrypted = JSON.parse(await readFile(new URL('../cloudflare/tuition-term269.enc.json', import.meta.url)));
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  const { rows, academic_year, semester } = JSON.parse(gunzipSync(Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'base64')), decipher.final(),
  ])));
  assert(academic_year === 2569 && semester === 2 && rows.length === 1553);
  assert.equal(new Set(rows.map(([id]) => id)).size, rows.length);
  const rooms = new Map();
  for (const [id, room, cents] of rows) {
    assert(/^\d{4,10}$/.test(id) && /^ม\.[1-6]\/\d+$/.test(room) && Number.isSafeInteger(cents) && cents >= 0);
    const summary = rooms.get(room) ?? { count: 0, total: 0 };
    summary.count++;
    summary.total += cents;
    rooms.set(room, summary);
  }
  const expectedTotal = rows.reduce((total, row) => total + row[2], 0);
  assert.equal(expectedTotal, 690020000);
  assert.equal(rooms.size, 54);

  stage = 'read active version';
  const [{ version: previous }] = await query("SELECT version FROM fee_import_state WHERE id='active'");
  if (previous === version) {
    console.log('Term 2/2569 version is already active.');
  } else {
    stage = 'stage new term';
    for (const table of ['fee_entries', 'fee_reports', 'fee_sources']) {
      await query('DELETE FROM ' + table + ' WHERE import_version=?', [version]);
    }
    await insert('fee_sources', ['id','source_id','import_version','class_room','title','url','as_of','total_cents','row_count','complete'],
      [...rooms].map(([room, summary]) => [version + ':term269:' + room, 'term269:' + room, version, room,
        'ภาคเรียนที่ 2 รวม 1-6.xlsx', sourceUrl, asOf, summary.total, summary.count, 1]));
    await insert('fee_entries', ['id','student_id','import_version','source_id','academic_year','semester','class_room','item','outstanding_cents'],
      rows.map(([id, room, cents]) => [version + ':new:' + id, id, version, 'term269:' + room, 2569, 2, room, 'ยอดค้างค่าเทอม', cents]));

    stage = 'carry forward historical data';
    await query(`INSERT INTO fee_sources
      SELECT ? || ':' || source_id, source_id, ?, class_room, title, url, as_of, total_cents, row_count, complete
      FROM fee_sources old WHERE import_version=? AND NOT EXISTS
        (SELECT 1 FROM fee_sources next WHERE next.import_version=? AND next.class_room=old.class_room)`,
      [version, version, previous, version]);
    await query(`INSERT INTO fee_entries
      SELECT ? || ':old:' || e.id, e.student_id, ?, COALESCE(mapped.source_id,e.source_id),
        e.academic_year, e.semester, e.class_room, e.item, e.outstanding_cents
      FROM fee_entries e LEFT JOIN fee_sources old ON old.import_version=e.import_version AND old.source_id=e.source_id
      LEFT JOIN fee_sources mapped ON mapped.import_version=? AND mapped.source_id='term269:' || old.class_room
      WHERE e.import_version=? AND NOT (${term})`, [version, version, version, previous]);
    await query(`INSERT INTO fee_reports
      WITH incoming AS (SELECT student_id, source_id, outstanding_cents FROM fee_entries WHERE import_version=? AND ${term}),
      prior_term AS (SELECT student_id, SUM(outstanding_cents) cents FROM fee_entries WHERE import_version=? AND ${term} GROUP BY student_id),
      prior AS (SELECT * FROM fee_reports WHERE import_version=?),
      ids AS (SELECT student_id FROM incoming UNION SELECT student_id FROM prior)
      SELECT ? || ':' || ids.student_id, ids.student_id, ?,
        COALESCE(incoming.source_id, mapped.source_id, prior.source_id),
        CASE WHEN prior.student_id IS NOT NULL AND prior.total_cents IS NULL THEN NULL
             ELSE COALESCE(prior.total_cents,0) - COALESCE(prior_term.cents,0) + COALESCE(incoming.outstanding_cents,0) END,
        COALESCE(prior.details_available,1), COALESCE(prior.payment_note,'')
      FROM ids LEFT JOIN incoming USING(student_id) LEFT JOIN prior USING(student_id)
      LEFT JOIN prior_term USING(student_id)
      LEFT JOIN fee_sources old ON old.import_version=? AND old.source_id=prior.source_id
      LEFT JOIN fee_sources mapped ON mapped.import_version=? AND mapped.source_id='term269:' || old.class_room`,
      [version, previous, previous, version, version, previous, version]);

    stage = 'verify staged totals and history';
    const [staged] = await query(`SELECT COUNT(*) count, SUM(outstanding_cents) total FROM fee_entries WHERE import_version=? AND ${term}`, [version]);
    assert.deepEqual(staged, { count: rows.length, total: expectedTotal });
    const [history] = await query(`SELECT
      (SELECT COUNT(*) FROM fee_entries WHERE import_version=? AND NOT (${term})) old_count,
      (SELECT COUNT(*) FROM fee_entries WHERE import_version=? AND NOT (${term})) new_count`, [previous, version]);
    assert.equal(history.old_count, history.new_count);
    if (['arrears-sheet-20261028', 'arrears-20260910-cb15bb667adb'].includes(previous)) {
      await query(`INSERT INTO fee_entries
        SELECT ? || ':paid169:' || s.student_id, s.student_id, ?, next.source_id, 2569, 1,
          s.class_room, 'ค่าบำรุงการศึกษา', 0
        FROM student_roster s JOIN fee_sources next ON next.import_version=? AND next.class_room=s.class_room
        WHERE (s.class_room LIKE 'ม.1/%' OR s.class_room LIKE 'ม.4/%')
          AND NOT EXISTS (SELECT 1 FROM fee_sources old WHERE old.import_version=? AND old.class_room=s.class_room)
          AND NOT EXISTS (SELECT 1 FROM fee_entries e WHERE e.import_version=? AND e.student_id=s.student_id
            AND e.academic_year=2569 AND e.semester=1)`, [version, version, version, previous, version]);
    }
    const [unmatched] = await query(`SELECT COUNT(*) count FROM fee_entries e LEFT JOIN student_roster s USING(student_id)
      WHERE e.import_version=? AND ${term} AND s.student_id IS NULL`, [version]);

    stage = 'activate verified version';
    await query("UPDATE fee_import_state SET version=? WHERE id='active' AND version=?", [version, previous]);
    assert.equal((await query("SELECT version FROM fee_import_state WHERE id='active'"))[0].version, version);
    const summary = 'Term 2/2569 active: ' + staged.count + ' rows, ' + staged.total / 100 +
      ' THB; ' + history.new_count + ' historical rows preserved; ' + unmatched.count + ' IDs without a roster account.\n';
    console.log(summary.trim());
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  }
} catch {
  console.error('Term import stopped at ' + stage + '. No personal data logged.');
  process.exitCode = 1;
}
