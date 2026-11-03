// 실행: cd functions && node ../tools/test-admin/reqtest.js ../functions/index.js (가짜 DB, 네트워크 없음)
// 신청 자동 마감(첫 마감 예고)·쉬는 회원 마감·2주 쉬기 알림·답 대기 5건 막기 시험 (2026-11-01 v516)
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
process.env.NUM_ENC_KEY=crypto.randomBytes(32).toString('hex');
process.env.BRIDGE_LOCAL_TEST='1';
let DB={}; let revoked=0; const alerts=[];
const clone=(v)=>v&&JSON.parse(JSON.stringify(v));
const docOf=(col,id)=>({id,get:async()=>{const v=(DB[col]||{})[id];return {exists:!!v,id,data:()=>clone(v)};},set:async(o,opt)=>{(DB[col]=DB[col]||{})[id]=Object.assign({},opt&&opt.merge?(DB[col]||{})[id]:{},o);},update:async(o)=>{Object.assign(DB[col][id],o);},delete:async()=>{if(DB[col])delete DB[col][id];}});
const query=(c,filters,lim)=>({where:(f,op,v)=>query(c,filters.concat([[f,v,op]]),lim),limit:(n)=>query(c,filters,n),orderBy:()=>query(c,filters,lim),
  get:async()=>{const docs=Object.entries(DB[c]||{}).filter(([id,x])=>filters.every(([f,v,op])=>op==='>'?x[f]>v:x[f]===v)).map(([id,x])=>({id,data:()=>clone(x)}));return {docs,empty:!docs.length,size:docs.length,forEach:(fn)=>docs.forEach(fn)};}});
const db={collection:(c)=>Object.assign(query(c,[],0),{doc:(id)=>docOf(c,id||crypto.randomUUID()),add:async(o)=>{(DB[c]=DB[c]||{})[crypto.randomUUID()]=o;}}),
 doc:(p)=>{const [c,id]=p.split('/');return docOf(c,id);},
 runTransaction:async(fn)=>fn({get:(r)=>r.get(),update:(r,o)=>r.update(o),set:(r,o,opt)=>r.set(o,opt)})};
