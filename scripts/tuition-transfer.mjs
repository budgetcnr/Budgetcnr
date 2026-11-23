import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync,
  diffieHellman, hkdfSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const format = 'cnr-tuition-x25519-aes256gcm-v1';
const context = Buffer.from(format);
const maximumBytes = 2 * 1024 * 1024;
function privateKey(secret) {
  assert(typeof secret === 'string' && secret.trim().length > 0, 'Missing repository secret');
  // Domain separation avoids reusing the legacy AES key as an X25519 key.
  const raw = createHash('sha256').update('cnr-tuition-transfer-private:v1\0').update(secret.trim()).digest();
  return createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'),raw]),format:'der',type:'pkcs8'});
}
const keyId = der => createHash('sha256').update(der).digest('hex');
export function publicTransferKey(secret) {
  const key = createPublicKey(privateKey(secret)).export({format:'der',type:'spki'});
  return {format,key_id:keyId(key),public_key:key.toString('base64')};
}
function parsePublic(key) {
  assert.equal(key.format,format);
  const der = Buffer.from(key.public_key,'base64');
  assert.equal(keyId(der),key.key_id);
  const publicKey = createPublicKey({key:der,format:'der',type:'spki'});
  assert.equal(publicKey.asymmetricKeyType,'x25519');
  return publicKey;
}
function symmetricKey(privatePart,publicPart,salt) {
  return hkdfSync('sha256',diffieHellman({privateKey:privatePart,publicKey:publicPart}),salt,context,32);
}
export function sealBundle(bundle,recipient) {
  const plaintext = Buffer.from(JSON.stringify(bundle));
  assert(plaintext.length > 0 && plaintext.length <= maximumBytes);
  const {privateKey:ephemeral,publicKey} = generateKeyPairSync('x25519');
  const salt = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',symmetricKey(ephemeral,parsePublic(recipient),salt),iv);
  cipher.setAAD(context);
  const data = Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return {format,recipient_key_id:recipient.key_id,
    ephemeral_public_key:publicKey.export({format:'der',type:'spki'}).toString('base64'),
    salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function openBundle(envelope,secret) {
  assert.equal(envelope.format,format);
  assert.equal(envelope.recipient_key_id,publicTransferKey(secret).key_id,'Refresh public transfer key after secret rotation');
  const sender = parsePublic({format,key_id:keyId(Buffer.from(envelope.ephemeral_public_key,'base64')),public_key:envelope.ephemeral_public_key});
  const salt = Buffer.from(envelope.salt,'base64'), iv = Buffer.from(envelope.iv,'base64'), tag = Buffer.from(envelope.tag,'base64');
  const data = Buffer.from(envelope.data,'base64');
  assert(salt.length === 32 && iv.length === 12 && tag.length === 16 && data.length <= maximumBytes);
  const decipher = createDecipheriv('aes-256-gcm',symmetricKey(privateKey(secret),sender,salt),iv);
  decipher.setAAD(context);decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
async function main() {
  if (process.argv[2] === 'public-key') {
    const publicKey = JSON.stringify(publicTransferKey(process.env.ROSTER_CREDENTIAL_KEY));
    console.log(publicKey);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      'Public tuition transfer key (safe to copy):\n\n```json\n'+publicKey+'\n```\n');
  } else if (process.argv[2] === 'seal') {
    const [, , , keyPath,bundlePath,outputPath] = process.argv;
    assert(keyPath && bundlePath && outputPath);
    const recipient = JSON.parse(await readFile(keyPath,'utf8'));
    const bundle = JSON.parse(await readFile(bundlePath,'utf8'));
    await writeFile(outputPath,JSON.stringify(sealBundle(bundle,recipient))+'\n',{mode:0o600});
    console.log('Encrypted transfer written. No private key needed and no personal data logged.');
  } else throw Error('Choose public-key or seal');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('Tuition transfer failed. Check inputs and repository secret. No private data logged.');process.exitCode=1;});
}
