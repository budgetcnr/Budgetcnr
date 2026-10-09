type Term = { academic_year:number; semester:number; class_room:string };
type Entry = Term & { item:string; outstanding_cents:number };

// School confirmation on 9 October 2569: no arrears files were produced
// for current M.1 and M.4 because those cohorts have paid in full.
// Bind this exception to the existing snapshot, not every future import.
export function confirmedPaidCohort(classRoom: string, reportVersion: string) {
  if (reportVersion !== "arrears-20260910-cb15bb667adb" || !/^ม\.[14]\s*\/\s*\d+$/.test(classRoom)) return null;
  return {
    charges: [{ academicYear:2569, semester:1, classRoom, item:"ค่าบำรุงการศึกษา", due:null, paid:null, outstanding:0, updatedAt:"9 ต.ค. 2569" }],
    chargesAvailable:true, reportedTotal:0, detailsAvailable:true,
    reportOnly:false, listedInReport:false, paymentConfirmed:true, asOf:"2026-10-09",
  };
}

// In the school's arrears report, a blank term means fully paid.
// Only use terms present in that classroom's imported report.
export function includePaidTerms(entries: Entry[], terms: Term[]) {
  const result=[...entries];
  for(const term of terms) {
    if(!result.some(row=>row.academic_year===term.academic_year && row.semester===term.semester)) {
      result.push({...term,item:"ค่าบำรุงการศึกษา",outstanding_cents:0});
    }
  }
  return result.sort((a,b)=>b.academic_year-a.academic_year || b.semester-a.semester);
}
