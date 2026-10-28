import {readFile,appendFile} from 'node:fs/promises';
import {createDecipheriv,createHash,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
const version='arrears-sheet-20261028';
let stage='decrypt source';
try {
const secret=process.env.ROSTER_CREDENTIAL_KEY?.trim();assert(secret);
const e=JSON.parse(await readFile(new URL('../cloudflare/tuition-sheet-update.enc.json',import.meta.url),'utf8'));
const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));
const b=JSON.parse(gunzipSync(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()])).toString());
async function query(sql,params=[]) {
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success&&j.result.every(x=>x.success),'D1 failed');return j.result.flatMap(x=>x.results||[]);
}
async function insert(table,cols,rows) {for(let i=0;i<rows.length;i+=Math.floor(90/cols.length)){const group=rows.slice(i,i+Math.floor(90/cols.length));await query(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES `+group.map(()=> '('+cols.map(()=>'?').join(',')+')').join(','),group.flat());}}
stage='prepare versioned fee records';
assert.equal(b.records.length,532);
const rooms=[...new Set(b.records.map(r=>r.class_room))];
const sources=rooms.map(room=>{const records=b.records.filter(r=>r.class_room===room);return [`${version}:sheet:${room}`,`sheet:${room}`,version,room,'รวม 10 กย 69.xlsx',b.source_url,b.as_of,records.reduce((a,r)=>a+r.total_cents,0),records.length,1];});
const entries=[],reports=[];
for(const r of b.records){reports.push([`${version}:${r.student_id}`,r.student_id,version,`sheet:${r.class_room}`,r.total_cents,1,r.payment_note]);for(const t of r.entries)entries.push([`${version}:${r.student_id}:${t.year}:${t.semester}`,r.student_id,version,`sheet:${r.class_room}`,t.year,t.semester,r.class_room,'ยอดค้างค่าเทอม',t.outstanding_cents]);}
await insert('fee_sources',['id','source_id','import_version','class_room','title','url','as_of','total_cents','row_count','complete'],sources);
await insert('fee_reports',['id','student_id','import_version','source_id','total_cents','details_available','payment_note'],reports);
await insert('fee_entries',['id','student_id','import_version','source_id','academic_year','semester','class_room','item','outstanding_cents'],entries);
stage='apply source roster values';
for(const r of b.records)await query("INSERT INTO student_roster(student_id,full_name,class_room,roll_number,advisor,status,credential_hash,import_version) VALUES (?,?,?,?,'','กำลังศึกษา',NULL,?) ON CONFLICT(student_id) DO UPDATE SET full_name=excluded.full_name,class_room=excluded.class_room,roll_number=excluded.roll_number",[r.student_id,r.full_name,r.class_room,r.roll_number,version]);
let added=0;
for(const n of b.new_students){if(!n.student_id)continue;const room='ม.'+n.class_room;const hash=createHmac('sha256',secret).update(n.student_id+':'+n.national_id).digest('hex');await query('INSERT INTO student_roster(student_id,roll_number,full_name,class_room,advisor,status,credential_hash,import_version) VALUES (?,NULL,?,?,?, ?,?,?) ON CONFLICT(student_id) DO UPDATE SET full_name=excluded.full_name,class_room=excluded.class_room,credential_hash=excluded.credential_hash',[n.student_id,n.full_name,room,'','กำลังศึกษา',hash,version]);await insert('fee_reports',['id','student_id','import_version','source_id','total_cents','details_available','payment_note'],[[`${version}:${n.student_id}`,n.student_id,version,`sheet:${room}`,0,1,'ชำระแล้ว ตามใบเสร็จในชีท']]);added++;}
stage='verify import and activate';
const total=b.records.reduce((a,r)=>a+r.total_cents,0);
assert.equal((await query('SELECT SUM(total_cents) AS n FROM fee_sources WHERE import_version=?',[version]))[0].n,total);
assert.equal((await query('SELECT COUNT(*) AS n FROM fee_entries WHERE import_version=?',[version]))[0].n,entries.length);
await query("UPDATE fee_import_state SET version=? WHERE id='active'",[version]);
assert.equal((await query("SELECT version FROM fee_import_state WHERE id='active'"))[0].version,version);
const summary=`Sheet import active: ${b.records.length} arrears records; total ${total/100} THB; ${added} identified new student processed; 1 new student pending ID. Teacher accounts unchanged.\n`;console.log(summary);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}catch{console.error('Sheet import stopped at '+stage+'. No personal source data logged.');process.exitCode=1;}
