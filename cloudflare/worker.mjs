import {teacherCheck,studentCheck} from './tuition-api.mjs';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/tuition')return Response.redirect(url.origin+'/tuition/',308);
  if(url.pathname.startsWith('/tuition/api/')){
   const headers={'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff'};
   if(url.pathname==='/tuition/api/health'&&request.method==='GET'){
    try{if(!env.DB||!env.ROSTER_CREDENTIAL_KEY)return Response.json({ready:false},{status:503,headers});await env.DB.prepare('SELECT 1').first();return Response.json({ready:true,version:'d1-migration-20261009'},{headers});}catch{return Response.json({ready:false},{status:503,headers});}
   }
   const handler=url.pathname==='/tuition/api/check'?teacherCheck:url.pathname==='/tuition/api/student-check'?studentCheck:null;
   if(!handler)return Response.json({error:'ไม่พบรายการ'},{status:404,headers});
   if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers:{...headers,allow:'POST'}});
   if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'รูปแบบข้อมูลไม่ถูกต้อง'},{status:415,headers});
   if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return Response.json({error:'Forbidden'},{status:403,headers});
   const body=await request.text();if(body.length>2048)return Response.json({error:'ข้อมูลยาวเกินกำหนด'},{status:413,headers});
   try{const response=await handler(new Request(request.url,{method:'POST',headers:request.headers,body}));const h=new Headers(response.headers);for(const [k,v]of Object.entries(headers))h.set(k,v);return new Response(response.body,{status:response.status,headers:h});}catch{return Response.json({error:'ระบบข้อมูลไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'},{status:503,headers});}
  }
  return env.ASSETS.fetch(request);
 }
};
