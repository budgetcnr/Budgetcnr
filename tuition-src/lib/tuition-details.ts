type FeeItem = readonly [label: string, amount: number];
type TuitionDetails = { items: FeeItem[]; pdfFilename: string };

const specialist: FeeItem = ["ค่าจ้างครูที่มีความเชี่ยวชาญในสาขาเฉพาะ", 600];
const foreignTeacher: FeeItem = ["ค่าจ้างครูชาวต่างประเทศ", 500];
const airConditioning: FeeItem = ["ค่าสาธารณูปโภคสำหรับห้องเรียนปรับอากาศ", 500];
const computing: FeeItem = ["ค่าสอนคอมพิวเตอร์กรณีจัดคอมพิวเตอร์เกินมาตรฐานที่รัฐจัดให้", 500];
const staff: FeeItem = ["ค่าจ้างบุคลากรที่ปฏิบัติงานในสถานศึกษา", 800];
const languageClassroom: FeeItem = ["ห้องเรียนพิเศษด้านภาษา", 8750];
const chineseTeacher: FeeItem = ["ค่าจ้างครูสอนภาษาจีน", 300];

const regular = [specialist, foreignTeacher, airConditioning, computing, staff];

function esmp(classroomFee: number): FeeItem[] {
  return [
    ["ห้องเรียนพิเศษวิทยาศาสตร์-คณิตศาสตร์ และอื่น ๆ", classroomFee],
    foreignTeacher, specialist, airConditioning, computing, staff,
  ];
}

const lowerIep: FeeItem[] = [
  languageClassroom, specialist, chineseTeacher, airConditioning, staff, computing,
  ["เงินสนับสนุนกิจกรรมโครงการพิเศษภาคภาษาอังกฤษ", 2550],
];
const upperIep: FeeItem[] = [
  languageClassroom, specialist, airConditioning, staff, computing,
  ["เงินสนับสนุนกิจกรรมโครงการพิเศษภาคภาษาอังกฤษ", 2850],
];

const lowerPrograms = new Map<string, TuitionDetails>([
  ["ปกติ", { items: [specialist, foreignTeacher, chineseTeacher, airConditioning, computing, staff], pdfFilename: "lower-regular.pdf" }],
  ["ESMP", { items: esmp(10000), pdfFilename: "lower-esmp.pdf" }],
  ["IEP", { items: lowerIep, pdfFilename: "lower-iep.pdf" }],
]);
const upperPrograms = new Map<string, TuitionDetails>([
  ["ปกติ", { items: regular, pdfFilename: "upper-regular.pdf" }],
  ["ESMP", { items: esmp(7500), pdfFilename: "upper-esmp.pdf" }],
  ["IEP", { items: upperIep, pdfFilename: "upper-iep.pdf" }],
  ["ญี่ปุ่น", { items: regular, pdfFilename: "upper-japanese.pdf" }],
  ["จีน", {
    items: [specialist, foreignTeacher, ["ค่าจ้างครูสอนภาษาจีน", 1200], airConditioning, computing, staff],
    pdfFilename: "upper-chinese.pdf",
  }],
  ["ฝรั่งเศส", {
    items: [specialist, foreignTeacher, ["ค่าจ้างครูสอนภาษาฝรั่งเศส", 300], airConditioning, computing, staff],
    pdfFilename: "upper-french.pdf",
  }],
]);

export function getTuitionDetails(classRoom: string, studyProgram?: string) {
  const gradeMatch = classRoom.trim().match(/^(?:ม\.\s*)?([1-6])(?:\s*\/\s*\d+)?$/);
  if (!gradeMatch || !studyProgram) return undefined;

  const grade = Number(gradeMatch[1]);
  const program = studyProgram.trim().toUpperCase();
  // The lower-secondary IEP notice covers only ม.1 and ม.2.
  if (grade === 3 && program === "IEP") return undefined;
  return (grade >= 4 ? upperPrograms : lowerPrograms).get(program);
}
