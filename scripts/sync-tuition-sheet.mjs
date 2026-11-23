import assert from 'node:assert/strict';
import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { openBundle } from './tuition-transfer.mjs';

const tables = ['fee_sources', 'fee_entries', 'fee_reports'];
const columns = {
  fee_sources: ['id','source_id','import_version','class_room','title','url','as_of','total_cents','row_count','complete'],
  fee_entries: ['id','student_id','import_version','source_id','academic_year','semester','class_room','item','outstanding_cents'],
  fee_reports: ['id','student_id','import_version','source_id','total_cents','details_available','payment_note'],
};

export function buildSnapshot(bundle, previous, roster, version) {
  assert(/^arrears-live-[a-f0-9]{20}$/.test(bundle.version), 'Invalid source version');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(bundle.as_of), 'Missing source date');
  assert(bundle.records.length > 0 && bundle.coverage.length > 0, 'Empty source');
  const scope = new Map(bundle.coverage.map(c => [c.class_room, c.terms]));
  assert.equal(scope.size, bundle.coverage.length, 'Duplicate classroom');
  for (const [room, terms] of scope) {
    assert(/^ม\.[1-6]\/\d+$/.test(room) && terms.length > 0);
    const unique = new Set();
    for (const [year, semester] of terms) {
      assert(Number.isInteger(year) && year >= 2500 && [1,2].includes(semester));
      unique.add(`${year}:${semester}`);
    }
    assert.equal(unique.size, terms.length);
  }
  const incoming = new Map();
  for (const r of bundle.records) {
    assert(/^\d{4,10}$/.test(r.student_id) && scope.has(r.class_room));
    assert(Number.isSafeInteger(r.total_cents) && r.total_cents >= 0);
    assert(!incoming.has(r.student_id), 'Duplicate student');
    const terms = scope.get(r.class_room);
    assert.equal(r.entries.length, terms.length);
    const seen = new Set();
    for (const e of r.entries) {
      assert(terms.some(([y,s]) => y === e.academic_year && s === e.semester));
      assert(Number.isSafeInteger(e.outstanding_cents) && e.outstanding_cents >= 0);
      seen.add(`${e.academic_year}:${e.semester}`);
    }
    assert.equal(seen.size, terms.length);
    assert([0,1].includes(r.details_available));
    if (r.details_available) assert.equal(r.entries.reduce((n,e) => n + e.outstanding_cents,0), r.total_cents);
    incoming.set(r.student_id, r);
  }
  const rosterMap = new Map(roster.map(r => [r.student_id, r.class_room]));
  // Apply room-wide blanks only to students currently in that room. A moved
  // student's historical classroom must not silently zero their old balance.
  const roomFor = id => incoming.get(id)?.class_room ?? rosterMap.get(id);
  const covered = e => scope.get(roomFor(e.student_id))?.some(([y,s]) => y === e.academic_year && s === e.semester);
  const oldSources = new Map(previous.fee_sources.map(s => [s.source_id,s]));
  const touched = new Set([...roster.filter(r => scope.has(r.class_room)).map(r => r.student_id), ...incoming.keys()]);
  const retained = previous.fee_entries.filter(e => !covered(e));
  const entries = retained.map((e,i) => ({...e,id:`${version}:kept:${i}`,import_version:version}));
  const reports = previous.fee_reports.filter(r => !touched.has(r.student_id)).map(r => ({...r,id:`${version}:${r.student_id}`,import_version:version}));
  const sources = previous.fee_sources.filter(s => ![...scope.keys()].some(room => s.source_id === `live:${room}`))
    .map(s => ({...s,id:`${version}:${s.source_id}`,import_version:version}));
  for (const id of touched) {
    const r = incoming.get(id);
    const room = roomFor(id);
    const source_id = `live:${room}`;
    const extra = retained.filter(e => e.student_id === id).reduce((n,e) => n + e.outstanding_cents,0);
    if (r) for (const e of r.entries) entries.push({id:`${version}:${id}:${e.academic_year}:${e.semester}`, student_id:id,
      import_version:version,source_id,...e,class_room:room,item:'ยอดค้างค่าเทอม'});
    else for (const [year,semester] of scope.get(room)) entries.push({id:`${version}:${id}:${year}:${semester}`,
      student_id:id,import_version:version,source_id,academic_year:year,semester,class_room:room,item:'ยอดค้างค่าเทอม',outstanding_cents:0});
    reports.push({id:`${version}:${id}`,student_id:id,import_version:version,source_id,
      total_cents:(r?.total_cents ?? 0) + extra,details_available:r?.details_available ?? 1,payment_note:''});
  }
  // Preserve old sources for carried-forward records, and add one source per
  // authoritative classroom even if its latest arrears list is empty.
  for (const [room] of scope) {
    const own = reports.filter(r => r.source_id === `live:${room}`);
    sources.push({id:`${version}:live:${room}`,source_id:`live:${room}`,import_version:version,class_room:room,
      title:'Authoritative arrears sheet',url:bundle.source_url,as_of:bundle.as_of,
      total_cents:own.reduce((n,r) => n + r.total_cents,0),row_count:own.length,complete:1});
  }
  // Never overwrite a newer snapshot with an older report for the same terms.
  for (const e of previous.fee_entries.filter(covered)) {
    const source = oldSources.get(e.source_id);
    assert(!source || !source.source_id.startsWith('live:') || source.as_of <= bundle.as_of, 'Source report predates active covered terms');
  }
  const used = new Set([...entries.map(e => e.source_id), ...reports.map(r => r.source_id), ...[...scope.keys()].map(r => `live:${r}`)]);
  const result = {fee_sources:sources.filter(s => used.has(s.source_id)).map(s => {
    const own = reports.filter(r => r.source_id === s.source_id);
    return {...s,total_cents:own.reduce((n,r) => n + (r.total_cents ?? 0),0),row_count:own.length};
  }),fee_entries:entries,fee_reports:reports};
  for (const table of tables) assert.equal(new Set(result[table].map(r => r.id)).size,result[table].length);
  for (const e of entries) assert(result.fee_sources.some(s => s.source_id === e.source_id));
  for (const r of reports) assert(result.fee_sources.some(s => s.source_id === r.source_id));
  return result;
}

