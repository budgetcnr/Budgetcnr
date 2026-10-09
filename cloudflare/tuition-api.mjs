// tuition-src/app/api/check/route.ts
import { env as env3 } from "cloudflare:workers";

// tuition-src/db/index.ts
import { env } from "cloudflare:workers";
function getRawDb() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}

// tuition-src/lib/teacher-auth.ts
import { env as env2 } from "cloudflare:workers";
var encoder = new TextEncoder();
function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(id, password, salt) {
  if (!env2.ROSTER_CREDENTIAL_KEY) throw new Error("Credentials unavailable");
  const key = await crypto.subtle.importKey("raw", encoder.encode(`${env2.ROSTER_CREDENTIAL_KEY}:${id}:${password}`), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 1e5, salt: encoder.encode(salt) }, key, 256));
}
async function checkPassword(id, password, stored) {
  const [version, salt, expected] = stored.split("$");
  const actual = await passwordHash(id, password, version === "v1" && salt ? salt : "invalid-account-padding");
  let diff = actual.length ^ (expected?.length ?? 0);
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ (expected?.charCodeAt(i) ?? 0);
  return version === "v1" && diff === 0;
}
async function allowLogin(kind, id) {
  const now = Math.floor(Date.now() / 1e3);
  const key = hex(await crypto.subtle.digest("SHA-256", encoder.encode(`${kind}:${id}`)));
  const row = await getRawDb().prepare(`INSERT INTO login_attempts (id,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`).bind(key, now + 900, now, now).first();
  return Boolean(row && row.count <= 10);
}

