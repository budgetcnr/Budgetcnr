import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { createHmac, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';
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

const operation = 'cnr-jiraphas-password-update-20261029-v1';
assert(process.env.ROSTER_CREDENTIAL_KEY, 'Missing credential key');
const seed = createHmac('sha256', process.env.ROSTER_CREDENTIAL_KEY).update(operation).digest();
const receiverKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'), seed]), format:'der', type:'pkcs8' });

const envelope = {"publicKey":"MCowBQYDK2VuAyEAuI/5n/NnCVbjbutQBm6BZ2qOr0nASkx1s3Mm3sY2t0A=","iv":"lHqzk1q+UFDyHltt","tag":"nNM7pSk2K3Dyw4FDBhIK0Q==","data":"JwnuS9uQf1CBzp7/oyDi0+uyarihVNgB95ZlvvAwNmm5d+ecQFrOJc6wCJntl7uOVvpz8cY="};
const shared = diffieHellman({privateKey:receiverKey, publicKey:createPublicKey({key:Buffer.from(envelope.publicKey,'base64'),format:'der',type:'spki'})});
const key = Buffer.from(hkdfSync('sha256',shared,Buffer.alloc(0),operation,32));
const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString());
assert(/^\d{8}$/.test(payload.password),'Password format invalid; no changes made');
const personnelId='691573', fullName='จิรภาส พวงมะลัย', teacherId='person-jiraphas-691573', room='ม.2/3';
const originalVersion='jiraphas-account-20261029', resetVersion='jiraphas-password-20261029-v1';
const before=await query('SELECT * FROM teacher_roster ORDER BY id');
const matches=before.filter(t=>t.personnel_id===personnelId);
assert(matches.length===1 && matches[0].id===teacherId && matches[0].full_name===fullName && matches[0].login_enabled===1,'Account identity mismatch; no changes made');
const teacher=matches[0];
const advisoryBefore=await query('SELECT * FROM teacher_advisory_rooms ORDER BY id');
assert(JSON.stringify([...new Set(advisoryBefore.filter(a=>a.teacher_id===teacherId).map(a=>a.class_room))])===JSON.stringify([room]),'Advisory scope mismatch; no changes made');
const [version,salt,expected]=teacher.credential_hash.split('$');
const current=version==='v1' && salt && pbkdf2Sync(process.env.ROSTER_CREDENTIAL_KEY+':'+personnelId+':'+payload.password,salt,100000,32,'sha256').toString('hex')===expected;
let credential=teacher.credential_hash;
if(!current){
  assert(teacher.import_version===originalVersion,'Account changed since the requested update; no changes made');
  const newSalt=randomBytes(16).toString('hex');
  credential='v1$'+newSalt+'$'+pbkdf2Sync(process.env.ROSTER_CREDENTIAL_KEY+':'+personnelId+':'+payload.password,newSalt,100000,32,'sha256').toString('hex');
  await query('UPDATE teacher_roster SET credential_hash=?,import_version=? WHERE id=? AND personnel_id=? AND full_name=? AND credential_hash=? AND import_version=?',[credential,resetVersion,teacherId,personnelId,fullName,teacher.credential_hash,originalVersion]);
}
const after=await query('SELECT * FROM teacher_roster ORDER BY id');
const updated=after.find(t=>t.id===teacherId);
assert(updated && updated.credential_hash===credential && updated.login_enabled===1,'Credential update verification failed');
const expectedTeacher={...teacher,credential_hash:credential,...(!current?{import_version:resetVersion}:{})};
assert(JSON.stringify(updated)===JSON.stringify(expectedTeacher),'Unexpected account field change');
assert(JSON.stringify(after.filter(t=>t.id!==teacherId))===JSON.stringify(before.filter(t=>t.id!==teacherId)),'Other teachers changed');
assert(JSON.stringify(await query('SELECT * FROM teacher_advisory_rooms ORDER BY id'))===JSON.stringify(advisoryBefore),'Advisory assignments changed');
const response=await fetch('https://budgetcnr.budget-cnr.workers.dev/tuition/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teacherId:personnelId,password:payload.password}),signal:AbortSignal.timeout(60000)});
assert(response.status===200,'Production login failed; no credentials logged');
const result=await response.json();
assert(result.demo===false && result.teacher?.id===personnelId && result.teacher?.name===fullName && result.teacher?.classRoom===room,'Production identity mismatch');
assert(result.students?.length>0 && result.students.every(s=>s.classRoom===room),'Production advisory scope mismatch');
if(payload.previousPassword){
 const old=await fetch('https://budgetcnr.budget-cnr.workers.dev/tuition/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teacherId:personnelId,password:payload.previousPassword}),signal:AbortSignal.timeout(60000)});
 assert(old.status===401,'Previous password rejection not verified');
}
const summary='Jiraphas account 691573 password updated. Production login passed; advisory room ม.2/3 only; '+result.students.length+' students. Previous password rejected. Other teachers and rooms preserved. No passwords or hashes logged.\n';
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