export async function sync(bundle, query, apply = false) {
  const [state] = await query("SELECT version FROM fee_import_state WHERE id='active'");
  assert(state?.version, 'Active version missing');
  const previous = {};
  for (const table of tables) previous[table] = await query(`SELECT * FROM ${table} WHERE import_version=?`,[state.version]);
  const roster = await query('SELECT student_id,class_room FROM student_roster');
  // Include the active content in the version identity: re-running identical
  // inputs is a no-op, while later term imports can still be carried forward.
  const sameSource = previous.fee_sources.filter(s => s.source_id.startsWith('live:'));
  const fingerprint = createHash('sha256').update(JSON.stringify({source:bundle.version, previous:state.version})).digest('hex').slice(0,20);
  const version = `arrears-live-${fingerprint}`;
  const next = buildSnapshot(bundle,previous,roster,version);
  const comparable = (table,rows) => rows.map(r => columns[table].filter(c => !['id','import_version'].includes(c)).map(c => r[c]))
    .sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (sameSource.length && tables.every(t => JSON.stringify(comparable(t,next[t])) === JSON.stringify(comparable(t,previous[t])))) {
    return 'No changes: authoritative balances and preserved terms already match.';
  }
  const summary = `Validated ${bundle.records.length} source records; source total ${bundle.records.reduce((n,r)=>n+r.total_cents,0)/100} THB; ` +
    `${next.fee_entries.length} staged fee rows; ${bundle.pending_roster_rows} new-student rows pending separate account review.`;
  if (!apply) return `PREVIEW ONLY. ${summary} No database writes.`;
  assert.notEqual(version,state.version);
  for (const table of ['fee_entries','fee_reports','fee_sources']) await query(`DELETE FROM ${table} WHERE import_version=?`,[version]);
  for (const table of tables) {
    const cols = columns[table], size = Math.floor(90/cols.length);
    for (let i=0;i<next[table].length;i+=size) {
      const group = next[table].slice(i,i+size);
      await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ` + group.map(()=>'('+cols.map(()=>'?').join(',')+')').join(','),group.flatMap(r=>cols.map(c=>r[c])));
    }
    const actual = await query(`SELECT * FROM ${table} WHERE import_version=?`,[version]);
    const normalize = rows => rows.map(r=>cols.map(c=>r[c])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.deepEqual(normalize(actual),normalize(next[table]),'Staged rows differ from validated input');
  }
  await query("UPDATE fee_import_state SET version=? WHERE id='active' AND version=?",[version,state.version]);
  assert.equal((await query("SELECT version FROM fee_import_state WHERE id='active'"))[0]?.version,version,'Active version changed concurrently');
  return `Import saved, verified and activated. ${summary}`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const path = process.argv[2];
  assert(path && !path.startsWith('--'), 'Pass a validated JSON bundle path');
  const token = process.env.CLOUDFLARE_D1_API_TOKEN?.trim();
  assert(token, 'CLOUDFLARE_D1_API_TOKEN is missing');
  const query = async (sql,params=[]) => {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query', {
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`D1 HTTP ${response.status}; check token expiry and D1 Edit permission`);
    const data = await response.json();
    assert(data.success && Array.isArray(data.result) && data.result.every(r=>r.success),'D1 query failed');
    return data.result.flatMap(r=>r.results??[]);
  };
  const input = JSON.parse(await readFile(path,'utf8'));
  const bundle = process.argv.includes('--encrypted') ? openBundle(input,process.env.ROSTER_CREDENTIAL_KEY) : input;
  const summary = await sync(bundle,query,apply);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Validation errors may contain data; log only fixed diagnostic categories.
    console.error(error.message.startsWith('D1 HTTP ') ? error.message : 'Tuition sync failed. Check source validation, configured D1 secret and staged verification. No personal data logged.');
    process.exitCode=1;
  });
}
