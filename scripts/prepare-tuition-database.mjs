import { readFile, appendFile } from 'node:fs/promises';

const accountId = 'dd35a924592f7b7a82dd21bba6aed1f6';
const databaseId = '0a340b56-cc53-4e0c-9dd0-c4343aadbdf3';
const expectedTables = ['fee_entries','fee_import_state','fee_reports','fee_sources','login_attempts','student_roster','teacher_advisory_rooms','teacher_roster'];
const token = process.env.CLOUDFLARE_D1_API_TOKEN;
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;

async function api(path = '', body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    // Do not print raw responses: only documented numeric API errors.
    const codes = (payload.errors || []).map(e => Number(e.code)).filter(Number.isFinite).join(',');
    throw new Error(`Cloudflare request failed (HTTP ${response.status}; codes ${codes || 'unknown'}). Check D1 Edit permission, selected account and token expiry.`);
  }
  return payload.result;
}
async function query(sql) {
  const result = await api('/query', { sql });
  if (!Array.isArray(result) || result.some(r => !r.success)) throw new Error('D1 query failed. Database was not verified.');
  return result.flatMap(r => r.results || []);
}

try {
  if (!token) throw new Error('Add the CLOUDFLARE_D1_API_TOKEN repository secret before running this workflow.');
  const metadata = await api();
  if (metadata.name !== 'cnr-tuition' || metadata.uuid !== databaseId) throw new Error('Destination database identity mismatch; no schema changes made.');
  let tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name");
  if (!tables.length) {
    const schema = await readFile(new URL('../cloudflare/tuition-schema.sql', import.meta.url), 'utf8');
    await query(schema);
    tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name");
    console.log('Initialized tuition schema in the empty destination database.');
  } else {
    console.log('Destination already contains tables; schema creation skipped.');
  }
  if (JSON.stringify(tables.map(r => r.name).sort()) !== JSON.stringify(expectedTables)) throw new Error('Destination schema does not match all eight tuition tables. Existing tables were preserved.');
  const counts = [];
  for (const name of expectedTables) {
    const rows = await query(`SELECT COUNT(*) AS count FROM "${name}"`);
    counts.push({ name, count: Number(rows[0].count) });
  }
  const lines = counts.map(r => `| ${r.name} | ${r.count} |`).join('\n');
  const summary = `## Tuition database preparation\n\nDestination: cnr-tuition\n\nD1 access verified. All eight tables exist.\n\n| Table | Rows |\n| --- | ---: |\n${lines}\n\nThis workflow prepares the schema only. It does not copy data, transfer login secrets or switch the website away from Sites.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
