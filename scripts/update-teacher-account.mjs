import assert from 'node:assert/strict';
import {readFile,appendFile} from 'node:fs/promises';
import {createDecipheriv,createHash} from 'node:crypto';
let stage='decrypt account update';
try {
const secret=process.env.ROSTER_CREDENTIAL_KEY?.trim();
assert(secret&&process.env.CLOUDFLARE_D1_API_TOKEN,'Missing secrets');
const e=JSON.parse(await readFile(new URL('../cloudflare/teacher-account-update.enc.json',import.meta.url),'utf8'));
const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));
const p=JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString());
assert.equal(p.teacherId,'person-55b13cf977ab670f898c');
async function query(sql,params=[]) {
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000)});
 const result=await response.json();assert(response.ok&&result.success&&result.result.every(r=>r.success),'D1 request failed');
 return result.result.flatMap(r=>r.results||[]);
}
stage='validate current account';
const before=await query('SELECT id,full_name,personnel_id FROM teacher_roster WHERE id=?',[p.teacherId]);
assert.equal(before.length,1);assert.equal(before[0].full_name,p.fullName);
assert(before[0].personnel_id===null||before[0].personnel_id===p.personnelId,'Unexpected existing personnel ID');
assert.equal((await query('SELECT id FROM teacher_roster WHERE personnel_id=? AND id<>?',[p.personnelId,p.teacherId])).length,0);
const rooms=await query('SELECT class_room FROM teacher_advisory_rooms WHERE teacher_id=? ORDER BY class_room',[p.teacherId]);
assert.deepEqual(rooms,[{class_room:p.expectedRoom}]);
stage='update account';
await query('UPDATE teacher_roster SET personnel_id=?,credential_hash=?,login_enabled=1 WHERE id=? AND full_name=? AND (personnel_id IS NULL OR personnel_id=?)',[p.personnelId,p.credentialHash,p.teacherId,p.fullName,p.personnelId]);
const after=await query('SELECT personnel_id,credential_hash,login_enabled FROM teacher_roster WHERE id=?',[p.teacherId]);
assert.deepEqual(after,[{personnel_id:p.personnelId,credential_hash:p.credentialHash,login_enabled:1}]);
assert.deepEqual(await query('SELECT class_room FROM teacher_advisory_rooms WHERE teacher_id=? ORDER BY class_room',[p.teacherId]),rooms);
stage='production login';
const response=await fetch('https://budgetcnr.budget-cnr.workers.dev/tuition/api/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({teacherId:p.personnelId,password:p.password}),signal:AbortSignal.timeout(60000)});
assert.equal(response.status,200);const result=await response.json();assert.equal(result.demo,false);assert(result.students.length>0);assert(result.students.every(s=>s.classRoom===p.expectedRoom));
const summary='Teacher account updated and enabled. Production login passed; access restricted to confirmed advisory room. Password and credential hash are not logged.\n';console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}catch {console.error('Account update stopped at stage: '+stage+'. No credentials logged.');process.exitCode=1;}