const rl=Module._load;
Module._load=function(r){ if(r==='firebase-admin'){const a={initializeApp(){},firestore:()=>db,auth:()=>({createCustomToken:async(uid,cl)=>JSON.stringify({uid,cl}),revokeRefreshTokens:async()=>{revoked++;}})};a.firestore.FieldValue={delete:()=>({}),arrayUnion:()=>({})};a.messaging=()=>({send:async()=>{},sendEachForMulticast:async(x)=>{(global.__sent=global.__sent||[]).push(x);return {responses:[]};}});return a;}
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
  // 사진 먼저 볼게요: 보류 + 부탁 표시, 내 사진은 안 열림, 보낸 사람이 공개하면 보임 (2026-11-02)
  FAKE_NOW = Date.parse('2026-11-20T12:00:00Z');
  const pr={id:'p',type:'photo',fromId:M,toId:A,note:'안녕하세요 반가워요',submittedAt:agoF(1)};
  const askMsg='사진을 먼저 보고 결정하고 싶어요. 사진을 공개해 주시면 답할게요!';
  DB = seed(); st=DB.app.state; st.dateRequests=[{...pr}];
  await m.chatAction.run({op:'reqHold',as:A,id:'p',msg:askMsg,askReveal:true},mctx(A,{m:1}));
  rr=DB.app.state.dateRequests[0];
  ok(rr.held&&rr.askReveal===true&&rr.heldBy==='user'&&!rr.approved,'사진 먼저 볼게요 → 보류 + 부탁 표시');
  ok(!aclFn(DB.app.state)[A].viewers.includes(M),'눌러도 내 사진은 상대에게 안 열림');
  ok(!aclFn(DB.app.state)[M].viewers.includes(A),'공개 전이라 상대 사진도 아직 안 보임');
  ok((DB.app.state.logs||[]).some(l=>/사진 먼저 보기 부탁 →/.test(String(l.detail))),'기록에 부탁으로 남음 (버튼 쓰임 재기)');
  await m.chatAction.run({op:'reqReveal',as:M,id:'p'},mctx(M,{m:1}));
  rr=DB.app.state.dateRequests[0];
  ok(aclFn(DB.app.state)[M].viewers.includes(A)&&rr.held,'보낸 사람이 공개하면 보이고, 결정은 받은 사람 몫(보류 그대로)');
  // 일반 보류·먼저 공개한 요청엔 부탁 표시 없음, 다시 보내면 지움
  DB = seed(); st=DB.app.state; st.dateRequests=[{...pr}];
  await m.chatAction.run({op:'reqHold',as:A,id:'p',msg:'직장이 궁금해요 알려 주세요'},mctx(A,{m:1}));
  ok(!DB.app.state.dateRequests[0].askReveal,'일반 보류엔 부탁 표시 없음');
  DB = seed(); st=DB.app.state; st.dateRequests=[{...pr,fromRevealed:true}];
  await m.chatAction.run({op:'reqHold',as:A,id:'p',msg:askMsg,askReveal:true},mctx(A,{m:1}));
  ok(!DB.app.state.dateRequests[0].askReveal,'이미 공개한 요청엔 부탁 표시 없음');
  DB = seed(); st=DB.app.state; st.dateRequests=[{...pr,held:true,heldBy:'user',holdMessage:askMsg,askReveal:true}];
  await m.chatAction.run({op:'reqReapply',as:M,id:'p',note:'다시 부탁드려요 반가워요 잘 부탁해요'},mctx(M,{m:1}));
  ok(!DB.app.state.dateRequests[0].askReveal,'다시 보내면 부탁 표시 지움');
  // 보류 자동 마감: 보류 7일, 보류 뒤 공개했으면 공개 7일, 관리자 보류 제외, 고침 전 보류는 11-10 00시(KST) 뒤
  const heldRow=(o)=>Object.assign({},pr,{held:true,heldBy:'user',holdMessage:askMsg,submittedAt:agoF(20)},o);
  const runHeld=async(rows)=>{DB=seed();DB.app.state.dateRequests=rows;await m.remindPending.run();return DB.app.state.dateRequests;};
  let hr=await runHeld([heldRow({decidedAt:agoF(8)})]);
  ok(hr[0].expired&&hr[0].rejected&&hr[0].expiredWhy==='held'&&!hr[0].held,'보류 8일 → 자동 마감');
  hr=await runHeld([heldRow({decidedAt:agoF(6)})]);
  ok(!hr[0].expired&&hr[0].held,'보류 6일 → 그대로');
  hr=await runHeld([heldRow({decidedAt:agoF(8),fromRevealed:true,fromRevealedAt:agoF(2)})]);
  ok(!hr[0].expired&&hr[0].held,'보류 8일이어도 사진 공개가 2일 전이면 그대로');
  hr=await runHeld([heldRow({decidedAt:agoF(8),heldBy:'admin'})]);
  ok(!hr[0].expired&&hr[0].held,'관리자 보류는 자동 마감 안 함');
  hr=await runHeld([heldRow({decidedAt:agoF(8),fromRevealed:true})]);
  ok(hr[0].expired&&!aclFn({entries:[{id:M},{id:A}],dateRequests:hr})[M].viewers.includes(A),'공개한 채 보류 마감되면 사진도 닫힘');
  FAKE_NOW = Date.parse('2026-11-05T12:00:00Z');
  hr=await runHeld([heldRow({decidedAt:agoF(30)})]);
  ok(!hr[0].expired&&hr[0].held,'고침 전 오래된 보류도 11-10 전엔 그대로');
  FAKE_NOW = Date.parse('2026-11-10T01:00:00Z');
  hr=await runHeld([heldRow({decidedAt:agoF(30)})]);
  ok(hr[0].expired&&hr[0].expiredWhy==='held','고침 전 오래된 보류는 11-10 00시(KST) 뒤 마감');
  FAKE_NOW = 0;
  // 베타는 푸시가 꺼져 있어 문구는 여기서 확인: 부탁은 '사진 공개 부탁', 일반 보류는 '요청 보류'
  const pushOf=async(after)=>{global.__sent=[];DB=seed();(DB.pushTokens=DB.pushTokens||{})[M]={tokens:['t-m'],token:'t-m'};const b={...DB.app.state,dateRequests:[{...pr}]},a={...DB.app.state,dateRequests:[after]};await m.onStateChange.run({before:{data:()=>clone(b)},after:{data:()=>clone(a)}},{params:{}});return global.__sent.map(x=>x.data||{});};
  let pu=await pushOf({...pr,held:true,heldBy:'user',holdMessage:askMsg,askReveal:true});
  ok(pu.some(d=>d.title==='📷 사진 공개 부탁'&&/사진을 먼저 보고 결정하고 싶어 해요/.test(d.body)),'부탁 → 보낸 사람에게 사진 공개 부탁 푸시'+(pu.length?'':' (푸시 없음)'));
  pu=await pushOf({...pr,held:true,heldBy:'user',holdMessage:'직장이 궁금해요 알려 주세요'});
  ok(pu.some(d=>d.title==='사진 요청 보류'&&/요청을 보류했어요/.test(d.body)),'일반 보류 → 예전 푸시 그대로'+(pu.length?'':' (푸시 없음)'));
  // 신청 글 속 연락처: 회원 모두가 읽는 app/state 엔 안 남고, 두 사람·주선자는 원문 그대로 (2026-11-03)
  const PH='010-1234-5678',KK='K'.repeat(20),PRIV='🔒 연락처가 담겨 있어 두 분만 볼 수 있어요.';
  const privSeed=(rows)=>{DB=seed();DB.app.state.entries.push({id:KK,nickname:'주선자',isMatchmaker:true});DB.app.state.entries.find(e=>e.id===B).managedBy=KK;DB.app.state.dateRequests=rows;delete DB.reqPrivate;};
  const row=()=>({id:'c1',type:'contact',fromId:B,toId:A,note:'안녕하세요 대화 신청드려요',submittedAt:agoF(1)});
  const stOf=(id='c1')=>DB.app.state.dateRequests.find(r=>r.id===id);
  const noPhone=()=>JSON.stringify(DB.app.state).indexOf('1234-5678')<0;
  privSeed([row()]);
  await m.chatAction.run({op:'reqApprove',as:A,id:'c1',msg:'제 번호는 '+PH+' 입니다 연락주세요'},mctx(A,{m:1}));
  ok(stOf().approved&&stOf().approveMessage===PRIV,'번호 든 답장 → 승인되고 state 엔 안내 문구만');
  ok(noPhone(),'번호가 state 어디에도 없음');
  ok(DB.reqPrivate&&DB.reqPrivate.c1&&DB.reqPrivate.c1.texts.approveMessage.indexOf(PH)>=0,'원문은 reqPrivate 에 그대로');
  ok(DB.reqPrivate&&[A,B,KK].every(x=>DB.reqPrivate.c1.viewers.includes(x))&&DB.reqPrivate.c1.viewers.length===3,'읽는 사람 = 두 사람 + 담당 주선자');
  privSeed([row()]);
  await m.chatAction.run({op:'reqApprove',as:A,id:'c1',msg:'네 반갑습니다 대화해 보아요'},mctx(A,{m:1}));
  ok(stOf().approveMessage==='네 반갑습니다 대화해 보아요'&&!DB.reqPrivate,'연락처 없는 답장은 예전 그대로');
  privSeed([row()]);
  await m.chatAction.run({op:'reqReject',as:A,id:'c1',msg:'죄송해요 '+PH+' 로 연락 주세요'},mctx(A,{m:1}));
  ok(stOf().rejectMessage===PRIV&&noPhone(),'거절 글도 옮김');
  privSeed([row()]);
  await m.chatAction.run({op:'reqHold',as:A,id:'c1',msg:'궁금한 게 있어요 '+PH+' 로 주세요'},mctx(A,{m:1}));
  ok(stOf().holdMessage===PRIV&&noPhone(),'보류 글도 옮김');
  privSeed([]);
  const cr=await m.chatAction.run({op:'reqCreate',as:M,to:A,type:'contact',note:'dohan03 카톡아이디로 연락주세요'},mctx(M,{m:1}));
  ok(stOf(cr.id).note===PRIV&&DB.reqPrivate[cr.id].texts.note.indexOf('dohan03')>=0&&JSON.stringify(DB.app.state).indexOf('dohan03')<0,'처음 보내는 글의 카톡 아이디도 옮김');
  privSeed([Object.assign(row(),{approved:true,approveMessage:'제 번호는 '+PH+' 입니다',decidedAt:agoF(40)}),Object.assign(row(),{id:'c2',approved:true,approveMessage:'네 반갑습니다 대화해요',decidedAt:agoF(2)})]);
  await m.remindPending.run();
  ok(stOf().approveMessage===PRIV&&noPhone(),'예전 답장도 다음 정기 실행 때 옮김');
  ok(DB.reqPrivate&&DB.reqPrivate.c1&&DB.reqPrivate.c1.texts.approveMessage.indexOf(PH)>=0,'오래된 답장도 원문을 지우지 않음 (상대가 못 봤을 수 있음)');
  ok(stOf('c2').approveMessage==='네 반갑습니다 대화해요'&&!(DB.reqPrivate&&DB.reqPrivate.c2),'다른 답장은 그대로');
  await m.remindPending.run();
  ok(DB.reqPrivate&&DB.reqPrivate.c1&&DB.reqPrivate.c1.texts.approveMessage.indexOf(PH)>=0,'두 번 돌아도 원문이 안내 문구로 덮이지 않음');
  privSeed([Object.assign(row(),{approved:true,approveMessage:PRIV}),Object.assign(row(),{id:'c3',fromId:'없는회원',approved:true,approveMessage:PRIV})]);
  DB.reqPrivate={c1:{viewers:[A],texts:{approveMessage:PH}},c3:{viewers:[A],texts:{approveMessage:PH}},gone:{viewers:[A],texts:{note:PH}}};
  if(m._purgeReqPrivateForTest)await m._purgeReqPrivateForTest(DB.app.state);
  ok(!DB.reqPrivate.gone,'신청이 사라지면 원문도 지움');
  ok(!DB.reqPrivate.c3,'회원이 삭제되면 원문도 지움');
  ok(DB.reqPrivate.c1&&DB.reqPrivate.c1.texts.approveMessage===PH&&DB.reqPrivate.c1.viewers.length===3,'살아 있는 신청은 원문 유지, 읽는 사람만 새로 맞춤');

  // 🧭 주간 행동 보고: 베니 님만, 제재 아님 (2026-11-03)
  const NOWB=Date.parse('2026-11-09T00:30:00Z'),at=(d)=>new Date(NOWB-d*86400000).toISOString(),mins=(iso,n)=>new Date(Date.parse(iso)+n*60000).toISOString();
  let lid=0;const lg=(iso,actor,detail)=>({id:'l'+(++lid),at:iso,type:'request',actor,detail});
  const closeSet=(a,n,gap)=>Array.from({length:n}).flatMap((_,i)=>[lg(at(5+i),a,'사진 요청 수락 → 상대'+i),lg(mins(at(5+i),gap),a,'사진 공개 회수 → 상대'+i)]);
  const bState={entries:[{id:'b1',nickname:'셋닫기'},{id:'b2',nickname:'둘닫기'},{id:'b3',nickname:'늦닫기'},{id:'b4',nickname:'재요청'},{id:'b5',nickname:'한번'},{id:'b6',nickname:'차단둘'},{id:'b7',nickname:'차단하나'},{id:'b8',nickname:'시험',testAccount:true},{id:'b9',nickname:'대리',managedBy:'b10'},{id:'b10',nickname:'담당',isMatchmaker:true},{id:'b11',nickname:'옛일'},{id:'b12',nickname:'쉼',deactivated:true}],
   logs:[...closeSet('셋닫기',3,1),...closeSet('둘닫기',2,1),...closeSet('늦닫기',3,1500),...closeSet('시험',3,1),...closeSet('대리',3,60),...closeSet('쉼',3,1),...closeSet('탈퇴자',3,1),
    lg(at(40),'피치','사진 요청 거절 → 재요청'),lg(at(9),'재요청','사진 보기 요청 → 피치 (사진 공개)'),lg(at(8),'재요청','사진 요청 재신청 → 피치'),lg(at(7),'재요청','대화 신청 → 피치'),
    lg(at(3),'재요청','사진 보기 요청 → 처음보는분'),lg(at(2),'처음보는분','사진 요청 거절 → 재요청'),
    lg(at(6),'한번','사진 보기 요청 → 다른분'),lg(at(5),'다른분','사진 요청 거절 → 한번'),lg(at(4),'한번','사진 보기 요청 → 다른분'),
    lg(at(60),'옛분','사진 요청 거절 → 옛일'),lg(at(50),'옛일','사진 보기 요청 → 옛분'),lg(at(49),'옛일','사진 보기 요청 → 옛분'),lg(at(48),'옛일','사진 보기 요청 → 옛분')]};
  const bBlocks=[{ids:['b6','b7']},{ids:['b6']}];
  const bRows=m._buildBehaviorReportForTest?m._buildBehaviorReportForTest(bState,[],bBlocks,NOWB):[];
  const bBy=(n)=>bRows.find(r=>r.nick===n);
  ok(bBy('셋닫기')&&bBy('셋닫기').closes===3&&bBy('셋닫기').fast===3,'수락 직후 닫기 3번 → 올라감 (5분 안 3)');
  ok(!bBy('둘닫기'),'2번은 안 올라감');
  ok(!bBy('늦닫기'),'24시간 지나 닫은 건 안 셈');
  ok(!bBy('시험'),'시험 계정 뺌');
  ok(!bBy('탈퇴자'),'없는 회원 뺌');
  ok(bBy('대리')&&bBy('대리').mm==='담당'&&bBy('대리').fast===0,'대리 프로필엔 담당 주선자 표시');
  ok(bBy('쉼')&&bBy('쉼').resting===true,'쉬는 회원은 표시만');
  ok(bBy('재요청')&&bBy('재요청').again===3&&bBy('재요청').top==='피치 3','거절 뒤 재요청 3번 (거절 전 요청은 안 셈)');
  const accRows=m._buildBehaviorReportForTest?m._buildBehaviorReportForTest({entries:[{id:'k1',nickname:'수락후'},{id:'k2',nickname:'다시거절'}],logs:[
    lg(at(9),'상대A','사진 요청 거절 → 수락후'),lg(at(8),'수락후','사진 요청 재신청 → 상대A'),lg(at(7),'상대A','사진 요청 수락 → 수락후'),
    lg(at(6),'수락후','대화 신청 → 상대A'),lg(at(5),'상대A','대화 신청 수락 → 수락후'),lg(at(4),'수락후','사진 보기 요청 → 상대A'),lg(at(3),'수락후','사진 보기 요청 → 상대A'),
    lg(at(9),'상대B','사진 요청 거절 → 다시거절'),lg(at(8),'상대B','사진 요청 수락 → 다시거절'),lg(at(7),'상대B','대화 요청 거절 → 다시거절'),
    lg(at(6),'다시거절','대화 신청 → 상대B'),lg(at(5),'다시거절','사진 보기 요청 → 상대B'),lg(at(4),'다시거절','대화 요청 재신청 → 상대B'),
  ]},[],[],NOWB):[];
  ok(!accRows.some(r=>r.nick==='수락후'),'상대가 수락해 준 뒤 요청은 재요청으로 안 셈');
  ok(accRows.some(r=>r.nick==='다시거절'&&r.again===3),'수락 뒤 다시 거절되면 그때부터 다시 셈');
  ok(!bBy('한번'),'재요청 1번은 안 올라감');
  ok(!bBy('옛일'),'30일 넘은 재요청은 안 셈');
  ok(bBy('차단둘')&&bBy('차단둘').blockedBy===2&&!bBy('차단하나'),'차단 2명부터');
  ok(JSON.stringify(bRows).indexOf('blockers')<0,'누가 차단했는지는 안 담음');
  DB=seed();DB.app.state.entries.push(...bState.entries);DB.app.state.logs=bState.logs;DB.memberBlocks={x:bBlocks[0],y:bBlocks[1]};DB.pushTokens={admin:{tokens:['t-a'],token:'t-a'}};
  let denied=0;try{await m.chatAction.run({op:'behaviorReport'},mctx(A,{m:1}));}catch(e){denied++;}
  try{await m.chatAction.run({op:'behaviorReport'},ctx({admin:1,ao:Date.now()+60000}));}catch(e){denied++;}
  ok(denied===2,'회원·이번만 관리자는 못 봄');
  FAKE_NOW=Date.parse('2026-11-10T00:30:00Z');global.__sent=[];
  await m.remindPending.run();
  ok(!(DB.adminReports&&DB.adminReports.behavior),'월요일 9시 말고는 안 만듦');
  FAKE_NOW=NOWB;global.__sent=[];
  await m.remindPending.run();
  ok(DB.adminReports&&DB.adminReports.behavior&&DB.adminReports.behavior.rows.length>=4,'월요일 9시에 보고 만듦');
  let pushes=global.__sent.map(x=>x.data||{}).filter(d=>/행동 보고/.test(d.title||''));
  ok(pushes.length===1&&pushes[0].body.indexOf('셋닫기')<0,'관리자 푸시 1번, 잠금 화면에 이름 없음');
  global.__sent=[];FAKE_NOW=NOWB+60000;await m.remindPending.run();
  ok(!global.__sent.map(x=>x.data||{}).some(d=>/행동 보고/.test(d.title||'')),'같은 날 다시 돌아도 안 보냄');
  FAKE_NOW=NOWB+7*86400000;global.__sent=[];await m.remindPending.run();
  ok(!global.__sent.map(x=>x.data||{}).some(d=>/행동 보고/.test(d.title||'')),'새로 오른 회원이 없으면 다음 주엔 푸시 안 함');
  FAKE_NOW=NOWB;
  const got=await m.chatAction.run({op:'behaviorReport'},ctx({admin:1}));
  ok(got&&Array.isArray(got.rows)&&got.rows.length>=4,'관리자는 볼 수 있음');
  FAKE_NOW=0;
  console.log('\n'+pass+' OK, '+fail+' FAIL'); process.exit(fail?1:0);
})();
