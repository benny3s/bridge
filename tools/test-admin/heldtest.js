// 실행: cd functions && node ../tools/test-admin/heldtest.js ../functions/index.js (가짜 DB, 네트워크 없음)
// 보류된 가입 신청 30일 정리 시험 (2026-11-01 v522)
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
process.env.NUM_ENC_KEY=crypto.randomBytes(32).toString('hex');
let DB={}; let revoked=0; const alerts=[];
const clone=(v)=>v&&JSON.parse(JSON.stringify(v));
const docOf=(col,id)=>({id,get:async()=>{const v=(DB[col]||{})[id];return {exists:!!v,id,data:()=>clone(v)};},set:async(o,opt)=>{(DB[col]=DB[col]||{})[id]=Object.assign({},opt&&opt.merge?(DB[col]||{})[id]:{},o);},update:async(o)=>{Object.assign(DB[col][id],o);},delete:async()=>{if(DB[col])delete DB[col][id];}});
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
fs.writeFileSync(path.join(require('os').tmpdir(),'_held_idx.js'),fs.readFileSync(process.argv[2],'utf8'));
const m=require(path.join(require('os').tmpdir(), '_held_idx.js'));
const ctx=(token)=>({auth:{uid:'admin',token},rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
const salt=crypto.randomBytes(16);const pa={salt:salt.toString('base64'),hash:crypto.pbkdf2Sync('7391',salt,150000,32,'sha256').toString('base64')};
const R='R'.repeat(20),A2='Q'.repeat(20),N='N'.repeat(20);
let pass=0,fail=0;const ok=(c,msg)=>{if(c){pass++;console.log('  OK',msg);}else{fail++;console.log('  FAIL',msg);}};
const mctx=(uid,token)=>({auth:uid?{uid,token:token||{}}:null,rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 14) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
const ago=(d)=>new Date(Date.now()-d*86400000).toISOString();
// 보류된 가입 신청 30일 정리 (2026-11-01 v522): 7일 전 본인 알림(낮만)·정리·관리자 기록·사진 지움·다시 보류되면 다시 알림
let FAKE_NOW = 0; const _realNow = Date.now; Date.now = () => FAKE_NOW || _realNow();
(async()=>{
  const A='A'.repeat(20),H1='H'.repeat(20),H2='G'.repeat(20),P3='P'.repeat(20);
  const seed = () => ({app:{state:{entries:[{id:A,nickname:'활동',gender:'female'}],dateRequests:[],logs:[],
    pendingEntries:[
      {id:H1,nickname:'옛보류',gender:'male',submittedAt:'2026-09-03T11:10:00Z',heldReason:'사진 보완',heldAt:'2026-09-12T06:26:00Z'},
      {id:H2,nickname:'새보류',gender:'male',submittedAt:'2026-11-10T00:00:00Z',heldReason:'사진 보완',heldAt:'2026-11-10T01:00:00Z'},
      {id:P3,nickname:'대기',gender:'female',submittedAt:'2026-09-01T00:00:00Z',aiAuditedAt:'2026-09-01T00:10:00Z'}]}},
    photos:{[H1]:{photos:['x']}}});
  const P=(id)=>(DB.app.state.pendingEntries||[]).find(p=>p.id===id);
  // ① 11-02 12:00 KST: 옛 보류 → 알림만 (정리는 11-09 00시)
  FAKE_NOW=Date.parse('2026-11-02T03:00:00Z'); DB=seed(); await m.remindPending.run();
  ok(P(H1) && P(H1).heldWarnAt,'옛 보류(9월) → 켠 날 낮에 7일 전 알림 표시');
  ok(P(H2) && !P(H2).heldWarnAt,'최근 보류 → 아직 알림 없음');
  ok(P(P3) && !P(P3).heldWarnAt,'보류 아닌 대기 신청 → 그대로');
  // ② 한밤(00:30 KST)엔 알림 미룸
  FAKE_NOW=Date.parse('2026-11-01T15:30:00Z'); DB=seed(); await m.remindPending.run();
  ok(P(H1) && !P(H1).heldWarnAt,'밤 00:30 → 알림 미룸');
  // ③ 11-09 00시 KST 지나면 옛 보류 정리 + 관리자 기록 + 사진 지움
  FAKE_NOW=Date.parse('2026-11-08T15:30:00Z'); DB=seed(); DB.app.state.pendingEntries[0].heldWarnAt='2026-11-02T03:00:00.000Z'; await m.remindPending.run();
  ok(!P(H1),'11-09 00시 지나면 옛 보류 신청 정리');
  ok((DB.app.state.logs||[]).some(l=>/옛보류/.test(l.detail||'')),'관리자 활동 기록에 남음');
  ok(!(DB.photos||{})[H1],'사진도 지움');
  ok(P(H2) && P(P3),'다른 신청은 그대로');
  // ④ 최근 보류: 보류+23일 낮 → 알림, 보류+30일 지나면 정리
  FAKE_NOW=Date.parse('2026-12-03T03:00:00Z'); DB=seed(); await m.remindPending.run();
  ok(P(H2) && P(H2).heldWarnAt,'보류 23일째 낮 → 알림');
  FAKE_NOW=Date.parse('2026-12-10T02:00:00Z'); DB=seed(); await m.remindPending.run();
  ok(!P(H2),'보류 30일 지나면 정리');
  // ⑤ 다시 보류되면(heldAt 새로) 예전 알림 표시는 무시하고 다시 알림
  FAKE_NOW=Date.parse('2026-12-03T03:00:00Z'); DB=seed(); DB.app.state.pendingEntries[1].heldWarnAt='2026-11-01T00:00:00.000Z'; await m.remindPending.run();
  ok(P(H2) && P(H2).heldWarnAt > '2026-11-02','다시 보류된 신청 → 다시 알림');
  FAKE_NOW=0;
  console.log('\n'+pass+' OK, '+fail+' FAIL'); process.exit(fail?1:0);
})();
