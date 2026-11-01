// 실행: cd functions && node ../tools/test-admin/coadmintest.js ../functions/index.js (가짜 DB, 네트워크 없음)
// PC AI 부관리자 결과 반영(pc_coadmin_apply) 시험 — 승인·보류·대신 신청·공격 신호 (2026-11-01 st 미정의로 승인 통째 실패한 일)
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
process.env.NUM_ENC_KEY=crypto.randomBytes(32).toString('hex');
let DB={}; let revoked=0; const alerts=[];
const clone=(v)=>v&&JSON.parse(JSON.stringify(v));
const docOf=(col,id)=>({id,get:async()=>{const v=(DB[col]||{})[id];return {exists:!!v,id,data:()=>clone(v)};},set:async(o,opt)=>{(DB[col]=DB[col]||{})[id]=Object.assign({},opt&&opt.merge?(DB[col]||{})[id]:{},o);},update:async(o)=>{Object.assign(DB[col][id],o);}});
const query=(c,filters,lim)=>({where:(f,op,v)=>query(c,filters.concat([[f,v,op]]),lim),limit:(n)=>query(c,filters,n),orderBy:()=>query(c,filters,lim),
  get:async()=>{const docs=Object.entries(DB[c]||{}).filter(([id,x])=>filters.every(([f,v,op])=>op==='>'?x[f]>v:x[f]===v)).map(([id,x])=>({id,data:()=>clone(x)}));return {docs,empty:!docs.length,size:docs.length,forEach:(fn)=>docs.forEach(fn)};}});
const db={collection:(c)=>Object.assign(query(c,[],0),{doc:(id)=>docOf(c,id||crypto.randomUUID()),add:async(o)=>{(DB[c]=DB[c]||{})[crypto.randomUUID()]=o;}}),
 doc:(p)=>{const [c,id]=p.split('/');return docOf(c,id);},
 runTransaction:async(fn)=>fn({get:(r)=>r.get(),update:(r,o)=>r.update(o),set:(r,o,opt)=>r.set(o,opt)})};
const rl=Module._load;
Module._load=function(r){ if(r==='firebase-admin'){const a={initializeApp(){},firestore:()=>db,auth:()=>({createCustomToken:async(uid,cl)=>JSON.stringify({uid,cl}),revokeRefreshTokens:async()=>{revoked++;}})};a.firestore.FieldValue={delete:()=>({}),arrayUnion:()=>({})};a.messaging=()=>({send:async()=>{},sendEachForMulticast:async()=>({responses:[]})});return a;}
 if(r==='firebase-functions/v1'||r==='firebase-functions'){const c={};const s=()=>c;c.region=s;c.runWith=s;c.https={onCall:h=>({run:h}),HttpsError:class extends Error{constructor(code,msg){super(msg);this.code=code;}}};c.firestore={document:()=>({onUpdate:h=>({run:h}),onWrite:h=>({run:h}),onCreate:h=>({run:h})})};c.pubsub={schedule:()=>({timeZone:()=>({onRun:h=>({run:h})}),onRun:h=>({run:h})})};const f=function(){return c};Object.assign(f,c);f.config=()=>({});return f;}
 return rl.apply(this,arguments);};
global.fetch=async()=>{throw new Error('no net')};
fs.writeFileSync(path.join(require('os').tmpdir(),'_req_idx.js'),fs.readFileSync(process.argv[2],'utf8'));
const m=require(path.join(require('os').tmpdir(), '_req_idx.js'));
const ctx=(token)=>({auth:{uid:'admin',token},rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
const salt=crypto.randomBytes(16);const pa={salt:salt.toString('base64'),hash:crypto.pbkdf2Sync('7391',salt,150000,32,'sha256').toString('base64')};
const R='R'.repeat(20),A2='Q'.repeat(20),N='N'.repeat(20);
let pass=0,fail=0;const ok=(c,msg)=>{if(c){pass++;console.log('  OK',msg);}else{fail++;console.log('  FAIL',msg);}};
const mctx=(uid,token)=>({auth:uid?{uid,token:token||{}}:null,rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 14) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
const ago=(d)=>new Date(Date.now()-d*86400000).toISOString();
process.env.PC_SYNC_KEY='k'.repeat(40);
(async()=>{
  const P1='P1'.repeat(10),P2='P2'.repeat(10),P3='P3'.repeat(10),P4='P4'.repeat(10),MM='MM'.repeat(10);
  const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)';
  DB={app:{state:{entries:[{id:MM,nickname:'주선자',isMatchmaker:true}],logs:[],pendingEntries:[
      {id:P1,nickname:'승인될분',gender:'female',submittedAt:ago(0.01)},
      {id:P2,nickname:'보류될분',gender:'female',submittedAt:ago(0.01)},
      {id:P3,nickname:'대신신청',gender:'female',managedBy:MM,submittedAt:ago(0.01)},
      {id:P4,nickname:'해외접속',gender:'male',submittedAt:ago(0.01)}]}},
    signups:{[P1]:{realIp:'1.1.1.1',country:'KR',ua},[P2]:{realIp:'2.2.2.2',country:'KR',ua},[P4]:{realIp:'4.4.4.4',country:'US',ua}}};
  const res=(id,action,extra)=>Object.assign({id,action,reason:'시험'},extra||{});
  let err=null;
  try{await m.aiConcierge.run({op:'pc_coadmin_apply',sync_key:'k'.repeat(40),pending_results:[res(P1,'APPROVE'),res(P2,'HOLD',{hold_reason:'얼굴 사진을 올려 주세요'}),res(P3,'APPROVE'),res(P4,'APPROVE')],edit_results:[]},{auth:null,rawRequest:{headers:{}}});}catch(e){err=e;}
  ok(!err,'승인 결과 반영이 오류 없이 끝남'+(err?' — '+err.message:''));
  const st=DB.app.state, inE=(id)=>st.entries.some(e=>e.id===id), P=(id)=>st.pendingEntries.find(e=>e.id===id);
  ok(inE(P1) && st.entries.find(e=>e.id===P1).aiAuditedAt,'AI 승인 → 회원 명단으로 (aiAuditedAt)');
  ok(P(P2) && P(P2).heldReason,'AI 보류 → 보류 안내');
  ok(inE(P3),'대신 신청(활동 주선자) → 신청 기록 없어도 승인');
  ok(P(P4) && P(P4).aiRiskHeld && !inE(P4),'해외 접속 → 승인 대신 관리자 확인');
  ok(st.logs.some(l=>/신청 자동 승인/.test(l.detail)),'활동 기록에 자동 승인 남음');
  console.log('\n'+pass+' OK, '+fail+' FAIL'); process.exit(fail?1:0);
})();
