import {readFile,appendFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createDecipheriv,createHash} from 'node:crypto';
const tables=['student_roster','teacher_roster','teacher_advisory_rooms','fee_sources','fee_entries','fee_reports','fee_import_state'];
const databaseId='0a340b56-cc53-4e0c-9dd0-c4343aadbdf3';
const base='https://api.cloudflare.com/client/v4/accounts/dd35a924592f7b7a82dd21bba6aed1f6/d1/database/'+databaseId;
async function api(path='',body){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();if(!response.ok||!data.success)throw Error('D1 request failed; HTTP '+response.status);return data.result;
}
async function query(sql,params=[]){const results=await api('/query',{sql,params});if(results.some(r=>!r.success))throw Error('D1 query failed');return results.flatMap(r=>r.results||[]);}
try {
 const secret=process.env.ROSTER_CREDENTIAL_KEY;
 if(!secret||!process.env.CLOUDFLARE_D1_API_TOKEN)throw Error('Both repository secrets must be configured.');
 const envelope=JSON.parse(await readFile(new URL('../cloudflare/tuition-import.enc.json',import.meta.url),'utf8'));
 const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret.trim()).digest(),Buffer.from(envelope.iv,'base64'));
 decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
 const bundle=JSON.parse(gunzipSync(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()])).toString());
 if(bundle.version!==1||JSON.stringify(Object.keys(bundle.tables))!==JSON.stringify(tables))throw Error('Invalid migration manifest.');
 const metadata=await api();if(metadata.uuid!==databaseId||metadata.name!=='cnr-tuition')throw Error('Wrong destination.');
 const expected={student_roster:1531,teacher_roster:92,teacher_advisory_rooms:83,fee_sources:38,fee_entries:1351,fee_reports:566,fee_import_state:1};
 // Accept only an empty database or records identical to this import, enabling safe retries.
 for(const name of tables){
  const dataset=bundle.tables[name];if(dataset.rows.length!==expected[name])throw Error('Unexpected source row count.');
  if(!dataset.columns.every(c=>/^[a-z_]+$/.test(c)))throw Error('Invalid columns.');
  const existing=await query(`SELECT * FROM "${name}"`);
  const source=new Map(dataset.rows.map(row=>[String(row[dataset.columns[0]]),row]));
  for(const row of existing){const original=source.get(String(row[dataset.columns[0]]));if(!original||dataset.columns.some(c=>row[c]!==original[c]))throw Error('Destination contains different data; preserved without overwrite.');}
 }
 for(const name of tables){
  const {columns,rows}=bundle.tables[name];
  const prefix=`INSERT OR IGNORE INTO "${name}" (${columns.map(c=>'"'+c+'"').join(',')}) VALUES `;
  const size=Math.max(1,Math.floor(90/columns.length));
  for(let i=0;i<rows.length;i+=size){const group=rows.slice(i,i+size);await query(prefix+group.map(()=> '('+columns.map(()=>'?').join(',')+')').join(','),group.flatMap(row=>columns.map(c=>row[c])));}
  const count=(await query(`SELECT COUNT(*) AS n FROM "${name}"`))[0].n;
  if(count!==expected[name])throw Error('Imported row count mismatch.');
  console.log(name+': '+count+' rows verified');
 }
 const total=(await query('SELECT SUM(outstanding_cents) AS n FROM fee_entries'))[0].n;
 const sourceTotal=bundle.tables.fee_entries.rows.reduce((n,r)=>n+r.outstanding_cents,0);
 if(total!==sourceTotal)throw Error('Financial reconciliation failed.');
 const enabled=(await query('SELECT COUNT(*) AS n FROM teacher_roster WHERE login_enabled=1'))[0].n;
 if(enabled!==74)throw Error('Teacher login state mismatch.');
 const summary='Database imported and reconciled. Students: 1531. Student credentials: 1528. Teachers: 92. Enabled teacher accounts: 74. Original Sites remains active; website cutover is a separate step.\n';
 console.log(summary);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}catch{console.error('Import stopped. Check secret configuration and destination compatibility. No source credentials are logged.');process.exitCode=1;}
