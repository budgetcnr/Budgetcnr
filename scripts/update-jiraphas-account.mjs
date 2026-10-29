import assert from 'node:assert/strict';
import {createHmac,createPrivateKey,createPublicKey} from 'node:crypto';
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

const account=await query('SELECT id,full_name,personnel_id,login_enabled FROM teacher_roster WHERE personnel_id=?',['691573']);
assert(account.length===1 && account[0].full_name==='จิรภาส พวงมะลัย' && account[0].login_enabled===1,'Account identity mismatch; no changes made');
const operation = 'cnr-jiraphas-password-update-20261029-v1';
assert(process.env.ROSTER_CREDENTIAL_KEY, 'Missing credential key');
const seed = createHmac('sha256', process.env.ROSTER_CREDENTIAL_KEY).update(operation).digest();
const receiverKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'), seed]), format:'der', type:'pkcs8' });

console.log('PASSWORD_RECEIVER_PUBLIC_KEY='+createPublicKey(receiverKey).export({format:'der',type:'spki'}).toString('base64'));
console.log('Password update recipient verified; no database changes made.');
