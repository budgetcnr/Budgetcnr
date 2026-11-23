import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicTransferKey,sealBundle,openBundle} from '../scripts/tuition-transfer.mjs';
const secret='synthetic test key only; never a production credential';
const bundle={student_id:'10001',total_cents:12345,version:'synthetic'};
test('public key encrypts and existing secret decrypts',()=>{
  const key=publicTransferKey(secret),encrypted=sealBundle(bundle,key);
  assert.deepEqual(openBundle(encrypted,secret),bundle);
  assert(!JSON.stringify(encrypted).includes('10001'));
  assert(!JSON.stringify(key).includes(secret));
});
test('wrong secret fails closed',()=>{
  const e=sealBundle(bundle,publicTransferKey(secret));
  assert.throws(()=>openBundle(e,'another test key'));
});
test('tampered ciphertext, tag, nonce, salt and ephemeral key are rejected',()=>{
  const original=sealBundle(bundle,publicTransferKey(secret));
  for(const field of ['data','tag','iv','salt','ephemeral_public_key']){
    const e={...original},bytes=Buffer.from(e[field],'base64');bytes[bytes.length-1]^=1;e[field]=bytes.toString('base64');
    assert.throws(()=>openBundle(e,secret));
  }
});
test('wrong public key metadata and formats are rejected',()=>{
  const key=publicTransferKey(secret);
  assert.throws(()=>sealBundle(bundle,{...key,key_id:'wrong'}));
  const e=sealBundle(bundle,key);assert.throws(()=>openBundle({...e,format:'unknown'},secret));
});
test('each transfer has fresh encryption randomness',()=>{
  const key=publicTransferKey(secret),a=sealBundle(bundle,key),b=sealBundle(bundle,key);
  assert.notEqual(a.data,b.data);assert.notEqual(a.ephemeral_public_key,b.ephemeral_public_key);
  assert.deepEqual(openBundle(a,secret),openBundle(b,secret));
});
