import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildSnapshot, sync } from '../scripts/sync-tuition-sheet.mjs';

const version = 'arrears-live-0123456789abcdef0123';
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../cloudflare/tuition-schema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO fee_import_state VALUES ('active','previous');
    INSERT INTO fee_sources VALUES ('previous:old','old','previous','ม.2/1','test','https://example.test','2026-11-05',70000,1,1);
    INSERT INTO student_roster VALUES ('10001',1,'Synthetic A','ม.2/1','','กำลังศึกษา','unchanged','old');
    INSERT INTO student_roster VALUES ('10002',2,'Synthetic B','ม.2/1','','กำลังศึกษา','unchanged','old');
    INSERT INTO fee_entries VALUES ('a','10001','previous','old',2569,1,'ม.1/1','test',20000);
    INSERT INTO fee_entries VALUES ('b','10001','previous','old',2569,2,'ม.2/1','test',30000);
    INSERT INTO fee_entries VALUES ('c','10002','previous','old',2569,1,'ม.1/1','test',20000);
    INSERT INTO fee_reports VALUES ('previous:10001','10001','previous','old',50000,1,'');
    INSERT INTO fee_reports VALUES ('previous:10002','10002','previous','old',20000,1,'');`);
  let writes=0;
  const query = async (sql,params=[]) => {
    if (/^(SELECT|WITH)\b/.test(sql)) return db.prepare(sql).all(...params).map(r=>({...r}));
    writes++;
    db.prepare(sql).run(...params);
    return [];
  };
  const bundle = {version,as_of:'2026-09-10',source_url:'https://example.test',pending_roster_rows:1,
    coverage:[{class_room:'ม.2/1',terms:[[2569,1]]}],records:[{student_id:'10001',class_room:'ม.2/1',total_cents:10000,
      details_available:1,entries:[{academic_year:2569,semester:1,outstanding_cents:10000}]}]};
  return {db,query,bundle,writes:()=>writes};
}

test('preview performs no writes',async()=>{
  const f=fixture();assert.match(await sync(f.bundle,f.query),/PREVIEW ONLY/);assert.equal(f.writes(),0);f.db.close();
});
test('apply replaces covered history, clears omitted arrears and preserves term 2 and credentials',async()=>{
  const f=fixture();assert.match(await sync(f.bundle,f.query,true),/saved, verified/);
  const [{version:active}]=await f.query("SELECT version FROM fee_import_state WHERE id='active'");
  const reports=await f.query('SELECT student_id,total_cents FROM fee_reports WHERE import_version=? ORDER BY student_id',[active]);
  assert.deepEqual(reports,[{student_id:'10001',total_cents:40000},{student_id:'10002',total_cents:0}]);
  assert.equal((await f.query('SELECT outstanding_cents FROM fee_entries WHERE import_version=? AND semester=2',[active]))[0].outstanding_cents,30000);
  assert.equal((await f.query('SELECT credential_hash FROM student_roster'))[0].credential_hash,'unchanged');
  const count=f.writes();assert.match(await sync(f.bundle,f.query,true),/No changes/);assert.equal(f.writes(),count);f.db.close();
});
test('failed staging never activates a partial import',async()=>{
  const f=fixture();let inserts=0;
  await assert.rejects(sync(f.bundle,async(sql,p)=>{
    if(sql.startsWith('INSERT')&&++inserts===2)throw Error('simulated outage');return f.query(sql,p);
  },true));
  assert.equal((await f.query("SELECT version FROM fee_import_state WHERE id='active'"))[0].version,'previous');
  assert.match(await sync(f.bundle,f.query,true),/saved, verified/);f.db.close();
});
test('invalid, duplicate or inconsistent data is rejected before writes',async()=>{
  for(const mutate of [b=>b.records.push(b.records[0]),b=>b.records[0].total_cents=-1,b=>b.records[0].entries[0].outstanding_cents=4]){
    const f=fixture();mutate(f.bundle);await assert.rejects(sync(f.bundle,f.query,true));assert.equal(f.writes(),0);f.db.close();
  }
});
test('staged corruption is detected before activation',async()=>{
  const f=fixture();let inserted=false;
  await assert.rejects(sync(f.bundle,async(sql,p)=>{
    const result=await f.query(sql,p);
    if(sql.startsWith('INSERT INTO fee_reports'))inserted=true;
    if(inserted&&sql.startsWith('SELECT * FROM fee_reports'))result[0].total_cents++;
    return result;
  },true));
  assert.equal((await f.query("SELECT version FROM fee_import_state WHERE id='active'"))[0].version,'previous');f.db.close();
});
test('concurrent activation is not overwritten',async()=>{
  const f=fixture();await assert.rejects(sync(f.bundle,async(sql,p)=>{
    if(sql.startsWith('UPDATE fee_import_state'))await f.query("UPDATE fee_import_state SET version='concurrent' WHERE id='active'");
    return f.query(sql,p);
  },true));
  assert.equal((await f.query("SELECT version FROM fee_import_state WHERE id='active'"))[0].version,'concurrent');f.db.close();
});
test('newer authoritative source dates cannot be rolled back',async()=>{
  const f=fixture();await sync(f.bundle,f.query,true);f.bundle.as_of='2026-09-09';
  const count=f.writes();await assert.rejects(sync(f.bundle,f.query,true));assert.equal(f.writes(),count);f.db.close();
});
