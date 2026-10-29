// 실행: 프로젝트 루트에서 node tools/test-admin/admintest.js (가짜 DB, 네트워크 없음)
// 관리자 '이번만 허용'·자기 등록 닫기 시험 (가짜 DB)
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
const src=fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'index.js'),'utf8')+'\nmodule.exports.__adminOk=adminOk;';
fs.writeFileSync(path.join(require('os').tmpdir(),'_adm_idx.js'),src);
const m=require(path.join(require('os').tmpdir(), '_adm_idx.js'));
const KT='kT'+'z'.repeat(20);{const o=m.adminDevice.run;m.adminDevice.run=(d,c)=>o(Object.assign(d.deviceId===('A'.repeat(20))?{deviceKey:KT}:{},d),c);}
const ctx=(token)=>({auth:{uid:'admin',token},rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
const T='A'.repeat(20), U='B'.repeat(20), V='C'.repeat(20);
let pass=0, fail=0; const ok=(c,msg)=>{if(c){pass++;console.log('  OK',msg);}else{fail++;console.log('  FAIL',msg);}};
(async()=>{
  const now=Date.now();
  console.log('1) claimsOf / adminOk');
  ok(m.__adminOk(ctx({admin:1}))===true,'ao 없는 관리자 = 관리자');
  ok(m.__adminOk(ctx({admin:1,ao:now+60000}))===true,'ao 아직 = 관리자');
  ok(m.__adminOk(ctx({admin:1,ao:now-1}))===false,'ao 지남 = 관리자 아님');
  DB={adminDevices:{[T]:{status:'trusted',name:'집 PC',keyHash:require('crypto').createHash('sha256').update(KT).digest('hex')}}};
  let e=null; try{await m.adminDevice.run({op:'list',deviceId:T},ctx({admin:1,ao:now-1}));}catch(x){e=x;}
  ok(e&&e.code==='permission-denied','지난 이번만 토큰으로 adminDevice 거부');

  console.log('2) enroll 닫힘');
  let r=await m.adminDevice.run({op:'enroll',deviceId:U},ctx({admin:1}));
  ok(r.trusted===false && !(DB.adminDevices[U]&&DB.adminDevices[U].status==='trusted'),'등록 안 된 기기 + 일반 관리자 토큰 → 등록 안 함');
  ok(Object.values(DB.adminAudit||{}).some(a=>a.status==='enroll-refused'),'enroll-refused 기록');
  r=await m.adminDevice.run({op:'enroll',deviceId:U},ctx({admin:1,ao:now+1000}));
  ok(r.trusted===false && r.onceUntil===now+1000,'이번만 토큰 → 등록 안 함, onceUntil 돌려줌');
  r=await m.adminDevice.run({op:'enroll',deviceId:T},ctx({admin:1}));
  ok(r.trusted===true && DB.adminDevices[T].lastAt,'믿을 기기 → 마지막 접속 갱신');

  console.log('3) 새 기기 → 이번만 허용');
  r=await m.adminLogin.run({password:'x',deviceId:U},ctx({}));  // 비번 틀림 경로 피하려고 adminKey 없음 → 실패 예상
})().then(async()=>{}).catch(()=>{}).finally(async()=>{
  // 비밀번호 검증은 건너뛰고 보류 문서를 직접 만들어 흐름 시험
  const now=Date.now();
  const pollKey='pk'+crypto.randomBytes(8).toString('hex');
  const hid='ah_'+'1'.repeat(24), hid2='ah_'+'2'.repeat(24);
  const sha=(s)=>crypto.createHash('sha256').update(s).digest('hex');
  DB.adminHolds={[hid]:{deviceId:U,status:'pending',at:new Date().toISOString(),expiresAt:now+600000,pollKeyHash:sha(pollKey),name:'회사 PC',device:'Windows PC Chrome',onceOk:true},
                 [hid2]:{deviceId:V,status:'pending',at:new Date().toISOString(),expiresAt:now+600000,pollKeyHash:sha(pollKey),name:'새 폰',device:'안드로이드 Chrome'}};
  let e=null; try{await m.adminDevice.run({op:'approve',holdId:hid,once:true,deviceId:U},ctx({admin:1,ao:now+5000}));}catch(x){e=x;}
  ok(e&&e.code==='permission-denied','이번만 기기는 다른 보류를 허용 못 함');
  let r=await m.adminDevice.run({op:'approve',holdId:hid,once:true,deviceId:T},ctx({admin:1}));
  ok(r.once===true && DB.adminHolds[hid].once===true,'믿을 기기에서 이번만 허용');
  r=await m.adminLogin.run({holdId:hid,pollKey,deviceId:U},ctx({}));
  const tk=JSON.parse(r.token);
  ok(r.once===true && tk.cl.admin===1 && tk.cl.ao>now+11*3600000 && tk.cl.ao<now+13*3600000,'토큰에 ao(약 12시간)');
  ok(!DB.adminDevices[U] || DB.adminDevices[U].status!=='trusted','이번만 기기는 믿을 기기 아님');
  e=null; try{await m.adminLogin.run({holdId:hid,pollKey,deviceId:U},ctx({}));}catch(x){e=x;}
  ok(e&&e.code==='failed-precondition','같은 승인으로 토큰 두 번 못 받음');
  r=await m.adminDevice.run({op:'approve',holdId:hid2,deviceId:T},ctx({admin:1}));
  r=await m.adminLogin.run({holdId:hid2,pollKey,deviceId:V},ctx({}));
  ok(!JSON.parse(r.token).cl.ao && DB.adminDevices[V].status==='trusted','그냥 허용 → 믿을 기기 등록, ao 없음');

  console.log('4) 목록·끊기');
  r=await m.adminDevice.run({op:'list',deviceId:T},ctx({admin:1}));
  ok(r.onces.length===1 && r.onces[0].id===hid,'목록에 살아 있는 이번만 1건');
  e=null; try{await m.adminDevice.run({op:'cutSessions',holdId:hid,deviceId:U},ctx({admin:1,ao:now+5000}));}catch(x){e=x;}
  ok(e&&e.code==='permission-denied','이번만 기기는 끊기 못 함');
  const rv=revoked;
  r=await m.adminDevice.run({op:'cutSessions',holdId:hid,deviceId:T},ctx({admin:1}));
  ok(revoked===rv+1 && DB.adminHolds[hid].onceCut===true,'끊기 → 세션 갱신 막음 + 표시');
  r=await m.adminDevice.run({op:'list',deviceId:T},ctx({admin:1}));
  ok(r.onces.length===0,'끊은 뒤 목록에서 빠짐');
  console.log('\n통과 '+pass+' · 실패 '+fail);
  process.exit(fail?1:0);
});
