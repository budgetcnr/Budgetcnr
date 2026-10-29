import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import StudentLookup,{type LookupResult} from '@/components/student-lookup';
export default function StudentDetailsDialog({detail,onClose,returnFocus}:{detail:LookupResult;onClose:()=>void;returnFocus?:HTMLButtonElement|null}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;if(!dialog)return;
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  dialog.showModal();
  return ()=>{dialog.close();document.body.style.overflow=previous;returnFocus?.focus({preventScroll:true});};
 },[]);
 return <dialog ref={ref} className="student-detail-dialog" aria-labelledby="student-detail-title" onCancel={event=>{event.preventDefault();onClose();}} onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="student-detail-dialog-content">
   <header className="student-detail-dialog-header"><div><p className="text-xs font-medium text-slate-500">ตรวจสอบข้อมูลรายบุคคล</p><h2 id="student-detail-title" className="mt-1 text-lg font-semibold text-blue-950">รายละเอียดนักเรียน</h2></div><button type="button" autoFocus className="student-detail-close" onClick={onClose} aria-label="ปิดรายละเอียดนักเรียน"><X className="h-5 w-5"/></button></header>
   <div className="student-detail-dialog-body"><StudentLookup key={detail.student.studentId} initialResult={detail} embedded/></div>
  </div>
 </dialog>;
}
