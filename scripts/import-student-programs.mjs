import {readFile} from 'node:fs/promises';
import {createDecipheriv,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const e=JSON.parse(await readFile(new URL('../cloudflare/student-programs.enc.json',import.meta.url),'utf8'));
const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(process.env.ROSTER_CREDENTIAL_KEY.trim()).digest(),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));
const rows=JSON.parse(gunzipSync(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()])).toString());
async function query(sql,params=[]) {
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params})});const j=await r.json();assert(r.ok&&j.success&&j.result.every(r=>r.success),'D1 import failed');return j.result.flatMap(r=>r.results||[]);
}
await query('CREATE TABLE IF NOT EXISTS student_programs (student_id TEXT PRIMARY KEY NOT NULL,study_program TEXT NOT NULL,current_room TEXT NOT NULL,term1_room TEXT,class_history TEXT NOT NULL)');
for(let i=0;i<rows.length;i+=18){const batch=rows.slice(i,i+18);await query('INSERT OR REPLACE INTO student_programs(student_id,study_program,current_room,term1_room,class_history) VALUES '+batch.map(()=>'(?,?,?,?,?)').join(','),batch.flatMap(r=>[r.student_id,r.study_program,r.current_room,r.term1_room,JSON.stringify(r.class_history)]));}
await query('UPDATE student_roster SET class_room=(SELECT current_room FROM student_programs p WHERE p.student_id=student_roster.student_id) WHERE student_id IN (SELECT student_id FROM student_programs)');
const actual=await query('SELECT student_id,study_program,current_room,class_history FROM student_programs');
const byId=new Map(actual.map(r=>[r.student_id,r]));assert(rows.every(r=>byId.get(r.student_id)?.study_program===r.study_program&&byId.get(r.student_id)?.current_room===r.current_room));
assert(rows.every(r=>JSON.stringify(JSON.parse(byId.get(r.student_id).class_history))===JSON.stringify(r.class_history)));
console.log('Imported '+rows.length+' study programs and verified confirmed classroom history. Fee amounts and credentials unchanged.');
