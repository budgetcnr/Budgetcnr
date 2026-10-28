import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
type RosterRow = { study_program: string | null; current_room: string | null; term1_room:string|null; class_history:string|null; student_id: string; roll_number: number | null; full_name: string; class_room: string; advisor: string; status: string; credential_hash: string | null };
export async function findRosterStudent(studentId: string, nationalId: string) {
  if (!env.ROSTER_CREDENTIAL_KEY) throw new Error("Credential key unavailable");
  const row = await getRawDb().prepare("SELECT s.*, p.study_program,p.current_room,p.term1_room,p.class_history FROM student_roster s LEFT JOIN student_programs p ON p.student_id=s.student_id WHERE s.student_id = ?").bind(studentId).first<RosterRow>();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ROSTER_CREDENTIAL_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${studentId}:${nationalId}`));
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  if (!row?.credential_hash || row.credential_hash !== hash) return null;
  return { studentId: row.student_id, rollNumber: row.roll_number, fullName: row.full_name, classRoom: row.current_room || row.class_room, classHistory: JSON.parse(row.class_history || '[]'), advisor: row.advisor, studyProgram: row.study_program, status: row.status };
}

