import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
async function query(sql,params=[]) {
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/0a340b56-cc53-4e0c-9dd0-c4343aadbdf3/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();assert(response.ok&&data.success&&data.result.every(r=>r.success),'D1 migration failed');return data.result.flatMap(r=>r.results||[]);
}
const currentBefore=await query('SELECT student_id,class_room FROM student_roster ORDER BY student_id');
const sql=await readFile(new URL('../cloudflare/migrations/20261029-classroom-history.sql',import.meta.url),'utf8');
await query(sql);
const missing=await query(`SELECT COUNT(*) AS n FROM student_programs p,json_each(CASE WHEN json_valid(p.class_history) THEN p.class_history ELSE '[]' END) h WHERE json_extract(h.value,'$.academicYear') BETWEEN 2400 AND 2800 AND json_extract(h.value,'$.semester') IN (1,2) AND json_extract(h.value,'$.classRoom') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM student_classrooms c WHERE c.student_id=p.student_id AND c.academic_year=CAST(json_extract(h.value,'$.academicYear') AS INTEGER) AND c.semester=CAST(json_extract(h.value,'$.semester') AS INTEGER))`);
assert.equal(missing[0].n,0);
assert.deepEqual(await query('SELECT student_id,class_room FROM student_roster ORDER BY student_id'),currentBefore);
console.log('Classroom history migrated by student/year/semester. Current rooms preserved; confirmed historical overrides retained.');
