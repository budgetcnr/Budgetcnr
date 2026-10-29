import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { randomInt, randomBytes, pbkdf2Sync, publicEncrypt, constants } from 'node:crypto';

const personnelId = '691573';
const fullName = 'จิรภาส พวงมะลัย';
const room = 'ม.2/3';
const newId = 'person-jiraphas-691573';
const version = 'jiraphas-account-20261029';
const deliveryPublicKey = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqhjko5oKj7pqLXo2hswD\nQbJrR1ttTN8hu8KotZLA1jlvhWiAaHxkeiP1Qi/aHWHgQdyb6ZqenaaWAkhayptK\nrnt3qGocPQqhIZ3tgg2J7FmeadsOo5ynO/rB9/z88rebva4WHBB+2Q8meV/uWhu2\nwY5DBPCJx6ZtvmpQTfEc2+8cCE5+3WLIyLFOch0SfE1F1tCIuTRFcUyVxYW1RmjZ\n9XrS/mCRSXwAfRUIoPoSWbVSKueJ8dXE4UiW99G1r3U2PGyGddRvptQx0PZQW4+j\nptIJDMxn7jp8zYT0RdZs5MxBdtN4xc6+7pGD05eemKhtLJP9aEVSI4AAVWMPZrYJ\nzwIDAQAB\n-----END PUBLIC KEY-----\n";
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
const snapshot = await query('SELECT * FROM teacher_roster ORDER BY id');
const names = snapshot.filter(t => t.full_name.replace(/^(นาย|นางสาว|นาง)\s*/, '').trim() === fullName);
const owners = snapshot.filter(t => t.personnel_id === personnelId);
assert(names.length <= 1 && owners.length <= 1, 'Ambiguous account identity; no changes made');
assert(!owners.length || names.some(t => t.id === owners[0].id), 'Personnel ID belongs to another teacher; no changes made');
assert(!names.length || names[0].personnel_id === personnelId, 'Existing teacher has a different personnel ID; no changes made');
const advisoryBefore = await query('SELECT * FROM teacher_advisory_rooms ORDER BY id');
let teacher = names[0];
let password;
let credential;
if (!teacher) {
  assert(process.env.ROSTER_CREDENTIAL_KEY, 'Missing credential key; no changes made');
  password = String(randomInt(10000000, 100000000));
  const salt = randomBytes(16).toString('hex');
  credential = 'v1$' + salt + '$' + pbkdf2Sync(process.env.ROSTER_CREDENTIAL_KEY + ':' + personnelId + ':' + password, salt, 100000, 32, 'sha256').toString('hex');
  const encrypted = publicEncrypt({ key: deliveryPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(password)).toString('base64');
  // Only this session's private delivery key can recover the generated password.
  console.log('ENCRYPTED_ACCOUNT_PASSWORD=' + encrypted);
  await query('INSERT INTO teacher_roster (id,full_name,department,position_number,rank,personnel_id,credential_hash,source_url,source_academic_year,import_version,login_enabled) VALUES (?,?,?,NULL,?,?,?,?,?,?,0)', [newId, fullName, '', '', personnelId, credential, 'user-confirmed:2026-10-29', 2569, version]);
  teacher = { id: newId, full_name: fullName, personnel_id: personnelId, credential_hash: credential, login_enabled: 0 };
} else {
  assert(teacher.login_enabled === 1 && teacher.credential_hash.startsWith('v1$'), 'Existing account requires separate credential setup; existing password preserved');
}
const ownRooms = advisoryBefore.filter(a => a.teacher_id === teacher.id);
assert(ownRooms.every(a => a.class_room === room), 'Unexpected existing advisory room; account not enabled');
await query('INSERT INTO teacher_advisory_rooms (id,teacher_id,class_room,source,import_version) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM teacher_advisory_rooms WHERE teacher_id=? AND class_room=?)', ['advisor-jiraphas-691573-2-3', teacher.id, room, 'user-confirmed:2026-10-29', version, teacher.id, room]);
await query('UPDATE teacher_roster SET login_enabled=1 WHERE id=? AND personnel_id=? AND full_name=? AND credential_hash=?', [teacher.id, personnelId, teacher.full_name, teacher.credential_hash]);
const after = await query('SELECT * FROM teacher_roster ORDER BY id');
const updated = after.find(t => t.id === teacher.id);
assert(updated && updated.login_enabled === 1 && updated.personnel_id === personnelId, 'Account verification failed');
assert(updated.credential_hash === teacher.credential_hash, 'Credential changed unexpectedly');
assert(JSON.stringify(after.filter(t => t.id !== teacher.id)) === JSON.stringify(snapshot.filter(t => t.id !== teacher.id)), 'Other teacher records changed');
const advisoryAfter = await query('SELECT * FROM teacher_advisory_rooms ORDER BY id');
assert(JSON.stringify(advisoryAfter.filter(a => a.teacher_id !== teacher.id)) === JSON.stringify(advisoryBefore.filter(a => a.teacher_id !== teacher.id)), 'Other advisors changed');
assert.deepEqual([...new Set(advisoryAfter.filter(a => a.teacher_id === teacher.id).map(a => a.class_room))], [room], 'Advisory scope mismatch');
if (password) {
  const response = await fetch('https://budgetcnr.budget-cnr.workers.dev/tuition/api/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId: personnelId, password }), signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, 'Production login failed; account was stored, inspect before retrying');
  const result = await response.json();
  assert.equal(result.demo, false);
  assert.equal(result.teacher.id, personnelId);
  assert.equal(result.teacher.name, fullName);
  assert.equal(result.teacher.classRoom, room);
  assert(Array.isArray(result.students) && result.students.length > 0 && result.students.every(s => s.classRoom === room), 'Production advisory scope failed');
  console.log('Production login passed. Student count: ' + result.students.length + '; advisory room: ' + room);
}
const summary = 'Verified Jiraphas Phuangmalai: account 691573 enabled; advisory room ม.2/3 only. Other teachers and advisors preserved. Existing credentials are never reset.\n';
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
