import {getRawDb} from '@/db';
export type ClassroomTerm = {academicYear:number;semester:number;classRoom:string};
export async function loadClassHistories(studentIds:string[], legacy:Map<string,ClassroomTerm[]> = new Map()) {
  const histories=new Map<string,ClassroomTerm[]>();
  try {
    for(let offset=0;offset<studentIds.length;offset+=90){
      const ids=studentIds.slice(offset,offset+90);
      const rows=(await getRawDb().prepare(`SELECT student_id,academic_year,semester,class_room FROM student_classrooms WHERE student_id IN (${ids.map(()=>'?').join(',')}) ORDER BY academic_year DESC,semester DESC`).bind(...ids).all<{student_id:string;academic_year:number;semester:number;class_room:string}>()).results;
      for(const row of rows){const list=histories.get(row.student_id) ?? [];list.push({academicYear:row.academic_year,semester:row.semester,classRoom:row.class_room});histories.set(row.student_id,list);}
    }
  } catch(error) {
    // Keep existing logins available while the non-destructive migration is deployed.
    if(!String(error).includes('no such table: student_classrooms'))throw error;
    return legacy;
  }
  return histories;
}
