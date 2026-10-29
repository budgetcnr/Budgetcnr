import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
const token = process.env.CLOUDFLARE_D1_API_TOKEN;
assert(token, 'Missing D1 token');
const password = process.env.JIRAPHAS_NEW_PASSWORD;
const credentialKey = process.env.ROSTER_CREDENTIAL_KEY?.trim();
assert(password && /^\d{8}$/.test(password) && credentialKey, 'Missing secure password or credential key; no changes made');
async function query(sql, params = []) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  assert(response.ok && data.success && data.result.every(r => r.success), 'D1 request failed');
  return data.result.flatMap(r => r.results || []);
}
const rows = await query('SELECT id,full_name,login_enabled,length(credential_hash)>0 AS has_credential FROM teacher_roster WHERE personnel_id=?', ['691573']);
assert(rows.length === 1 && rows[0].full_name.includes('จิรภาส'), 'Account identity mismatch; no changes made');
const teacher = rows[0];
const salt = randomBytes(16).toString('hex');
const credentialHash = `v1$${salt}$${pbkdf2Sync(`${credentialKey}:691573:${password}`, salt, 100000, 32, 'sha256').toString('hex')}`;
const before = await query('SELECT * FROM teacher_advisory_rooms WHERE teacher_id<>? ORDER BY id', [teacher.id]);
// Preserve existing assignments while ensuring the confirmed room is present.
await query(`UPDATE teacher_roster SET login_enabled=1 WHERE personnel_id='691573' AND full_name LIKE '%จิรภาส%';
INSERT INTO teacher_advisory_rooms (id,teacher_id,class_room,source,import_version)
SELECT 'advisor-jiraphas-691573-2-3',id,'ม.2/3','user-confirmed-20261029','advisor-update-20261029'
FROM teacher_roster WHERE personnel_id='691573' AND full_name LIKE '%จิรภาส%'
AND NOT EXISTS (SELECT 1 FROM teacher_advisory_rooms a WHERE a.teacher_id=teacher_roster.id AND a.class_room='ม.2/3');`);
await query('UPDATE teacher_roster SET credential_hash=? WHERE id=? AND personnel_id=?', [credentialHash, teacher.id, '691573']);
const after = await query('SELECT login_enabled FROM teacher_roster WHERE id=?', [teacher.id]);
assert(after[0].login_enabled === 1);
assert((await query('SELECT id FROM teacher_advisory_rooms WHERE teacher_id=? AND class_room=?', [teacher.id, 'ม.2/3'])).length > 0);
assert.deepEqual(await query('SELECT * FROM teacher_advisory_rooms WHERE teacher_id<>? ORDER BY id', [teacher.id]), before);
const login = await fetch('https://budgetcnr.budget-cnr.workers.dev/tuition/api/check', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({teacherId:'691573',password}),signal:AbortSignal.timeout(60000)});
assert(login.status === 200, 'Password updated but production sign-in verification failed');
const result = await login.json();
assert(result.demo === false && result.teacher?.id === '691573' && result.teacher?.classRoom.includes('ม.2/3'), 'Unexpected production login result');
const summary = 'Verified account 691573: enabled; advisory room ม.2/3 assigned; password reset and production sign-in passed. Other advisors preserved. No credentials logged.\n';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
