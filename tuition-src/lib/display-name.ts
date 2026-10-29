/** Display-only title: keep official roster names intact for matching/imports. */
export function teacherDisplayName(value?:string|null) {
 const name=value?.trim();
 if(!name || name==='ไม่ระบุ')return 'ไม่ระบุ';
 const titled=name.replace(/(^|[\s,;]+)(?:นางสาว|นาง|นาย|ครู)\s*/g,(_match,space:string)=>`${space}ครู`);
 return titled.startsWith('ครู') ? titled : `ครู${titled}`;
}
