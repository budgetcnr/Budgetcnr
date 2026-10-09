import {readFile,appendFile} from 'node:fs/promises';
import {createDecipheriv,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const origin='https://budgetcnr.budget-cnr.workers.dev';
let stage='deployment readiness';
try{
 let ready=false;
 for(let i=0;i<24;i++){
  try{
   const page=await fetch(origin+'/tuition/',{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(page.ok&&(await page.text()).includes('d1-migration-20261009')){
    const r=await fetch(origin+'/tuition/api/health',{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(r.ok&&(await r.json()).ready){ready=true;break;}
   }
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 if(!ready)throw Error('not ready');
 console.log('Deployed tuition page, D1 connection and runtime secret are ready.');
 stage='decrypt smoke tests';
 const e=JSON.parse(await readFile(new URL('../cloudflare/tuition-smoke.enc.json',import.meta.url),'utf8'));
 const secret=process.env.ROSTER_CREDENTIAL_KEY?.trim();if(!secret)throw Error('missing secret');
 const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));
 const cases=JSON.parse(gunzipSync(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()])).toString());
 for(const test of cases){
  stage='real '+test.kind+' login';
  const path=test.kind==='student'?'student-check':'check';
  const r=await fetch(origin+'/tuition/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(test.payload),signal:AbortSignal.timeout(30000)});
  assert.equal(r.headers.get('cache-control'),'no-store');
  if(test.kind==='disabled'){assert.equal(r.status,401);console.log('Disabled account rejected.');continue;}
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.demo,false);
  if(test.kind==='student'){
   assert.equal(data.student.studentId,test.expectedId);
   if(test.expectedPaid){assert.equal(data.reportedTotal,0);assert.equal(data.paymentConfirmed,true);assert.equal(data.chargesAvailable,true);}
  }else{
   assert.equal(data.students.length,test.expectedCount);
   assert(data.students.every(s=>test.expectedRooms.includes(s.classRoom)));
   if(test.expectedPaid)assert(data.students.every(s=>s.chargesAvailable&&s.reportedTotal===0));
  }
  console.log('Real '+test.kind+' login and permitted data verified.');
 }
 stage='method restrictions';
 const denied=await fetch(origin+'/tuition/api/check');assert.equal(denied.status,405);
 const summary='Production tuition verification passed: real student and teacher logins, M.1/M.4 paid confirmation, advisory-room isolation, disabled-account rejection, and no-store responses.\n';
 console.log(summary);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}catch{console.error('Production verification failed at: '+stage+'. Check Worker deployment, DB binding and runtime ROSTER_CREDENTIAL_KEY. No account identifiers or passwords are logged.');process.exitCode=1;}
