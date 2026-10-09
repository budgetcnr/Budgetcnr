import { getRawDb } from "@/db";
import { includePaidTerms, confirmedPaidCohort } from "@/lib/fee-status";
type Source = { source_id: string; as_of: string; complete: number };
type Report = { source_id: string; total_cents: number | null; details_available: number };
type Entry = { academic_year:number; semester:number; class_room:string; item:string; outstanding_cents:number };
// Load shared report data once for an advisory roster instead of repeating
// the same four D1 queries for every student.
export async function findRosterFees(students:{student_id:string;class_room:string}[]) {
  const db=getRawDb();
  const state=await db.prepare("SELECT version FROM fee_import_state WHERE id='active'").first<{version:string}>();
  if(!state)return new Map(students.map(s=>[s.student_id,{charges:[],chargesAvailable:false}]));
  const data=await db.batch([
    db.prepare('SELECT student_id,source_id,total_cents,details_available FROM fee_reports WHERE import_version=?').bind(state.version),
    db.prepare('SELECT source_id,class_room,as_of,complete FROM fee_sources WHERE import_version=?').bind(state.version),
    db.prepare('SELECT student_id,source_id,academic_year,semester,class_room,item,outstanding_cents FROM fee_entries WHERE import_version=? ORDER BY academic_year DESC,semester DESC').bind(state.version)
  ]);
  const reports=new Map(data[0].results.map((r:any)=>[r.student_id,r]));
  const sources=data[1].results as any[];const entries=data[2].results as any[];
  return new Map(students.map(s=>{
    const report=reports.get(s.student_id) as any;
    const source=report?sources.find(r=>r.source_id===report.source_id):sources.find(r=>r.class_room===s.class_room);
    if(!source)return [s.student_id,confirmedPaidCohort(s.class_room,state.version)??{charges:[],chargesAvailable:false,reportOnly:true}];
    if(report&&report.total_cents===null)return [s.student_id,{charges:[],chargesAvailable:false,reportOnly:true,detailsAvailable:false,asOf:source.as_of}];
    const own=entries.filter(e=>e.student_id===s.student_id);
    const detailsAvailable=report?Boolean(report.details_available):true;
    const terms=detailsAvailable?entries.filter(e=>e.source_id===source.source_id):[];
    const rows=detailsAvailable?includePaidTerms(own,terms):own;
    return [s.student_id,{charges:rows.map(e=>({academicYear:e.academic_year,semester:e.semester,classRoom:e.class_room,item:e.item,due:null,paid:null,outstanding:e.outstanding_cents/100,updatedAt:'10 ก.ย. 2569'})),chargesAvailable:true,reportOnly:true,asOf:source.as_of,reportedTotal:(report?.total_cents??0)/100,detailsAvailable,listedInReport:Boolean(report)}];
  }));
}
export async function findStudentFees(studentId: string, classRoom: string) {
  const db=getRawDb();
  const state=await db.prepare("SELECT version FROM fee_import_state WHERE id='active'").first<{version:string}>();
  if (!state) return { charges: [], chargesAvailable: false };
  const report=await db.prepare("SELECT source_id,total_cents,details_available FROM fee_reports WHERE id=?").bind(`${state.version}:${studentId}`).first<Report>();
  const source=report ? await db.prepare("SELECT source_id,as_of,complete FROM fee_sources WHERE id=?").bind(`${state.version}:${report.source_id}`).first<Source>() : await db.prepare("SELECT source_id,as_of,complete FROM fee_sources WHERE import_version=? AND class_room=?").bind(state.version,classRoom).first<Source>();
  if (!source) return confirmedPaidCohort(classRoom,state.version) ?? { charges: [], chargesAvailable: false, reportOnly: true };
  if (report && report.total_cents === null) return { charges: [], chargesAvailable: false, reportOnly: true, detailsAvailable: false, asOf: source.as_of };
  const entries=await db.prepare("SELECT academic_year,semester,class_room,item,outstanding_cents FROM fee_entries WHERE import_version=? AND student_id=? ORDER BY academic_year DESC,semester DESC").bind(state.version,studentId).all<Entry>();
  // A missing detail caused by an incomplete import is not a blank report cell.
  const detailsAvailable=report ? Boolean(report.details_available) : true;
  const terms=detailsAvailable ? (await db.prepare("SELECT DISTINCT academic_year,semester,class_room FROM fee_entries WHERE import_version=? AND source_id=? ORDER BY academic_year DESC,semester DESC").bind(state.version,source.source_id).all<Pick<Entry,"academic_year"|"semester"|"class_room">>()).results : [];
  const rows=detailsAvailable ? includePaidTerms(entries.results,terms) : entries.results;
  return {
    charges: rows.map(e=>({ academicYear:e.academic_year, semester:e.semester, classRoom:e.class_room, item:e.item, due:null, paid:null, outstanding:e.outstanding_cents/100, updatedAt:"10 ก.ย. 2569" })),
    chargesAvailable:true, reportOnly:true, asOf:source.as_of, reportedTotal:(report?.total_cents ?? 0)/100,
    detailsAvailable, listedInReport:Boolean(report),
  };
}
