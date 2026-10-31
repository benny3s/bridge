// 실행: cd functions && node ../tools/test-admin/pausetest.js ../functions/index.js (가짜 DB, 네트워크 없음)
// 휴면(쉬는 중) 계정 로그인·공개 목록 시험 (2026-10-31)
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
fs.writeFileSync(path.join(require('os').tmpdir(),'_pause_idx.js'),fs.readFileSync(process.argv[2],'utf8'));
const m=require(path.join(require('os').tmpdir(), '_pause_idx.js'));
const ctx=(token)=>({auth:{uid:'admin',token},rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
const salt=crypto.randomBytes(16);const pa={salt:salt.toString('base64'),hash:crypto.pbkdf2Sync('7391',salt,150000,32,'sha256').toString('base64')};
const R='R'.repeat(20),A2='Q'.repeat(20),N='N'.repeat(20);
let pass=0,fail=0;const ok=(c,msg)=>{if(c){pass++;console.log('  OK',msg);}else{fail++;console.log('  FAIL',msg);}};
const mctx=(uid,token)=>({auth:uid?{uid,token:token||{}}:null,rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 14) Chrome/150','x-forwarded-for':'1.2.3.4'},ip:'1.2.3.4'}});
(async()=>{
  DB={app:{state:{entries:[
    {id:R,nickname:'쉬는중',deactivated:true,deactivatedVia:'deactivate-request',pinSet:true},
    {id:A2,nickname:'관리자보관',deactivated:true,deactivatedVia:'admin',pinSet:true},
    {id:N,nickname:'보통',pinSet:true}]}},secrets:{[R]:{pinAuth:pa},[A2]:{pinAuth:pa},[N]:{pinAuth:pa}}};
  const tryLogin=async(id,pin)=>{try{const r=await m.memberLogin.run({entryId:id,pin:pin||'7391'},mctx(null));return {ok:true,r};}catch(e){return {ok:false,e};}};
  let x=await tryLogin(R); ok(x.ok && JSON.parse(x.r.token).uid===R,'잠시 쉬기 회원 로그인 됨'+(x.ok?'':' — '+x.e.message));
  x=await tryLogin(R,'0007'); ok(!x.ok && x.e.code==='permission-denied','잠시 쉬기 회원도 PIN 틀리면 거부');
  x=await tryLogin(A2); ok(x.ok,'관리자 보관 계정도 로그인 됨'+(x.ok?'':' — '+x.e.message));
  x=await tryLogin(N); ok(x.ok,'보통 회원 로그인 됨'+(x.ok?'':' — '+x.e.message));
  // 공개 요약(onStateChange 가 만드는 app/public) 의 로그인 목록·티저
  const st=DB.app.state; const before={data:()=>({})}, after={data:()=>clone(st)};
  try{await m.onStateChange.run({before,after},{params:{}});}catch(e){console.log('  (onStateChange err)',e.message);}
  const pub=(DB.app&&DB.app.public)||{};
  const dir=JSON.stringify(pub.loginDir||pub.login||pub);
  ok(dir.includes(R),'공개 로그인 목록에 쉬는 회원 있음');
  ok(dir.includes(A2),'공개 로그인 목록에 관리자 보관 회원도 있음');
  ok(!JSON.stringify(pub.teaser||[]).includes('관리자보관'),'티저엔 관리자 보관 회원 없음');
  ok(!JSON.stringify(pub.teaser||[]).includes('쉬는중'),'티저(명단 미리보기)엔 쉬는 회원 없음');
  console.log('\n'+pass+' OK, '+fail+' FAIL'); process.exit(fail?1:0);
})();
