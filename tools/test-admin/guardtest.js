// 실행: cd functions && node ../tools/test-admin/guardtest.js ../functions/index.js (가짜 DB, 네트워크 없음)
// 방어 기준값·공격자 목록을 서버 문서 security/guard 에서 읽는지 시험 (2026-11-03). 값은 전부 가짜.
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
process.env.NUM_ENC_KEY=crypto.randomBytes(32).toString('hex');
let DB={}; let failGuardRead=false; const guardErrors=[];
const clone=(v)=>v&&JSON.parse(JSON.stringify(v));
const mergeDoc=(cur,o)=>{const out=Object.assign({},cur);Object.entries(o).forEach(([k,v])=>{if(v&&v.__u)out[k]=Array.from(new Set((out[k]||[]).concat(v.__u)));else if(v&&v.__r)out[k]=(out[k]||[]).filter(x=>!v.__r.includes(x));else out[k]=v;});return out;};
const docOf=(col,id)=>({id,get:async()=>{if(col==='security'&&id==='guard'&&failGuardRead)throw new Error('read failed');const v=(DB[col]||{})[id];return {exists:!!v,id,data:()=>clone(v)};},set:async(o,opt)=>{(DB[col]=DB[col]||{})[id]=mergeDoc(opt&&opt.merge?(DB[col]||{})[id]:{},o);},update:async(o)=>{Object.assign(DB[col][id],o);},delete:async()=>{delete (DB[col]||{})[id];}});
const query=(c,filters,lim)=>({where:(f,op,v)=>query(c,filters.concat([[f,v,op]]),lim),limit:(n)=>query(c,filters,n),orderBy:()=>query(c,filters,lim),
  get:async()=>{const docs=Object.entries(DB[c]||{}).filter(([id,x])=>filters.every(([f,v,op])=>op==='>'?x[f]>v:x[f]===v)).map(([id,x])=>({id,data:()=>clone(x)}));return {docs,empty:!docs.length,size:docs.length,forEach:(fn)=>docs.forEach(fn)};}});
const db={collection:(c)=>Object.assign(query(c,[],0),{doc:(id)=>docOf(c,id||crypto.randomUUID()),add:async(o)=>{(DB[c]=DB[c]||{})[crypto.randomUUID()]=o;}}),
 doc:(p)=>{const [c,id]=p.split('/');return docOf(c,id);},
 getAll:(...refs)=>Promise.all(refs.map((r)=>r.get())),
 runTransaction:async(fn)=>fn({get:(r)=>r.get(),update:(r,o)=>r.update(o),set:(r,o,opt)=>r.set(o,opt)})};
const rl=Module._load;
Module._load=function(r){ if(r==='firebase-admin'){const a={initializeApp(){},firestore:()=>db,auth:()=>({createCustomToken:async(uid,cl)=>JSON.stringify({uid,cl}),revokeRefreshTokens:async()=>{}})};a.firestore.FieldValue={delete:()=>({}),arrayUnion:(...x)=>({__u:x}),arrayRemove:(...x)=>({__r:x})};a.messaging=()=>({send:async()=>{},sendEachForMulticast:async()=>({responses:[]})});return a;}
 if(r==='firebase-functions/v1'||r==='firebase-functions'){const c={};const s=()=>c;c.region=s;c.runWith=s;c.https={onCall:h=>({run:h}),HttpsError:class extends Error{constructor(code,msg){super(msg);this.code=code;}}};c.firestore={document:()=>({onUpdate:h=>({run:h}),onWrite:h=>({run:h}),onCreate:h=>({run:h})})};c.pubsub={schedule:()=>({timeZone:()=>({onRun:h=>({run:h})}),onRun:h=>({run:h})})};const f=function(){return c;};Object.assign(f,c);return Object.assign(c,{config:()=>({})});}
 return rl.apply(this,arguments);};
