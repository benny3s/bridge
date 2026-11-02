// 실행: cd functions && node ../tools/test-admin/reqtest.js ../functions/index.js (가짜 DB, 네트워크 없음)
// 신청 자동 마감(첫 마감 예고)·쉬는 회원 마감·2주 쉬기 알림·답 대기 5건 막기 시험 (2026-11-01 v516)
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
// 첫 마감(예전 신청 = 원래 7일과 11-05 00시 KST 중 늦은 쪽), 이후 7일 자동 마감·쉬는 회원 마감·2주 쉬기 알림·답 대기 5건 막기 (2026-11-01 v516)
let FAKE_NOW = 0; const _realNow = Date.now; Date.now = () => FAKE_NOW || _realNow();
const agoF = (d) => new Date(Date.now() - d * 86400000).toISOString();
(async()=>{
  const A='A'.repeat(20),B='B'.repeat(20),Z='Z'.repeat(20),M='M'.repeat(20),O='O'.repeat(20),F=['F1','F2','F3','F4','F5'].map(x=>x.repeat(10));
  const seed = () => ({app:{state:{entries:[
    {id:A,nickname:'활동여',gender:'female',pinSet:true},
    {id:Z,nickname:'쉬는여',gender:'female',deactivated:true,deactivatedVia:'deactivate-request',deactivatedAt:agoF(15),returnAt:agoF(1),pinSet:true},
    {id:'Y'.repeat(20),nickname:'쉬는여2',gender:'female',deactivated:true,deactivatedVia:'deactivate-request',returnAt:new Date(Date.now()+5*86400000).toISOString()},
    {id:O,nickname:'옛쉬기',gender:'female',deactivated:true,deactivatedVia:'deactivate-request',deactivatedAt:'2026-09-20T00:00:00Z'},
    {id:B,nickname:'남1',gender:'male',pinSet:true,submittedAt:agoF(3)},
    {id:M,nickname:'남2',gender:'male',pinSet:true}].concat(F.map((f,i)=>({id:f,nickname:'남f'+i,gender:'male'}))),
   dateRequests:[
    {id:'r1',type:'photo',fromId:B,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(8)},
    {id:'r2',type:'photo',fromId:B,toId:Z,note:'안녕하세요 반가워요',submittedAt:agoF(8)},
    {id:'r3',type:'photo',fromId:M,toId:Z,note:'안녕하세요 반가워요',submittedAt:agoF(2)},
    {id:'r4',type:'contact',fromId:M,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(2)}]}}});
  // ① 올린 날(11-01): 8일 된 신청도 바로 마감하지 않음 — 11-05 00시(KST)까지
  FAKE_NOW = Date.parse('2026-11-01T12:00:00Z'); DB = seed();
  await m.remindPending.run();
  let st=DB.app.state, R=(id)=>st.dateRequests.find(r=>r.id===id), E=(id)=>st.entries.find(e=>e.id===id);
  ok(!R('r1').expired && !R('r2').expired,'올린 날엔 8일 된 신청도 그대로 (첫 마감은 11-05부터)');
  ok(!E(O).returnNudged,'한 달 전 옛 쉬기는 갑자기 깨우지 않음');
  // ② 11-20: 그 뒤 신청은 7일 지나면 마감
  FAKE_NOW = Date.parse('2026-11-20T12:00:00Z'); DB = seed();
  await m.remindPending.run();
  st=DB.app.state;
  ok(R('r1').expired && R('r1').rejected && !R('r1').expiredWhy,'활동 회원이 8일 답 안 한 신청 → 자동 마감');
  ok(R('r2').expired && R('r2').expiredWhy==='resting','쉬는 회원이 받은 8일 된 신청 → 쉬는 중이라 마감');
  ok(!R('r3').expired && !R('r3').remind1Sent,'쉬는 회원이 받은 2일 된 신청 → 그대로, 독촉 없음');
  ok(R('r4').remind1Sent && !R('r4').expired,'활동 회원 2일 된 신청 → 독촉 1회 표시');
  ok(E(Z).returnNudged===true,'쉰 지 2주 된 회원 → 돌아오라는 알림 표시');
  ok(!E('Y'.repeat(20)).returnNudged,'2주 안 된 회원 → 아직 알림 없음');
  ok(!E(O).returnNudged,'옛 쉬기(2주가 11-02 전에 끝남) → 알림 없음');
  // ③ 예전 신청: 오래된 건 11-05 00시(KST), 덜 된 건 원래 7일 (2026-11-01 Benny: '기존 것들은 3일로')
  const seedOld = () => { const d = seed(); d.app.state.dateRequests[0].submittedAt='2026-10-20T00:00:00Z'; d.app.state.dateRequests[3].submittedAt='2026-10-31T00:00:00Z'; return d; };
  FAKE_NOW = Date.parse('2026-11-04T14:30:00Z'); DB = seedOld();
  await m.remindPending.run(); st=DB.app.state;
  ok(!R('r1').expired,'10-20 신청 → 11-05 00시 전엔 그대로');
  FAKE_NOW = Date.parse('2026-11-04T15:30:00Z'); DB = seedOld();
  await m.remindPending.run(); st=DB.app.state;
  ok(R('r1').expired,'10-20 신청 → 11-05 00시(KST) 지나면 마감 (켠 뒤 3일)');
  ok(!R('r4').expired,'10-31 신청(켤 때 2일 안 됨) → 11-05엔 그대로');
  await m.chatAction.run({op:'reqReapply',as:B,id:'r1',note:'다시 부탁드려요 반가워요 잘 부탁해요'},mctx(B,{m:1})); st=DB.app.state;
  ok(!R('r1').expired && !R('r1').rejected && !R('r1').remind1Sent && !R('r1').expiredWhy,'자동 마감된 신청을 다시 보내면 마감·독촉 표시도 지워짐');
  FAKE_NOW = Date.parse('2026-11-07T00:30:00Z'); DB = seedOld();
  await m.remindPending.run(); st=DB.app.state;
  ok(R('r4').expired,'10-31 신청 → 원래 7일(11-07) 지나면 마감');
  FAKE_NOW = 0;
  // 답 대기 5건이면 새 신청 막기
  DB = seed(); st=DB.app.state;
  st.dateRequests=F.map((f,i)=>({id:'c'+i,type:'photo',fromId:f,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)}));
  let err=null; try{await m.chatAction.run({op:"reqCreate",as:M,to:A,type:'contact',note:'안녕하세요 반가워요 잘 부탁해요'},mctx(M,{m:1}));}catch(e){err=e;}
  ok(err && err.code==='resource-exhausted' && /답장을 기다리는 신청이 많아요/.test(err.message),'답 대기 5건인 회원에게 새 신청 → 막힘'+(err?' ('+err.code+')':' — 안 막힘'));
  st.dateRequests=st.dateRequests.slice(0,4); err=null;
  try{await m.chatAction.run({op:"reqCreate",as:M,to:A,type:'contact',note:'안녕하세요 반가워요 잘 부탁해요'},mctx(M,{m:1}));}catch(e){err=e;}
  ok(!err,'답 대기 4건이면 새 신청 됨'+(err?' — '+err.message:''));
  // 사람 기준: 이미 사진 신청으로 기다리는 사람이 대화 신청을 더 보내도 됨 (다른 4명 + 나 = 5명)
  DB = seed(); st=DB.app.state;
  st.dateRequests=F.slice(0,4).map((f,i)=>({id:'c'+i,type:'photo',fromId:f,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)})).concat([{id:'cm',type:'photo',fromId:M,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)}]);
  err=null; try{await m.chatAction.run({op:"reqCreate",as:M,to:A,type:'contact',note:'안녕하세요 반가워요 잘 부탁해요'},mctx(M,{m:1}));}catch(e){err=e;}
  ok(!err,'이미 기다리는 사람의 두 번째 신청(사진→대화)은 막지 않음'+(err?' — '+err.message:''));
  // 주선자 친구 프로필 3개 + 같은 친구 대화 신청 + 1명 = 5건이지만 2명 → 새 사람 신청 됨
  DB = seed(); st=DB.app.state;
  const K='K'.repeat(20), X=['X1','X2','X3'].map(x=>x.repeat(10));
  st.entries.push({id:K,nickname:'주선자',isMatchmaker:true,gender:'male'}); X.forEach((x,i)=>st.entries.push({id:x,nickname:'친구'+i,gender:'male',managedBy:K}));
  st.dateRequests=X.map((x,i)=>({id:'x'+i,type:'photo',fromId:x,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)})).concat([
    {id:'x9',type:'contact',fromId:X[0],toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)},{id:'f0',type:'photo',fromId:F[0],toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)}]);
  err=null; try{await m.chatAction.run({op:"reqCreate",as:M,to:A,type:'contact',note:'안녕하세요 반가워요 잘 부탁해요'},mctx(M,{m:1}));}catch(e){err=e;}
  ok(!err,'주선자 친구 프로필 여럿은 한 사람으로 셈 → 신청함이 막히지 않음'+(err?' — '+err.message:''));
  // 다시 보내기도 5명 꽉 차면 막힘
  DB = seed(); st=DB.app.state;
  st.dateRequests=F.map((f,i)=>({id:'c'+i,type:'photo',fromId:f,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)})).concat([{id:'rm',type:'photo',fromId:M,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(9),rejected:true,expired:true,decidedAt:agoF(1)}]);
  err=null; try{await m.chatAction.run({op:'reqReapply',as:M,id:'rm',note:'다시 부탁드려요 반가워요 잘 부탁해요'},mctx(M,{m:1}));}catch(e){err=e;}
  ok(err && /기다리는 신청이 많아요/.test(err.message),'신청함이 5명으로 꽉 차면 다시 보내기도 막힘'+(err?'':' — 안 막힘'));
  // 먼저 공개한 사진: 거절·자동 마감되면 닫힘, 대기·보류 중엔 열림 (2026-11-02). 서버 ACL 과 화면 색인이 같아야 함
  const srcAll=fs.readFileSync(process.argv[2],'utf8').replace(/\r\n/g,'\n');
  const aclFn=new Function(srcAll.slice(srcAll.indexOf('function photoAclFor('),srcAll.indexOf('async function syncPhotoAcl('))+';return photoAclFor;')();
  const htmlAll=fs.readFileSync(path.join(path.dirname(process.argv[2]),'..','index.html'),'utf8');
  const permFn=new Function('var _permIdx=null,_permIdxFor=null;'+htmlAll.slice(htmlAll.indexOf('function permIndex(state)'),htmlAll.indexOf('function canViewPhotoOf('))+';return permIndex;')();
  const seesM=(rq)=>{const s0={entries:[{id:M},{id:A}],dateRequests:rq};return {srv:aclFn(s0)[M].viewers.includes(A),scr:!!((permFn(s0).photo[A]||{})[M])};};
  const chk=(rq,want,msg)=>{const v=seesM(rq);ok(v.srv===want&&v.scr===want,msg+' (서버 '+v.srv+' · 화면 '+v.scr+')');};
  const rv={id:'p',type:'photo',fromId:M,toId:A,note:'안녕하세요 반가워요',fromRevealed:true,submittedAt:agoF(1)};
  chk([rv],true,'대기 중이면 먼저 공개한 사진이 보임');
  chk([{...rv,held:true}],true,'보류 중이면 먼저 공개한 사진이 보임');
  chk([{...rv,rejected:true,rejectedBy:'user'}],false,'거절되면 먼저 공개한 사진이 닫힘');
  chk([{...rv,rejected:true,expired:true,rejectedBy:'auto'}],false,'답 없이 마감되면 먼저 공개한 사진이 닫힘');
  chk([{...rv,approved:true}],true,'수락되면 서로 보임');
  chk([{...rv,rejected:true},{id:'q',type:'photo',fromId:A,toId:M,approved:true,submittedAt:agoF(1)}],true,'거절돼도 반대쪽 요청이 수락돼 있으면 보임');
  // 실제 거절 동작을 거쳐도 닫힘
  DB = seed(); st=DB.app.state; st.dateRequests=[{...rv}];
  await m.chatAction.run({op:'reqReject',as:A,id:'p',msg:''},mctx(A,{m:1}));
  ok(!aclFn(DB.app.state)[M].viewers.includes(A),'거절 버튼을 누르면 사진 열람 목록에서 빠짐');
  // 끝난 요청에는 사진을 새로 공개할 수 없음
  DB = seed(); st=DB.app.state; st.dateRequests=[{id:'p',type:'photo',fromId:M,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1),rejected:true}];
  err=null; try{await m.chatAction.run({op:'reqReveal',as:M,id:'p'},mctx(M,{m:1}));}catch(e){err=e;}
  ok(err&&!DB.app.state.dateRequests[0].fromRevealed,'거절된 요청에는 사진을 새로 공개할 수 없음'+(err?'':' — 공개됨'));
  // 거절 뒤 다시 보내면 닫힌 채로 가고, 직접 공개하면 다시 열림
  DB = seed(); st=DB.app.state; st.dateRequests=[{...rv,rejected:true,fromRevealedAt:agoF(1)}];
  await m.chatAction.run({op:'reqReapply',as:M,id:'p',note:'다시 부탁드려요 반가워요 잘 부탁해요'},mctx(M,{m:1}));
  let rr=DB.app.state.dateRequests[0];
  ok(!rr.rejected&&!rr.fromRevealed&&!rr.fromRevealedAt,'거절 뒤 다시 보내면 사진은 닫힌 채로 감');
  await m.chatAction.run({op:'reqReveal',as:M,id:'p'},mctx(M,{m:1}));
  ok(DB.app.state.dateRequests[0].fromRevealed===true,'다시 보낸 요청에서 직접 공개하면 다시 열림');
  // 보류 뒤 다시 보내면 원래대로 열림
  DB = seed(); st=DB.app.state; st.dateRequests=[{...rv,held:true,holdMessage:'더 알고 싶어요 알려 주세요',heldBy:'user'}];
  await m.chatAction.run({op:'reqReapply',as:M,id:'p',note:'다시 부탁드려요 반가워요 잘 부탁해요'},mctx(M,{m:1}));
  rr=DB.app.state.dateRequests[0];
  ok(!rr.held&&rr.fromRevealed===true,'보류 뒤 다시 보내면 공개한 사진은 그대로 열림');
  console.log('\n'+pass+' OK, '+fail+' FAIL'); process.exit(fail?1:0);
})();
