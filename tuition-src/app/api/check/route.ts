import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
import { allowLogin, checkPassword } from "@/lib/teacher-auth";
import { findRosterFees } from "@/lib/fees";

type LoginPayload = { teacherId?: string; password?: string };
const DEMO_RESULT = {
  teacher: { id: "999999", name: "ครูตัวอย่าง", classRoom: "ม.1/1" },
  students: [
    { studentId: "DEMO-S001", rollNumber: 1, fullName: "เด็กชาย นักเรียน ตัวอย่าง", classRoom: "ม.1/1", charges: [{ item: "ค่าบำรุงการศึกษา", due: 1500, paid: 0, outstanding: 1500, paymentDate: "", updatedAt: "23 ก.ย. 2569" }] },
    { studentId: "DEMO-S002", rollNumber: 2, fullName: "เด็กหญิง พร้อมเพย์ เรียบร้อย", classRoom: "ม.1/1", charges: [{ item: "ค่าบำรุงการศึกษา", due: 1500, paid: 1500, outstanding: 0, paymentDate: "2026-09-22", updatedAt: "22 ก.ย. 2569" }] },
  ],
  demo: true,
  updatedAt: "23 กันยายน 2569",
};

export async function POST(request: Request) {
  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return Response.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const teacherId = typeof payload?.teacherId === "string" ? payload.teacherId.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password.trim() : "";
  if (!/^\d{5,6}$/.test(teacherId) || !/^\d{8}$/.test(password)) {
    return Response.json({ error: "กรุณาตรวจสอบรหัสบุคลากร 5–6 หลักและรหัสผ่าน 8 หลัก" }, { status: 400 });
  }

  if (teacherId === "999999" && password === "19990909") return Response.json(DEMO_RESULT, { headers: { "cache-control": "no-store" } });

  if (env.DB && env.ROSTER_CREDENTIAL_KEY) {
    const headers={"cache-control":"no-store","pragma":"no-cache"};
    try {
      if(!await allowLogin("teacher",teacherId)) return Response.json({error:"ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที"},{status:429,headers:{...headers,"retry-after":"900"}});
      const db=getRawDb();
      const teacher=await db.prepare("SELECT id,full_name,credential_hash,login_enabled FROM teacher_roster WHERE personnel_id=?").bind(teacherId).first<{id:string;full_name:string;credential_hash:string;login_enabled:number}>();
      const valid=await checkPassword(teacherId,password,teacher?.credential_hash ?? "");
      if(!valid || !teacher?.login_enabled) return Response.json({error:"ข้อมูลเข้าสู่ระบบไม่ถูกต้อง หรือบัญชียังไม่เปิดใช้งาน"},{status:401,headers});
      const rooms=(await db.prepare("SELECT DISTINCT class_room FROM teacher_advisory_rooms WHERE teacher_id=?").bind(teacher.id).all<{class_room:string}>()).results;
      if(!rooms.length) return Response.json({error:"ยังไม่มีห้องที่ปรึกษาที่ได้รับการยืนยัน"},{status:403,headers});
      const roster=(await db.prepare(`SELECT student_id,full_name,class_room,roll_number FROM student_roster
        WHERE class_room IN (SELECT class_room FROM teacher_advisory_rooms WHERE teacher_id=?) ORDER BY class_room,roll_number,student_id`).bind(teacher.id).all<{student_id:string;full_name:string;class_room:string;roll_number:number}>()).results;
      const students=[];
      const fees=await findRosterFees(roster);
      for(const s of roster) students.push({studentId:s.student_id,fullName:s.full_name,classRoom:s.class_room,rollNumber:s.roll_number,...fees.get(s.student_id)});
      return Response.json({teacher:{id:teacherId,name:teacher.full_name,classRoom:rooms.map(r=>r.class_room).join(", ")},students,demo:false,updatedAt:students.find(s=>s.asOf)?.asOf ?? "ยังไม่มีข้อมูล"},{headers});
    } catch { return Response.json({error:"ระบบข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง"},{status:503,headers}); }
  }

  if (env.SHEETS_WEB_APP_URL) {
    try {
      const upstream = await fetch(env.SHEETS_WEB_APP_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teacherId, password, secret: env.SHEETS_SHARED_SECRET ?? "" }),
      });
      const data = (await upstream.json()) as { error?: string };
      if (!upstream.ok) return Response.json({ error: "ระบบข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" }, { status: 503 });
      return Response.json(data, { status: data.error ? 401 : 200, headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json({ error: "ไม่สามารถเชื่อมต่อข้อมูลได้ กรุณาลองใหม่ภายหลัง" }, { status: 503 });
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 450));
  return Response.json({ error: "รหัสบุคลากรหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
}
