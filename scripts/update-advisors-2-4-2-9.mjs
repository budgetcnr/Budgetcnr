import assert from 'node:assert/strict';
import {readFile, appendFile} from 'node:fs/promises';
const token=process.env.CLOUDFLARE_D1_API_TOKEN;
assert(token,'Missing D1 token');
async function query(sql,params=[]) {
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();
 assert(response.ok&&data.success&&data.result.every(r=>r.success),'D1 request failed');
 return data.result.flatMap(r=>r.results||[]);
}
const target='person-d34111c3f738edd7fb0c', retained='person-042bba5db7087bddbd33';
const teachers=await query('SELECT id,full_name,login_enabled FROM teacher_roster WHERE id IN (?,?) ORDER BY id',[retained,target]);
assert.deepEqual(teachers,[{id:retained,full_name:'นางสาววิมลมาศ ฟูบินทร์',login_enabled:1},{id:target,full_name:'นางสาวณัฏชนากานต์ อิทธิวิวัฒนกุล',login_enabled:1}]);
const roomSql="SELECT class_room,teacher_id FROM teacher_advisory_rooms WHERE class_room IN ('ม.2/4','ม.2/9') ORDER BY class_room,teacher_id";
const before=await query(roomSql);
assert(before.some(r=>r.class_room==='ม.2/4'&&r.teacher_id===retained),'Missing retained advisor');
const allowed={'ม.2/4':[retained,target],'ม.2/9':['person-163397cd580879c10c5c','person-c4ab035e1989704eb4f6',target]};
assert(before.every(r=>allowed[r.class_room].includes(r.teacher_id)),'Unexpected assignments; stopped before changes');
const otherSql="SELECT * FROM teacher_advisory_rooms WHERE class_room NOT IN ('ม.2/4','ม.2/9') ORDER BY id";
const others=await query(otherSql);
await query(await readFile(new URL('../cloudflare/update-advisors-2-4-2-9.sql',import.meta.url),'utf8'));
assert.deepEqual(await query(roomSql),[{class_room:'ม.2/4',teacher_id:retained},{class_room:'ม.2/9',teacher_id:target}]);
assert.deepEqual(await query(otherSql),others);
const summary='Verified: ม.2/4 — นางสาววิมลมาศ ฟูบินทร์; ม.2/9 — นางสาวณัฏชนากานต์ อิทธิวิวัฒนกุล. Other rooms unchanged.\n';
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
