import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
const token = process.env.CLOUDFLARE_D1_API_TOKEN;
assert(token, 'Missing D1 token');
async function query(sql, params = []) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  assert(response.ok && data.success && data.result.every(r => r.success), 'D1 request failed');
  return data.result.flatMap(r => r.results || []);
}
const rows = await query('SELECT id,full_name,login_enabled,credential_hash FROM teacher_roster WHERE personnel_id=?', ['691573']);
assert(rows.length === 1 && rows[0].full_name.includes('จิรภาส'), 'Account identity mismatch; no changes made');
const teacher = rows[0];
const before = await query('SELECT * FROM teacher_advisory_rooms WHERE teacher_id<>? ORDER BY id', [teacher.id]);
// Preserve existing assignments while ensuring the confirmed room is present.
await query(`UPDATE teacher_roster SET login_enabled=1 WHERE personnel_id='691573' AND full_name LIKE '%จิรภาส%';
INSERT INTO teacher_advisory_rooms (id,teacher_id,class_room,source,import_version)
SELECT 'advisor-jiraphas-691573-2-3',id,'ม.2/3','user-confirmed-20261029','advisor-update-20261029'
FROM teacher_roster WHERE personnel_id='691573' AND full_name LIKE '%จิรภาส%'
AND NOT EXISTS (SELECT 1 FROM teacher_advisory_rooms a WHERE a.teacher_id=teacher_roster.id AND a.class_room='ม.2/3');`);
const after = await query('SELECT login_enabled,credential_hash FROM teacher_roster WHERE id=?', [teacher.id]);
assert(after[0].login_enabled === 1);
assert.equal(after[0].credential_hash, teacher.credential_hash, 'Existing credential must remain unchanged');
assert((await query('SELECT id FROM teacher_advisory_rooms WHERE teacher_id=? AND class_room=?', [teacher.id, 'ม.2/3'])).length > 0);
assert.deepEqual(await query('SELECT * FROM teacher_advisory_rooms WHERE teacher_id<>? ORDER BY id', [teacher.id]), before);
const summary = 'Verified account 691573: enabled; advisory room ม.2/3 assigned; existing password hash preserved. Other advisors preserved. No credentials logged.\n';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
