import { env } from "cloudflare:workers";
import { findRosterStudent } from "@/lib/roster";
import { findStudentFees } from "@/lib/fees";
import { allowLogin } from "@/lib/teacher-auth";

const headers = { "cache-control": "no-store", "pragma": "no-cache" };
export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400, headers }); }
  const input = payload as { nationalId?: unknown; studentId?: unknown } | null;
  const nationalId = typeof input?.nationalId === "string" ? input.nationalId.trim() : "";
  const studentId = typeof input?.studentId === "string" ? input.studentId.trim() : "";
  if (!/^\d{13}$/.test(nationalId) || !/^\d{4,10}$/.test(studentId)) return Response.json({ error: "กรอกเลขบัตรประชาชน 13 หลักและรหัสนักเรียนให้ครบ" }, { status: 400, headers });
  if (nationalId === "0000000000000" && studentId === "99999") return Response.json({
    student: { studentId: "99999", fullName: "นักเรียน ตัวอย่าง", classRoom: "ม.6/5", advisor: "ครูตัวอย่าง" },
    charges: [
      { academicYear: 2569, semester: 1, classRoom: "ม.6/5", item: "ค่าบำรุงการศึกษา", due: 1500, paid: 0, outstanding: 1500, updatedAt: "25 ก.ย. 2569" },
      { academicYear: 2568, semester: 2, classRoom: "ม.5/5", item: "ค่าบำรุงการศึกษา", due: 3000, paid: 1500, outstanding: 1500, updatedAt: "25 ก.ย. 2569" },
      { academicYear: 2568, semester: 1, classRoom: "ม.5/5", item: "ค่าบำรุงการศึกษา", due: 1500, paid: 1500, outstanding: 0, updatedAt: "25 ก.ย. 2569" },
    ], demo: true,
  }, { headers });
  let rosterStudent: Awaited<ReturnType<typeof findRosterStudent>> = null;
  if (env.DB && env.ROSTER_CREDENTIAL_KEY) {
    try {
      if(!await allowLogin("student",studentId)) return Response.json({error:"ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที"},{status:429,headers:{...headers,"retry-after":"900"}});
      rosterStudent = await findRosterStudent(studentId, nationalId);
    }
    catch { return Response.json({ error: "ระบบรายชื่อไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503, headers }); }
  }
  if (!env.SHEETS_WEB_APP_URL) {
    if (rosterStudent) {
      try { return Response.json({ student: rosterStudent, ...await findStudentFees(studentId,rosterStudent.classRoom), demo: false }, { headers }); }
      catch { return Response.json({ error: "ข้อมูลค่าเทอมไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503, headers }); }
    }
    return Response.json({ error: "ไม่พบข้อมูลที่ตรงกัน กรุณาตรวจสอบรหัสนักเรียนและรหัสผ่าน" }, { status: 401, headers });
  }
  try {
    const response = await fetch(env.SHEETS_WEB_APP_URL, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "student-check", nationalId, studentId, secret: env.SHEETS_SHARED_SECRET ?? "" }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as { error?: string; student?: { studentId?: string }; charges?: unknown[] };
    if (!response.ok) throw new Error("upstream unavailable");
    if (data.error) return Response.json({ error: "ไม่พบข้อมูลที่ตรงกัน กรุณาตรวจสอบเลขบัตรประชาชนและรหัสนักเรียน" }, { status: 401, headers });
    if (data.student?.studentId !== studentId || !Array.isArray(data.charges)) throw new Error("invalid result");
    return Response.json({ ...data, student: rosterStudent ?? data.student, chargesAvailable: true }, { headers });
  } catch { return Response.json({ error: "ระบบข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503, headers }); }
}