// tuition-src/lib/fee-status.ts
function confirmedPaidCohort(classRoom, reportVersion) {
  if (reportVersion !== "arrears-20260910-cb15bb667adb" || !/^ม\.[14]\s*\/\s*\d+$/.test(classRoom)) return null;
  return {
    charges: [{ academicYear: 2569, semester: 1, classRoom, item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", due: null, paid: null, outstanding: 0, updatedAt: "9 \u0E15.\u0E04. 2569" }],
    chargesAvailable: true,
    reportedTotal: 0,
    detailsAvailable: true,
    reportOnly: false,
    listedInReport: false,
    paymentConfirmed: true,
    asOf: "2026-10-09"
  };
}
function includePaidTerms(entries, terms) {
  const result = [...entries];
  for (const term of terms) {
    if (!result.some((row) => row.academic_year === term.academic_year && row.semester === term.semester)) {
      result.push({ ...term, item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", outstanding_cents: 0 });
    }
  }
  return result.sort((a, b) => b.academic_year - a.academic_year || b.semester - a.semester);
}

// tuition-src/lib/fees.ts
async function findRosterFees(students) {
  const db = getRawDb();
  const state = await db.prepare("SELECT version FROM fee_import_state WHERE id='active'").first();
  if (!state) return new Map(students.map((s) => [s.student_id, { charges: [], chargesAvailable: false }]));
  const data = await db.batch([
    db.prepare("SELECT student_id,source_id,total_cents,details_available FROM fee_reports WHERE import_version=?").bind(state.version),
    db.prepare("SELECT source_id,class_room,as_of,complete FROM fee_sources WHERE import_version=?").bind(state.version),
    db.prepare("SELECT student_id,source_id,academic_year,semester,class_room,item,outstanding_cents FROM fee_entries WHERE import_version=? ORDER BY academic_year DESC,semester DESC").bind(state.version)
  ]);
  const reports = new Map(data[0].results.map((r) => [r.student_id, r]));
  const sources = data[1].results;
  const entries = data[2].results;
  return new Map(students.map((s) => {
    const report = reports.get(s.student_id);
    const source = report ? sources.find((r) => r.source_id === report.source_id) : sources.find((r) => r.class_room === s.class_room);
    if (!source) return [s.student_id, confirmedPaidCohort(s.class_room, state.version) ?? { charges: [], chargesAvailable: false, reportOnly: true }];
    if (report && report.total_cents === null) return [s.student_id, { charges: [], chargesAvailable: false, reportOnly: true, detailsAvailable: false, asOf: source.as_of }];
    const own = entries.filter((e) => e.student_id === s.student_id);
    const detailsAvailable = report ? Boolean(report.details_available) : true;
    const terms = detailsAvailable ? entries.filter((e) => e.source_id === source.source_id) : [];
    const rows = detailsAvailable ? includePaidTerms(own, terms) : own;
    return [s.student_id, { charges: rows.map((e) => ({ academicYear: e.academic_year, semester: e.semester, classRoom: e.class_room, item: e.item, due: null, paid: null, outstanding: e.outstanding_cents / 100, updatedAt: "10 \u0E01.\u0E22. 2569" })), chargesAvailable: true, reportOnly: true, asOf: source.as_of, reportedTotal: (report?.total_cents ?? 0) / 100, detailsAvailable, listedInReport: Boolean(report) }];
  }));
}
async function findStudentFees(studentId, classRoom) {
  const db = getRawDb();
  const state = await db.prepare("SELECT version FROM fee_import_state WHERE id='active'").first();
  if (!state) return { charges: [], chargesAvailable: false };
  const report = await db.prepare("SELECT source_id,total_cents,details_available FROM fee_reports WHERE id=?").bind(`${state.version}:${studentId}`).first();
  const source = report ? await db.prepare("SELECT source_id,as_of,complete FROM fee_sources WHERE id=?").bind(`${state.version}:${report.source_id}`).first() : await db.prepare("SELECT source_id,as_of,complete FROM fee_sources WHERE import_version=? AND class_room=?").bind(state.version, classRoom).first();
  if (!source) return confirmedPaidCohort(classRoom, state.version) ?? { charges: [], chargesAvailable: false, reportOnly: true };
  if (report && report.total_cents === null) return { charges: [], chargesAvailable: false, reportOnly: true, detailsAvailable: false, asOf: source.as_of };
  const entries = await db.prepare("SELECT academic_year,semester,class_room,item,outstanding_cents FROM fee_entries WHERE import_version=? AND student_id=? ORDER BY academic_year DESC,semester DESC").bind(state.version, studentId).all();
  const detailsAvailable = report ? Boolean(report.details_available) : true;
  const terms = detailsAvailable ? (await db.prepare("SELECT DISTINCT academic_year,semester,class_room FROM fee_entries WHERE import_version=? AND source_id=? ORDER BY academic_year DESC,semester DESC").bind(state.version, source.source_id).all()).results : [];
  const rows = detailsAvailable ? includePaidTerms(entries.results, terms) : entries.results;
  return {
    charges: rows.map((e) => ({ academicYear: e.academic_year, semester: e.semester, classRoom: e.class_room, item: e.item, due: null, paid: null, outstanding: e.outstanding_cents / 100, updatedAt: "10 \u0E01.\u0E22. 2569" })),
    chargesAvailable: true,
    reportOnly: true,
    asOf: source.as_of,
    reportedTotal: (report?.total_cents ?? 0) / 100,
    detailsAvailable,
    listedInReport: Boolean(report)
  };
}

// tuition-src/app/api/check/route.ts
var DEMO_RESULT = {
  teacher: { id: "999999", name: "\u0E04\u0E23\u0E39\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07", classRoom: "\u0E21.1/1" },
  students: [
    { studentId: "DEMO-S001", rollNumber: 1, fullName: "\u0E40\u0E14\u0E47\u0E01\u0E0A\u0E32\u0E22 \u0E19\u0E31\u0E01\u0E40\u0E23\u0E35\u0E22\u0E19 \u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07", classRoom: "\u0E21.1/1", charges: [{ item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", due: 1500, paid: 0, outstanding: 1500, paymentDate: "", updatedAt: "23 \u0E01.\u0E22. 2569" }] },
    { studentId: "DEMO-S002", rollNumber: 2, fullName: "\u0E40\u0E14\u0E47\u0E01\u0E2B\u0E0D\u0E34\u0E07 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E40\u0E1E\u0E22\u0E4C \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22", classRoom: "\u0E21.1/1", charges: [{ item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", due: 1500, paid: 1500, outstanding: 0, paymentDate: "2026-09-22", updatedAt: "22 \u0E01.\u0E22. 2569" }] }
  ],
  demo: true,
  updatedAt: "23 \u0E01\u0E31\u0E19\u0E22\u0E32\u0E22\u0E19 2569"
};
async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" }, { status: 400 });
  }
  const teacherId = typeof payload?.teacherId === "string" ? payload.teacherId.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password.trim() : "";
  if (!/^\d{5,6}$/.test(teacherId) || !/^\d{8}$/.test(password)) {
    return Response.json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E23\u0E2B\u0E31\u0E2A\u0E1A\u0E38\u0E04\u0E25\u0E32\u0E01\u0E23 5\u20136 \u0E2B\u0E25\u0E31\u0E01\u0E41\u0E25\u0E30\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19 8 \u0E2B\u0E25\u0E31\u0E01" }, { status: 400 });
  }
  if (teacherId === "999999" && password === "19990909") return Response.json(DEMO_RESULT, { headers: { "cache-control": "no-store" } });
  if (env3.DB && env3.ROSTER_CREDENTIAL_KEY) {
    const headers2 = { "cache-control": "no-store", "pragma": "no-cache" };
    try {
      if (!await allowLogin("teacher", teacherId)) return Response.json({ error: "\u0E25\u0E2D\u0E07\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E2B\u0E25\u0E32\u0E22\u0E04\u0E23\u0E31\u0E49\u0E07 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D 15 \u0E19\u0E32\u0E17\u0E35" }, { status: 429, headers: { ...headers2, "retry-after": "900" } });
      const db = getRawDb();
      const teacher = await db.prepare("SELECT id,full_name,credential_hash,login_enabled FROM teacher_roster WHERE personnel_id=?").bind(teacherId).first();
      const valid = await checkPassword(teacherId, password, teacher?.credential_hash ?? "");
      if (!valid || !teacher?.login_enabled) return Response.json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E2B\u0E23\u0E37\u0E2D\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19" }, { status: 401, headers: headers2 });
      const rooms = (await db.prepare("SELECT DISTINCT class_room FROM teacher_advisory_rooms WHERE teacher_id=?").bind(teacher.id).all()).results;
      if (!rooms.length) return Response.json({ error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2B\u0E49\u0E2D\u0E07\u0E17\u0E35\u0E48\u0E1B\u0E23\u0E36\u0E01\u0E29\u0E32\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19" }, { status: 403, headers: headers2 });
      const roster = (await db.prepare(`SELECT student_id,full_name,class_room,roll_number FROM student_roster
        WHERE class_room IN (SELECT class_room FROM teacher_advisory_rooms WHERE teacher_id=?) ORDER BY class_room,roll_number,student_id`).bind(teacher.id).all()).results;
      const students = [];
      const fees = await findRosterFees(roster);
      for (const s of roster) students.push({ studentId: s.student_id, fullName: s.full_name, classRoom: s.class_room, rollNumber: s.roll_number, ...fees.get(s.student_id) });
      return Response.json({ teacher: { id: teacherId, name: teacher.full_name, classRoom: rooms.map((r) => r.class_room).join(", ") }, students, demo: false, updatedAt: students.find((s) => s.asOf)?.asOf ?? "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25" }, { headers: headers2 });
    } catch {
      return Response.json({ error: "\u0E23\u0E30\u0E1A\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" }, { status: 503, headers: headers2 });
    }
  }
  if (env3.SHEETS_WEB_APP_URL) {
    try {
      const upstream = await fetch(env3.SHEETS_WEB_APP_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teacherId, password, secret: env3.SHEETS_SHARED_SECRET ?? "" })
      });
      const data = await upstream.json();
      if (!upstream.ok) return Response.json({ error: "\u0E23\u0E30\u0E1A\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" }, { status: 503 });
      return Response.json(data, { status: data.error ? 401 : 200, headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json({ error: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" }, { status: 503 });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  return Response.json({ error: "\u0E23\u0E2B\u0E31\u0E2A\u0E1A\u0E38\u0E04\u0E25\u0E32\u0E01\u0E23\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" }, { status: 401 });
}

// tuition-src/app/api/student-check/route.ts
import { env as env5 } from "cloudflare:workers";

// tuition-src/lib/roster.ts
import { env as env4 } from "cloudflare:workers";
async function findRosterStudent(studentId, nationalId) {
  if (!env4.ROSTER_CREDENTIAL_KEY) throw new Error("Credential key unavailable");
  const row = await getRawDb().prepare("SELECT student_id, roll_number, full_name, class_room, advisor, status, credential_hash FROM student_roster WHERE student_id = ?").bind(studentId).first();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env4.ROSTER_CREDENTIAL_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${studentId}:${nationalId}`));
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  if (!row?.credential_hash || row.credential_hash !== hash) return null;
  return { studentId: row.student_id, rollNumber: row.roll_number, fullName: row.full_name, classRoom: row.class_room, advisor: row.advisor, status: row.status };
}

// tuition-src/app/api/student-check/route.ts
var headers = { "cache-control": "no-store", "pragma": "no-cache" };
async function POST2(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" }, { status: 400, headers });
  }
  const input = payload;
  const nationalId = typeof input?.nationalId === "string" ? input.nationalId.trim() : "";
  const studentId = typeof input?.studentId === "string" ? input.studentId.trim() : "";
  if (!/^\d{13}$/.test(nationalId) || !/^\d{4,10}$/.test(studentId)) return Response.json({ error: "\u0E01\u0E23\u0E2D\u0E01\u0E40\u0E25\u0E02\u0E1A\u0E31\u0E15\u0E23\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E0A\u0E19 13 \u0E2B\u0E25\u0E31\u0E01\u0E41\u0E25\u0E30\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E40\u0E23\u0E35\u0E22\u0E19\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E1A" }, { status: 400, headers });
  if (nationalId === "0000000000000" && studentId === "99999") return Response.json({
    student: { studentId: "99999", fullName: "\u0E19\u0E31\u0E01\u0E40\u0E23\u0E35\u0E22\u0E19 \u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07", classRoom: "\u0E21.6/5", advisor: "\u0E04\u0E23\u0E39\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07" },
    charges: [
      { academicYear: 2569, semester: 1, classRoom: "\u0E21.6/5", item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", due: 1500, paid: 0, outstanding: 1500, updatedAt: "25 \u0E01.\u0E22. 2569" },
      { academicYear: 2568, semester: 2, classRoom: "\u0E21.5/5", item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", due: 3e3, paid: 1500, outstanding: 1500, updatedAt: "25 \u0E01.\u0E22. 2569" },
      { academicYear: 2568, semester: 1, classRoom: "\u0E21.5/5", item: "\u0E04\u0E48\u0E32\u0E1A\u0E33\u0E23\u0E38\u0E07\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32", due: 1500, paid: 1500, outstanding: 0, updatedAt: "25 \u0E01.\u0E22. 2569" }
    ],
    demo: true
  }, { headers });
  let rosterStudent = null;
  if (env5.DB && env5.ROSTER_CREDENTIAL_KEY) {
    try {
      if (!await allowLogin("student", studentId)) return Response.json({ error: "\u0E25\u0E2D\u0E07\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E2B\u0E25\u0E32\u0E22\u0E04\u0E23\u0E31\u0E49\u0E07 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D 15 \u0E19\u0E32\u0E17\u0E35" }, { status: 429, headers: { ...headers, "retry-after": "900" } });
      rosterStudent = await findRosterStudent(studentId, nationalId);
    } catch {
      return Response.json({ error: "\u0E23\u0E30\u0E1A\u0E1A\u0E23\u0E32\u0E22\u0E0A\u0E37\u0E48\u0E2D\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" }, { status: 503, headers });
    }
  }
  if (!env5.SHEETS_WEB_APP_URL) {
    if (rosterStudent) {
      try {
        return Response.json({ student: rosterStudent, ...await findStudentFees(studentId, rosterStudent.classRoom), demo: false }, { headers });
      } catch {
        return Response.json({ error: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32\u0E40\u0E17\u0E2D\u0E21\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" }, { status: 503, headers });
      }
    }
    return Response.json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E40\u0E23\u0E35\u0E22\u0E19\u0E41\u0E25\u0E30\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19" }, { status: 401, headers });
  }
  try {
    const response = await fetch(env5.SHEETS_WEB_APP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "student-check", nationalId, studentId, secret: env5.SHEETS_SHARED_SECRET ?? "" }),
      signal: AbortSignal.timeout(15e3)
    });
    const data = await response.json();
    if (!response.ok) throw new Error("upstream unavailable");
    if (data.error) return Response.json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E40\u0E25\u0E02\u0E1A\u0E31\u0E15\u0E23\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E0A\u0E19\u0E41\u0E25\u0E30\u0E23\u0E2B\u0E31\u0E2A\u0E19\u0E31\u0E01\u0E40\u0E23\u0E35\u0E22\u0E19" }, { status: 401, headers });
    if (data.student?.studentId !== studentId || !Array.isArray(data.charges)) throw new Error("invalid result");
    return Response.json({ ...data, student: rosterStudent ?? data.student, chargesAvailable: true }, { headers });
  } catch {
    return Response.json({ error: "\u0E23\u0E30\u0E1A\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" }, { status: 503, headers });
  }
}
export {
  POST2 as studentCheck,
  POST as teacherCheck
};
