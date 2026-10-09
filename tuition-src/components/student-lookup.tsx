"use client";

import { FormEvent, useState } from "react";
import { GraduationCap, WalletCards, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/password-input";

type Charge = {
  academicYear: number; semester: number; classRoom: string;
  item: string; due: number | null; paid: number | null; outstanding: number; updatedAt: string;
};
export type LookupResult = {
  student: { studentId: string; fullName: string; classRoom: string; advisor: string };
  charges: Charge[]; demo: boolean; chargesAvailable?: boolean; reportOnly?: boolean; asOf?: string; reportedTotal?: number; detailsAvailable?: boolean; listedInReport?: boolean;
};
const money = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);

export default function StudentLookup({ onResultChange, initialResult, onBack }: { onResultChange?: (open: boolean) => void; initialResult?: LookupResult; onBack?:()=>void }) {
  const [nationalId, setNationalId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [result, setResult] = useState<LookupResult | null>(initialResult ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const total = result?.reportedTotal ?? result?.charges.reduce((sum, row) => sum + row.outstanding, 0) ?? 0;
  const groups = result ? Array.from(new Set(result.charges.map(row => `${row.semester}/${row.academicYear}`)))
    .map(key => ({ key, rows: result.charges.filter(row => `${row.semester}/${row.academicYear}` === key) }))
    .sort((a, b) => b.rows[0].academicYear - a.rows[0].academicYear || b.rows[0].semester - a.rows[0].semester) : [];

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/tuition/api/student-check", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ nationalId, studentId }), cache: "no-store",
      });
      const data = await response.json() as LookupResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "ไม่สามารถตรวจสอบข้อมูลได้");
      setResult(data); onResultChange?.(true); setNationalId(""); setStudentId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "กรุณาลองใหม่ภายหลัง");
    } finally { setLoading(false); }
  }

  return (
    <section aria-labelledby="student-title" className={result ? "student-result min-w-0 pb-36 sm:pb-40" : "student-portal min-w-0"}>
      {!result ? (
        <Card className="login-card student-card">
          <CardHeader className="login-card-head">
            <div className="portal-icon student-icon"><GraduationCap className="h-6 w-6" /></div>
            <CardTitle id="student-title" className="portal-title">นักเรียน / ผู้ปกครอง</CardTitle>
          </CardHeader>
          <CardContent className="login-card-content">
            <form onSubmit={lookup} className="login-form">
              <div className="space-y-2"><Label htmlFor="studentId">รหัสนักเรียน</Label>
                <Input id="studentId" inputMode="numeric" autoComplete="username" value={studentId} onChange={e => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={10} pattern="[0-9]{4,10}" placeholder="รหัสนักเรียน" className="portal-input" required /></div>
              <div className="space-y-2"><Label htmlFor="nationalId">รหัสผ่าน</Label>
                <PasswordInput id="nationalId" inputMode="numeric" autoComplete="off" value={nationalId} onChange={e => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 13))} maxLength={13} pattern="[0-9]{13}" placeholder="รหัสผ่าน" className="portal-input" required /></div>
              {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
              <Button disabled={loading} className="portal-button">{loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="student-title" className="text-2xl font-bold text-blue-950">ข้อมูลค่าเทอมรายบุคคล</h2>
            <Button variant="outline" onClick={() => { if(onBack) { onBack(); return; } setResult(null); onResultChange?.(false); setError(""); }}>{onBack ? "กลับรายชื่อนักเรียน" : "ออกจากระบบ"}</Button></div>
          {result.demo && <p className="text-sm text-amber-800">ข้อมูลทดลอง</p>}
          {result.asOf && <p className="text-sm text-slate-600">อ้างอิงรายงานยอดค้าง ณ {new Intl.DateTimeFormat("th-TH", { day:"numeric", month:"long", year:"numeric", timeZone:"Asia/Bangkok" }).format(new Date(`${result.asOf}T00:00:00+07:00`))}</p>}
          <Card className="dashboard-glass"><CardContent className="space-y-3 p-6">
            <h3 className="text-xl font-bold text-blue-950">{result.student.fullName}</h3>
            <p className="text-base text-slate-600">รหัสนักเรียน {result.student.studentId} · ชั้นปัจจุบัน {result.student.classRoom}</p>
            <p className="text-base text-slate-600">ครูที่ปรึกษา: {result.student.advisor || "ไม่ระบุ"}</p>
            <div className={`rounded-2xl p-5 ${total > 0 || result.chargesAvailable === false ? "bg-blue-950 text-white" : "bg-emerald-50 text-emerald-900"}`}>
              <p className="flex items-center gap-2 text-base"><WalletCards className="h-5 w-5" />ยอดค้างรวมทุกภาคเรียน</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{result.chargesAvailable === false ? "—" : money(total)} {result.chargesAvailable !== false && <span className="text-lg font-normal">บาท</span>}</p>
              {result.chargesAvailable === false ? <p className="mt-2 text-base">ยังไม่มีข้อมูลค่าเทอมที่ยืนยันได้</p> : total === 0 && <p className="mt-2 text-base">{result.reportOnly ? "ชำระครบตามรายงาน" : result.charges.length ? "ชำระครบทุกภาคเรียนที่แสดง" : "ไม่พบรายการเรียกเก็บ"}</p>}
            </div>
          </CardContent></Card>
          <h3 className="text-lg font-semibold text-blue-950">{result.reportOnly ? "ยอดค้างรายภาคเรียน" : "ประวัติรายภาคเรียน"}</h3>
          {groups.map(({ key, rows }) => {
            const paid = rows.reduce((sum, row) => sum + (row.paid ?? 0), 0);
            const outstanding = rows.reduce((sum, row) => sum + row.outstanding, 0);
            const status = outstanding === 0 ? "ชำระครบ" : result.reportOnly ? "ค้างชำระ" : paid > 0 ? "ชำระบางส่วน" : "ยังไม่ชำระ";
            const year = rows[0].academicYear;
            const shortYear = String(year < 2400 ? year + 543 : year).slice(-2);
            return <Card key={key} className="dashboard-glass"><CardContent className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3">{rows[0].classRoom && <span className="class-chip">{rows[0].classRoom}</span>}<h4 className="text-lg font-semibold text-blue-950">ภาคเรียนที่ {rows[0].semester}/{shortYear}</h4></div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${outstanding === 0 ? "bg-emerald-50 text-emerald-800" : paid > 0 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>{status}</span></div>
              <div className="mt-5 space-y-5">{rows.map((row, index) => <div key={index}>
                <p className="font-medium">{row.item}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm sm:text-base">
                  <div><dt className="text-slate-500">เรียกเก็บ</dt><dd className="mt-1 tabular-nums">{row.due === null ? "—" : `${money(row.due)} บาท`}</dd></div>
                  <div><dt className="text-slate-500">ชำระแล้ว</dt><dd className="mt-1 tabular-nums">{row.paid === null ? "—" : `${money(row.paid)} บาท`}</dd></div>
                  <div><dt className="text-slate-500">คงค้าง</dt><dd className={`mt-1 font-semibold tabular-nums ${row.outstanding > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(row.outstanding)} บาท</dd></div>
                </dl>
                <p className="mt-3 text-sm text-slate-500">อัปเดตข้อมูล: {row.updatedAt || "ไม่ระบุ"}</p>
              </div>)}</div>
            </CardContent></Card>;
          })}
          {groups.length === 0 && <p className="rounded-xl bg-white p-5 text-slate-600">{result.detailsAvailable === false ? result.chargesAvailable === false ? "ยอดรวมและรายละเอียดรายภาคเรียนรอตรวจสอบ" : "รายละเอียดรายภาคเรียนรอตรวจสอบ ใช้ยอดรวมตามรายงาน" : result.chargesAvailable === false ? "รออัปเดตข้อมูลที่ยืนยันได้จากงานการเงิน" : result.reportOnly ? "ชำระครบตามรายงานของห้องนี้" : "ไม่พบรายการเรียกเก็บในระบบ"}</p>}
          {result.reportOnly && <p className="text-sm leading-6 text-slate-500">ภาคเรียนที่ไม่มีรายการค้างในรายงาน หมายถึงชำระครบแล้ว ณ วันที่รายงาน ไม่ใช่ประวัติยอดเงินหรือวันที่ชำระ</p>}
          <p className="text-sm leading-6 text-slate-500">หากยอดไม่ตรงกับหลักฐานการชำระ กรุณาติดต่อเจ้าหน้าที่การเงิน</p>
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-blue-100 bg-white/95 px-4 pt-4 shadow-[0_-8px_30px_rgba(15,44,86,0.12)] backdrop-blur-lg" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3"><div><p className="text-sm text-slate-600">ยอดค้างรวมทุกภาคเรียน</p>{result.chargesAvailable === false ? <p className="text-sm text-slate-500">ยังไม่มีข้อมูลค่าเทอมที่ยืนยันได้</p> : total === 0 && <p className="text-sm text-emerald-700">{result.reportOnly ? "ชำระครบตามรายงาน" : "ไม่พบยอดค้างในรายการที่แสดง"}</p>}</div>
              <p className={`text-2xl font-bold tabular-nums ${total > 0 || result.chargesAvailable === false ? "text-blue-950" : "text-emerald-700"}`}>{result.chargesAvailable === false ? "—" : money(total)} {result.chargesAvailable !== false && <span className="text-base font-normal">บาท</span>}</p></div>
          </div>
        </div>
      )}
    </section>
  );
}