global.fetch=async()=>{throw new Error('no net')};
const load=(name)=>{const p=path.join(require('os').tmpdir(),name);fs.writeFileSync(p,fs.readFileSync(process.argv[2],'utf8'));return require(p);};
const m=load('_guard_idx.js');
const consoleError=console.error;
console.error=(...a)=>{if(String(a[0]).includes('[GUARD]'))guardErrors.push(a[0]);};
console.info=()=>{};
let pass=0,fail=0;const ok=(c,msg)=>{if(c){pass++;console.log('  OK',msg);}else{fail++;console.log('  FAIL',msg);}};
let NOW=Date.parse('2026-11-03T03:00:00Z');Date.now=()=>NOW;
const tick=(min)=>{NOW+=min*60000;};
const salt=crypto.randomBytes(16);const pa={salt:salt.toString('base64'),hash:crypto.pbkdf2Sync('7391',salt,150000,32,'sha256').toString('base64')};
const A='A'.repeat(20),B='B'.repeat(20);
const mctx=(ip)=>({auth:null,rawRequest:{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 14) Chrome/150','origin':'https://benny3s.github.io','x-appengine-user-ip':ip}}});
const seed=(guard,extra)=>{DB=Object.assign({app:{state:{entries:[{id:A,nickname:'가',gender:'female'},{id:B,nickname:'나',gender:'male'}],pendingEntries:[],dateRequests:[],logs:[]}},secrets:{[A]:{pinAuth:pa},[B]:{pinAuth:pa}}},guard?{security:{guard}}:{},extra||{});tick(6);};
const login=async(id,pin,ip,mod)=>{try{const r=await (mod||m).memberLogin.run({entryId:id,pin},mctx(ip));return {ok:true,r};}catch(e){return {ok:false,e};}};
const guardOf=(id)=>Object.entries(DB.loginGuard||{}).find(([k])=>k.startsWith('m_'+id));
const LOOSE={loginMaxFails:100,ipFailLimit:100,ipMultiTargetLimit:100,acctFailLimit:100,sprayTargets:100};
const mins=(t)=>Math.round((t-NOW)/60000);
(async()=>{
  console.log('문서가 없을 때');
  seed(null);
  for(let i=0;i<4;i++)await login(A,'0001','10.0.0.1');
  ok(!(guardOf(A)[1].lockedUntil),'기본값: 4번 틀려도 안 잠김');
  await login(A,'0001','10.0.0.1');
  ok(guardOf(A)[1].lockedUntil,'기본값: 5번째에 잠김');
  ok(guardErrors.length>0,'문서가 없으면 오류 기록에 남김');

  console.log('문서의 기준값');
  seed(Object.assign({},LOOSE,{loginMaxFails:2,lockBaseMin:7}));
  await login(A,'0001','10.0.0.2');
  ok(!guardOf(A)[1].lockedUntil,'잠금 기준 2: 1번째는 안 잠김');
  await login(A,'0001','10.0.0.2');
  ok(mins(guardOf(A)[1].lockedUntil)===7,'잠금 기준 2: 2번째에 문서의 시간(7분)만큼 잠김');

  seed(Object.assign({},LOOSE,{ipFailLimit:3,ipBlockMin:13}));
  await login(A,'0001','10.0.0.3');await login(A,'0001','10.0.0.3');
  ok(!Object.values(DB.loginIp)[0].blockedUntil,'IP 기준 3: 2번은 안 막힘');
  await login(A,'0001','10.0.0.3');
  ok(mins(Object.values(DB.loginIp)[0].blockedUntil)===13,'IP 기준 3: 3번째에 문서의 시간(13분)만큼 막힘');
  ok((DB.security.watch.ips||[]).includes('10.0.0.3'),'막힌 IP 는 감시 목록에');
  const third=await login(A,'7391','10.0.0.3');
  ok(!third.ok&&third.e.code==='resource-exhausted','막힌 IP 는 맞는 PIN 도 거부');

  seed(Object.assign({},LOOSE,{ipFailLimit:100,ipFailWindowMin:30}));
  await login(A,'0001','10.0.0.4');
  const before=Object.values(DB.loginIp)[0].fails.length;tick(31);
  await login(A,'0001','10.0.0.4');
  ok(before===1&&Object.values(DB.loginIp)[0].fails.length===1,'IP 실패 창 30분: 지난 실패는 안 셈');

  seed(Object.assign({},LOOSE,{ipMultiTargetLimit:2}));
  await login(A,'0001','10.0.0.5');
  ok(!Object.values(DB.loginIp)[0].blockedUntil,'계정 수 기준 2: 1개는 안 막힘');
  await login(B,'0001','10.0.0.5');
  ok(Object.values(DB.loginIp)[0].blockedUntil,'계정 수 기준 2: 2개째에 막힘');

  seed(Object.assign({},LOOSE,{acctFailLimit:2,acctLockMin:11}));
  await login(A,'0001','10.0.0.6');await login(A,'0001','10.0.0.7');
  ok(mins(Object.entries(DB.loginGuard).find(([k])=>k.startsWith('acct_'))[1].lockedUntil)===11,'계정 기준 2: 다른 IP 합쳐 2번째에 문서의 시간(11분)만큼 잠김');

  seed(Object.assign({},LOOSE,{sprayTargets:2,sprayLockMin:9}));
  await login(A,'0001','10.0.0.8');
  ok(!DB.loginGuard._spray.sprayUntil,'대입 기준 2: 1개 계정은 안 켜짐');
  await login(B,'0001','10.0.0.9');
  ok(mins(DB.loginGuard._spray.sprayUntil)===9,'대입 기준 2: 2개 계정에 켜지고 문서의 시간(9분)만큼');

  console.log('문서의 목록');
  seed(Object.assign({},LOOSE,{breachedIds:[A]}));
  await login(A,'1234','10.1.0.1');await login(B,'1234','10.1.0.2');
  const w=(DB.security.watch||{}).ips||[];
  ok(w.includes('10.1.0.1'),'탈취 계정에 쉬운 PIN = 감시 목록에');
  ok(!w.includes('10.1.0.2'),'다른 계정에 쉬운 PIN 은 감시 목록에 안 넣음');

  seed(Object.assign({},LOOSE,{breachedIds:[A],attackerIps:['10.2.0.9']}));
  DB.security.watch={ips:['10.2.0.1','10.2.0.9']};
  const in1=await login(A,'7391','10.2.0.1');const in2=await login(A,'7391','10.2.0.9');
  ok(in1.ok&&in2.ok,'탈취 계정의 맞는 PIN 은 들어옴');
  ok(!DB.security.watch.ips.includes('10.2.0.1'),'본인이 맞는 PIN 으로 들어오면 그 IP 는 감시에서 뺌');
  ok(DB.security.watch.ips.includes('10.2.0.9'),'문서의 공격자 IP 는 안 뺌');
  const log=await m.adminSecurityLog.run({},{auth:{uid:'admin',token:{admin:1}},rawRequest:{headers:{}}});
  ok(log.watch.includes('10.2.0.9'),'관리자 보안 기록에 공격자 IP 가 보임');

  console.log('5분 캐시');
  seed(Object.assign({},LOOSE,{loginMaxFails:2}));
  await login(A,'0001','10.3.0.1');
  DB.security.guard.loginMaxFails=100;tick(1);
  await login(A,'0001','10.3.0.1');
  ok(guardOf(A)[1].lockedUntil,'고쳐도 5분 안에는 전의 값');
  tick(6);
  await login(B,'0001','10.3.0.2');await login(B,'0001','10.3.0.2');
  ok(!guardOf(B)[1].lockedUntil,'5분 뒤에는 새 값');

  console.log('못 읽을 때');
  seed(Object.assign({},LOOSE,{loginMaxFails:2}));
  await login(A,'0001','10.4.0.1');
  failGuardRead=true;tick(6);
  await login(A,'0001','10.4.0.1');
  ok(guardOf(A)[1].lockedUntil,'읽기 실패면 마지막으로 읽은 값');
  const m2=load('_guard_idx2.js');
  seed(Object.assign({},LOOSE,{loginMaxFails:2}));
  await login(A,'0001','10.4.0.2',m2);await login(A,'0001','10.4.0.2',m2);
  ok(!guardOf(A)[1].lockedUntil,'처음부터 못 읽으면 기본값 (2번에 안 잠김)');
  for(let i=0;i<3;i++)await login(A,'0001','10.4.0.2',m2);
  ok(guardOf(A)[1].lockedUntil,'처음부터 못 읽으면 기본값 (5번째 잠김)');
  failGuardRead=false;

  console.log('공개 파일');
  const code=fs.readFileSync(process.argv[2],'utf8');
  const rules=fs.readFileSync(path.join(path.dirname(process.argv[2]),'..','firestore.rules'),'utf8');
  ok(!/match \/security\b/.test(rules)&&/match \/\{document=\*\*\}[\s\S]*allow read, write: if false/.test(rules),'security/guard 는 규칙에 없어 앱이 못 읽음');
  ok(!/notRevoked/.test(rules),'규칙에 탈취 계정 id 목록 없음');
  ok(!/WATCH_IPS|BREACHED_IDS/.test(code),'코드에 공격자 목록 없음');

  console.error=consoleError;
  console.log(pass+' OK, '+fail+' FAIL');
  process.exit(fail?1:0);
})().catch((e)=>{console.error=consoleError;console.error(e);process.exit(1);});
