"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BadgeCheck, LogOut, Menu, ShieldCheck, Users, WalletCards, GraduationCap, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StudentLookup, { type LookupResult } from "@/components/student-lookup";
import PasswordInput from "@/components/password-input";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Charge = { item: string; outstanding: number; updatedAt: string; due?: number | null; paid?: number | null; academicYear?:number; semester?:number; classRoom?:string; paymentDate?: string };
type Student = { studentId: string; fullName: string; classRoom: string; rollNumber?: number; charges: Charge[]; chargesAvailable?: boolean; reportedTotal?: number; asOf?:string; reportOnly?:boolean; detailsAvailable?:boolean; listedInReport?:boolean };
type Result = {
  teacher: { id: string; name: string; classRoom: string };
  students: Student[];
  demo: boolean;
  updatedAt: string;
};

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 0,
});

export default function Home() {
  const [mode,setMode] = useState<"student"|"teacher"|null>(null);
  const [selected,setSelected] = useState<Student|null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [lookupKey, setLookupKey] = useState(0);

  const filtered = useMemo(() => {
    if (!result) return [];
    const term = query.trim().toLowerCase();
    return result.students.filter((student) =>
      !term || student.studentId.toLowerCase().includes(term) || student.fullName.toLowerCase().includes(term),
    );
  }, [query, result]);

  const summary = useMemo(() => {
    return (result?.students ?? []).reduce(
      (total, student) => {
        const amount = totalFor(student);
        total.students += 1;
        total.amount += amount;
        if (amount > 0) total.overdue += 1;
        return total;
      },
      { students: 0, overdue: 0, amount: 0 },
    );
  }, [result]);
  const paidCount=(result?.students ?? []).filter(s=>s.chargesAvailable!==false && totalFor(s)===0).length;
  const paidPercent=summary.students ? paidCount/summary.students*100 : 0;
  function switchMode(next: "student"|"teacher"|null) {
    signOut(); setSelected(null); setStudentOpen(false); setLookupKey(k=>k+1); setMode(next);
  }
  function detailFor(student:Student):LookupResult {
    return {...student,student:{studentId:student.studentId,fullName:student.fullName,classRoom:student.classRoom,advisor:result?.teacher.name ?? ""},demo:result?.demo ?? false,
      charges:student.charges.map(c=>({...c,academicYear:c.academicYear ?? 2569,semester:c.semester ?? 1,classRoom:c.classRoom ?? student.classRoom,due:c.due ?? null,paid:c.paid ?? null}))};
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "filter_advisory_students",
      title: "ค้นหานักเรียนในที่ปรึกษา",
      description: "กรองรายชื่อนักเรียนที่แสดงอยู่ด้วยชื่อหรือรหัสนักเรียน หลังครูที่ปรึกษาเข้าสู่ระบบแล้ว",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", maxLength: 80 } },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        if (!result) throw new Error("ต้องเข้าสู่ระบบก่อนค้นหารายชื่อนักเรียน");
        const value = (input as { query?: unknown })?.query;
        if (typeof value !== "string") throw new Error("query ต้องเป็นข้อความ");
        const nextQuery = value.trim().slice(0, 80);
        setQuery(nextQuery);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const term = nextQuery.toLowerCase();
        const matchCount = result.students.filter((student) =>
          !term || student.studentId.toLowerCase().includes(term) || student.fullName.toLowerCase().includes(term),
        ).length;
        return { query: nextQuery, matchCount };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [result]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/tuition/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teacherId, password }),
      });
      const payload = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถตรวจสอบข้อมูลได้");
      setResult(payload); setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    setResult(null); setSelected(null);
    setTeacherId("");
    setPassword("");
    setQuery("");
    setError("");
  }

  return (
    <main className="tuition-app min-h-screen text-slate-950">
      <header className="tuition-header">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
          <div className="brand-mark">
            <img src="/tuition/cnr-budget-logo.webp" alt="โลโก้กลุ่มบริหารงบประมาณ" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-950">กลุ่มบริหารงบประมาณ</p>
            <p className="text-sm text-slate-500">โรงเรียนชิโนรสวิทยาลัย</p>
          </div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="ml-auto h-11 w-11 rounded-2xl" aria-label="เมนู"><Menu className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem asChild><a href="https://budgetcnr.github.io/Budgetcnr/">หน้าเว็บหลัก</a></DropdownMenuItem><DropdownMenuItem onSelect={() => switchMode(null)}>หน้าระบบค่าเทอม</DropdownMenuItem><DropdownMenuItem onSelect={() => switchMode("student")}>โหมดนักเรียน / ผู้ปกครอง</DropdownMenuItem><DropdownMenuItem onSelect={() => switchMode("teacher")}>โหมดครูที่ปรึกษา</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!result ? (
        <div className="login-shell">
          {!studentOpen && <div className="login-heading">
            <p className="portal-kicker">CNR · TUITION</p>
            <h1>ตรวจสอบค่าเทอม</h1>
          </div>}
          {!studentOpen && <nav aria-label="เลือกโหมดผู้ใช้งาน" className={mode ? "mode-selector" : "mode-selector mode-choice-grid"}>
            <button type="button" aria-pressed={mode==="student"} onClick={()=>switchMode("student")}><GraduationCap aria-hidden="true"/>นักเรียน / ผู้ปกครอง</button>
            <button type="button" aria-pressed={mode==="teacher"} onClick={()=>switchMode("teacher")}><TeacherIcon />ครูที่ปรึกษา</button>
          </nav>}
          <div className="login-grid is-result">
          {mode==="student" && <StudentLookup key={lookupKey} onResultChange={setStudentOpen} />}
          {mode==="teacher" && <Card className="login-card teacher-card">
            <CardHeader className="login-card-head">
              <div className="portal-icon teacher-icon">
                <TeacherIcon />
              </div>
              <CardTitle className="portal-title">ครูที่ปรึกษา</CardTitle>
            </CardHeader>
            <CardContent className="login-card-content">
              <form onSubmit={signIn} className="login-form">
                <div className="space-y-2">
                  <Label htmlFor="teacherId">รหัสบุคลากร</Label>
                  <Input id="teacherId" value={teacherId} onChange={(event) => setTeacherId(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="รหัสบุคลากร 5–6 หลัก" autoComplete="username" inputMode="numeric" pattern="[0-9]{5,6}" maxLength={6} className="portal-input" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">รหัสผ่าน</Label>
                  <PasswordInput id="password" value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="รหัสผ่าน" autoComplete="current-password" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} className="portal-input" required />
                </div>
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <Button type="submit" disabled={loading} className="portal-button">
                  {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
                </Button>
              </form>
            </CardContent>
          </Card>}
          </div>
          {!studentOpen && <p className="portal-footer">กลุ่มบริหารงบประมาณ · โรงเรียนชิโนรสวิทยาลัย</p>}
        </div>
      ) : selected ? (
        <section className="mx-auto max-w-3xl px-4 py-8"><StudentLookup key={selected.studentId} initialResult={detailFor(selected)} onBack={()=>setSelected(null)} /></section>
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-blue-950">สวัสดี {result.teacher.name}</h1>
              <p className="mt-2 text-sm text-slate-500">ข้อมูลล่าสุด {result.updatedAt}</p>
            </div>
            <div className="flex items-center gap-5"><p className="text-3xl font-semibold text-blue-950">{result.teacher.classRoom}</p><Button variant="outline" onClick={signOut} className="w-fit gap-2 border-blue-200 bg-white"><LogOut className="h-4 w-4" /> ออกจากระบบ</Button></div>
          </div>

          {result.demo && <p className="mt-4 text-sm text-amber-800">ข้อมูลทดลอง</p>}
          {result.students.some(s=>s.chargesAvailable===false) && <p className="mt-4 text-sm text-amber-800">ยอดรวมเฉพาะรายการที่มีข้อมูล ไม่รวมผู้ที่ยังไม่มีข้อมูลค่าเทอม</p>}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Summary icon={WalletCards} label="นักเรียนที่มียอดค้าง" value={`${summary.overdue} คน`} tone="amber" />
            <Summary icon={BadgeCheck} label="ยอดค้างรวม" value={money.format(summary.amount)} tone="red" />
          </div>
          <Card className="dashboard-glass mt-5"><CardContent className="p-5 sm:p-6">
            <div className="mb-4 flex justify-between gap-3"><h2 className="font-semibold text-blue-950">สัดส่วนนักเรียนที่ชำระครบ</h2><p>{Math.round(paidPercent)}%</p></div>
            <Progress value={paidPercent} aria-label="สัดส่วนจำนวนนักเรียนที่ชำระครบ" className="h-3 bg-amber-100"/>
            <p className="mt-4 text-sm">ชำระครบ {paidCount} คน จากทั้งหมด {summary.students} คน · ค้างชำระ {summary.overdue} คน</p>
          </CardContent></Card>

          <Card className="dashboard-glass mt-6 overflow-hidden">
            <CardHeader className="gap-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl text-blue-950">รายชื่อนักเรียน</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50"><TableHead className="pl-6">เลขที่</TableHead><TableHead>ชื่อ-นามสกุล</TableHead><TableHead className="text-right">ยอดคงค้าง</TableHead><TableHead className="pr-6 text-right">สถานะ</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.map((student) => <StudentRow key={student.studentId} student={student} onOpen={()=>setSelected(student)} />)}</TableBody>
                </Table>
              </div>
              <div className="divide-y divide-slate-100 md:hidden">{filtered.map((student) => <StudentCard key={student.studentId} student={student} onOpen={()=>setSelected(student)} />)}</div>
              {filtered.length === 0 && <div className="px-6 py-12 text-center text-sm text-slate-500">ไม่พบรายชื่อนักเรียนที่ค้นหา</div>}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}

function totalFor(student: Student) {
  return student.reportedTotal ?? student.charges.reduce((sum, charge) => sum + charge.outstanding, 0);
}

function TeacherIcon() {
  return <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="4" width="21" height="17" rx="2"/><path d="M18 10h7m-7 5h4M19 21v6m-5 0h10M24 19h3"/><circle cx="6" cy="14" r="3"/><path d="M2 28v-6a4 4 0 0 1 8 0v6m0-7 5-7"/></svg>;
}

function Feature({ icon: Icon, text }: { icon: typeof ShieldCheck; text: string }) {
  return <div className="rounded-2xl border border-white bg-white/70 p-4 shadow-sm"><Icon className="mb-3 h-5 w-5 text-blue-800" /><p className="text-sm font-medium text-slate-700">{text}</p></div>;
}

function Summary({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: "blue" | "amber" | "red" }) {
  const color = { blue: "bg-blue-50 text-blue-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-800" }[tone];
  return <Card className="dashboard-glass"><CardContent className="flex items-center gap-4 p-5"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${color}`}><Icon className="h-5 w-5" /></div><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-blue-950">{value}</p></div></CardContent></Card>;
}

function Status({ amount, available=true }: { amount: number; available?:boolean }) {
  if(!available) return <span className="text-sm text-slate-500">ยังไม่มีข้อมูล</span>;
  return amount > 0
    ? <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">ค้างชำระ</span>
    : <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">ชำระครบ</span>;
}

function StudentRow({ student, onOpen }: { student: Student; onOpen:()=>void }) {
  const amount = totalFor(student);
  return <TableRow><TableCell className="pl-6 font-medium text-blue-950">{student.rollNumber ?? "—"}</TableCell><TableCell>{student.fullName}</TableCell><TableCell className={`text-right font-semibold ${amount > 0 ? "text-red-700" : "text-emerald-700"}`}>{student.chargesAvailable===false ? "—" : money.format(amount)}</TableCell><TableCell className="pr-6 text-right"><Status amount={amount} available={student.chargesAvailable!==false} /></TableCell></TableRow>;
}

function StudentCard({ student, onOpen }: { student: Student; onOpen:()=>void }) {
  const amount = totalFor(student);
  return <article className="p-5"><div className="flex items-start justify-between gap-4"><div><p>{student.fullName}</p><p className="mt-1 text-sm text-slate-500">เลขที่ {student.rollNumber ?? "—"}</p></div><Status amount={amount} available={student.chargesAvailable!==false} /></div><div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-slate-50 p-4"><button type="button" className="student-detail-link" onClick={onOpen}>ดูรายละเอียดรายภาคเรียน</button><p className={`text-lg font-bold ${amount > 0 ? "text-red-700" : "text-emerald-700"}`}>{student.chargesAvailable===false ? "—" : money.format(amount)}</p></div></article>;
}

function latestPayment(student: Student) {
  const dates = student.charges.map(charge => charge.paymentDate).filter((date): date is string => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date)));
  const latest = dates.sort().at(-1);
  if (!latest) return "—";
  const date = new Date(`${latest}T00:00:00+07:00`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(date) : "—";
}
