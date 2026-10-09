import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join(""); }
export async function passwordHash(id: string, password: string, salt: string) {
  if (!env.ROSTER_CREDENTIAL_KEY) throw new Error("Credentials unavailable");
  const key = await crypto.subtle.importKey("raw", encoder.encode(`${env.ROSTER_CREDENTIAL_KEY}:${id}:${password}`), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",iterations:100000,salt:encoder.encode(salt)},key,256));
}
export async function encodePassword(id: string, password: string) {
  const salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return `v1$${salt}$${await passwordHash(id,password,salt)}`;
}
export async function checkPassword(id: string, password: string, stored: string) {
  const [version,salt,expected]=stored.split("$");
  const actual=await passwordHash(id,password,version === "v1" && salt ? salt : "invalid-account-padding");
  let diff=actual.length ^ (expected?.length ?? 0);
  for(let i=0;i<actual.length;i++) diff|=actual.charCodeAt(i) ^ (expected?.charCodeAt(i) ?? 0);
  return version === "v1" && diff === 0;
}
// Atomic, durable per-account limit. Never log identifiers, passwords or hashes.
export async function allowLogin(kind: string, id: string) {
  const now=Math.floor(Date.now()/1000);
  const key=hex(await crypto.subtle.digest("SHA-256",encoder.encode(`${kind}:${id}`)));
  const row=await getRawDb().prepare(`INSERT INTO login_attempts (id,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`)
    .bind(key,now+900,now,now).first<{count:number}>();
  return Boolean(row && row.count<=10);
}
