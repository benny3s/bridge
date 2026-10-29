// 실행: 프로젝트 루트에서 node tools/test-admin/pushtest.js (가짜 DB, 네트워크 없음)
// 관리자 알림 기기 묶기 + memberLogin App Check 시험 (가짜 DB)
const fs = require('fs'), path = require('path'), Module = require('module'), crypto = require('crypto');
process.env.NUM_ENC_KEY = crypto.randomBytes(32).toString('hex');
let DB = {}; let revoked = 0; const sent = []; let badTokens = new Set();
const clone = (v) => v && JSON.parse(JSON.stringify(v));
const DEL = { __del: 1 };
const isRemove = (v) => v && v.__arrayRemove;
function applyMerge(cur, o) {
  const out = Object.assign({}, cur || {});
  for (const [k, v] of Object.entries(o)) {
    if (v === DEL) delete out[k];
    else if (isRemove(v)) out[k] = (Array.isArray(out[k]) ? out[k] : []).filter((x) => !v.vals.includes(x));
    else out[k] = clone(v);
  }
  return out;
}
const docOf = (col, id) => ({ id, ref: null,
  get: async () => { const v = (DB[col] || {})[id]; return { exists: !!v, id, data: () => clone(v) }; },
  set: async (o, opt) => { DB[col] = DB[col] || {}; DB[col][id] = opt && opt.merge ? applyMerge(DB[col][id], o) : applyMerge({}, o); },
  update: async (o) => { DB[col][id] = applyMerge(DB[col][id], o); } });
const getPath = (x, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), x);
const query = (c, filters, lim) => ({ where: (f, op, v) => query(c, filters.concat([[f, v]]), lim), limit: (n) => query(c, filters, n), orderBy: () => query(c, filters, lim),
  get: async () => { let docs = Object.entries(DB[c] || {}).filter(([id, x]) => filters.every(([f, v]) => getPath(x, f) === v)).map(([id, x]) => ({ id, data: () => clone(x), ref: docOf(c, id) }));
    if (lim) docs = docs.slice(0, lim); return { docs, empty: !docs.length, size: docs.length, forEach: (fn) => docs.forEach(fn) }; } });
const db = { collection: (c) => Object.assign(query(c, [], 0), { doc: (id) => docOf(c, id || crypto.randomUUID()), add: async (o) => { (DB[c] = DB[c] || {})[crypto.randomUUID()] = clone(o); } }),
  doc: (p) => { const [c, id] = p.split('/'); return docOf(c, id); },
  batch: () => { const ops = []; return { set: (r, o, opt) => ops.push(() => r.set(o, opt)), delete: () => {}, commit: async () => { for (const f of ops) await f(); } }; },
  runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, o) => r.update(o), set: (r, o, opt) => r.set(o, opt) }) };
const rl = Module._load;
Module._load = function (r) {
  if (r === 'firebase-admin') {
    const a = { initializeApp() {}, firestore: () => db, auth: () => ({ createCustomToken: async (uid, cl) => JSON.stringify({ uid, cl }), revokeRefreshTokens: async () => { revoked++; } }) };
    a.firestore.FieldValue = { delete: () => DEL, arrayUnion: (...v) => ({ __arrayUnion: 1, vals: v }), arrayRemove: (...v) => ({ __arrayRemove: 1, vals: v }), serverTimestamp: () => new Date().toISOString(), increment: (n) => n };
    a.messaging = () => ({ send: async () => {}, sendEachForMulticast: async (m) => { sent.push(m.tokens.slice()); return { responses: m.tokens.map((t) => badTokens.has(t) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) }; } });
    return a;
  }
  if (r === 'firebase-functions/v1' || r === 'firebase-functions') {
    const c = {}; const s = () => c; c.region = s; c.runWith = s;
    c.https = { onCall: (h) => ({ run: h }), HttpsError: class extends Error { constructor(code, msg, details) { super(msg); this.code = code; this.details = details; } } };
    c.firestore = { document: () => ({ onUpdate: (h) => ({ run: h }), onWrite: (h) => ({ run: h }), onCreate: (h) => ({ run: h }) }) };
    c.pubsub = { schedule: () => ({ timeZone: () => ({ onRun: (h) => ({ run: h }) }), onRun: (h) => ({ run: h }) }) };
    const f = function () { return c; }; Object.assign(f, c); f.config = () => ({}); return f;
  }
  return rl.apply(this, arguments);
};
global.fetch = async () => { throw new Error('no net'); };
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'index.js'), 'utf8') + '\nmodule.exports.__sendToAdmin=sendToAdmin;';
fs.writeFileSync(path.join(require('os').tmpdir(), '_push_idx.js'), src);
const m = require(path.join(require('os').tmpdir(), '_push_idx.js'));
const KEYS = {}; const shaK = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
{ const orig = m.adminDevice.run; m.adminDevice.run = (d, c) => orig(Object.assign({ deviceKey: KEYS[d.deviceId] }, d), c); }
const ctx = (token, app) => ({ auth: { uid: 'admin', token }, app, rawRequest: { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/150', 'x-forwarded-for': '1.2.3.4' }, ip: '1.2.3.4' } });
const T = 'A'.repeat(20), U = 'B'.repeat(20), V = 'C'.repeat(20);
const tok = (ch) => 'f' + ch.repeat(140) + ':APA91b' + ch.repeat(20);
const TK1 = tok('1'), TK2 = tok('2'), TK3 = tok('3'), OLD1 = tok('7'), OLD2 = tok('8');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) { pass++; console.log('  OK', msg); } else { fail++; console.log('  FAIL', msg); } };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
(async () => {
  const now = Date.now();
  KEYS[T] = 'kT' + 'x'.repeat(20); KEYS[V] = 'kV' + 'y'.repeat(20);
  DB = { adminDevices: { [T]: { status: 'trusted', name: '베니 폰', keyHash: shaK(KEYS[T]) }, [V]: { status: 'trusted', name: '회사 PC', keyHash: shaK(KEYS[V]) } }, pushTokens: { admin: { tokens: [OLD1, OLD2, TK1] } } };

  console.log('1) pushOn — 믿을 기기만');
  let r = await m.adminDevice.run({ op: 'pushOn', deviceId: T, token: TK1 }, ctx({ admin: 1 }));
  ok(r.ok && DB.adminDevices[T].push && DB.adminDevices[T].push.token === TK1, '믿을 기기 T 에 토큰 묶임');
  ok(!DB.pushTokens.admin.tokens.includes(TK1) && DB.pushTokens.admin.tokens.length === 2, '같은 토큰은 옛 목록에서 빠짐');
  const audits = () => Object.values(DB.adminAudit || {}).filter((a) => a.status === 'push-on').length;
  const a1 = audits();
  await m.adminDevice.run({ op: 'pushOn', deviceId: T, token: TK1 }, ctx({ admin: 1 }));
  ok(audits() === a1, '같은 토큰 다시 = 기록 안 늘어남(앱 열 때마다 부름)');
  let e = await err(m.adminDevice.run({ op: 'pushOn', deviceId: U, token: TK2 }, ctx({ admin: 1 })));
  ok(e && e.code === 'permission-denied' && !(DB.adminDevices[U] && DB.adminDevices[U].push), '등록 안 된 기기 → 거부');
  e = await err(m.adminDevice.run({ op: 'pushOn', deviceId: U, token: TK2 }, ctx({ admin: 1, ao: now + 60000 })));
  ok(e && e.code === 'permission-denied', '이번만 세션 → 거부');
  e = await err(m.adminDevice.run({ op: 'pushOn', deviceId: T, token: TK2 }, ctx({ admin: 1, ao: now - 1 })));
  ok(e && e.code === 'permission-denied', '끝난 이번만 토큰(믿을 기기 id 를 대도) → 거부');
  e = await err(m.adminDevice.run({ op: 'pushOn', deviceId: T, token: 'short<script>' }, ctx({ admin: 1 })));
  ok(e && e.code === 'invalid-argument', '토큰 모양 이상 → 거부');
  e = await err(m.adminDevice.run({ op: 'pushOn', deviceId: T, token: TK1 }, ctx({ m: 1 })));
  ok(e && e.code === 'permission-denied', '회원 토큰 → 거부');
  await m.adminDevice.run({ op: 'pushOn', deviceId: V, token: TK3 }, ctx({ admin: 1 }));
  ok(DB.adminDevices[V].push.token === TK3, '회사 PC V 도 묶임');

  console.log('2) list');
  r = await m.adminDevice.run({ op: 'list', deviceId: T }, ctx({ admin: 1 }));
  const dT = r.devices.find((d) => d.id === T);
  ok(dT.push === true && r.legacyPush === 2, '목록에 🔔 표시·옛 목록 2개');
  ok(!JSON.stringify(r).includes(TK1), '목록 응답에 토큰 값은 안 나감');

  console.log('3) sendToAdmin — 묶인 것 + 옛 목록, 중복 없이');
  sent.length = 0;
  await m.__sendToAdmin('제목', '내용');
  ok(sent.length === 1 && sent[0].length === 4 && new Set(sent[0]).size === 4 && [TK1, TK3, OLD1, OLD2].every((t) => sent[0].includes(t)), '보낸 곳 = TK1·TK3·OLD1·OLD2');
  badTokens = new Set([TK3, OLD1]);
  await m.__sendToAdmin('제목', '내용');
  ok(!DB.adminDevices[V].push, '못 쓰는 토큰이면 그 기기 묶음 지움');
  ok(!DB.pushTokens.admin.tokens.includes(OLD1) && DB.pushTokens.admin.tokens.includes(OLD2), '옛 목록의 못 쓰는 토큰도 지움');
  badTokens = new Set();
  await m.adminDevice.run({ op: 'pushOn', deviceId: V, token: TK3 }, ctx({ admin: 1 }));

  console.log('4) 해제 → 그 기기 알림 끊김 + 옛 목록 비움');
  e = await err(m.adminDevice.run({ op: 'revoke', deviceId: U, targetId: V }, ctx({ admin: 1 })));
  ok(e && e.code === 'permission-denied', '등록 안 된 기기는 해제 못 함');
  r = await m.adminDevice.run({ op: 'revoke', deviceId: T, targetId: V }, ctx({ admin: 1 }));
  ok(DB.adminDevices[V].status === 'revoked' && !DB.adminDevices[V].push, 'V 해제 + 묶음 지움');
  ok(r.legacyCleared === 1 && DB.pushTokens.admin.tokens.length === 0, '옛 목록(1개) 통째로 비움');
  sent.length = 0;
  await m.__sendToAdmin('제목', '내용');
  ok(sent.length === 1 && sent[0].length === 1 && sent[0][0] === TK1, '해제 뒤엔 T 에만 감');
  DB.adminDevices[V].push = { token: TK3, at: 'x' };   // 해제된 기기에 묶음이 남아 있어도(옛 데이터)
  sent.length = 0;
  await m.__sendToAdmin('제목', '내용');
  ok(!sent[0].includes(TK3), '해제된 기기 묶음은 보내지 않음');
  r = await m.adminDevice.run({ op: 'list', deviceId: T }, ctx({ admin: 1 }));
  ok(r.devices.find((d) => d.id === V).push === false, '해제된 기기는 목록에서 🔔 아님');
  e = await err(m.adminDevice.run({ op: 'pushOn', deviceId: V, token: TK3 }, ctx({ admin: 1 })));
  ok(e && e.code === 'permission-denied', '해제된 기기는 다시 못 켬');

  console.log('5) pushOff · 옛 목록 비우기');
  DB.pushTokens.admin.tokens = [OLD2, TK1];
  await m.adminDevice.run({ op: 'pushOff', deviceId: T, token: TK1 }, ctx({ admin: 1 }));
  ok(!DB.adminDevices[T].push && !DB.pushTokens.admin.tokens.includes(TK1), 'T 끄기 → 묶음·옛 목록에서 지움');
  await m.adminDevice.run({ op: 'pushOn', deviceId: T, token: TK1 }, ctx({ admin: 1 }));
  e = await err(m.adminDevice.run({ op: 'pushClearLegacy', deviceId: U }, ctx({ admin: 1 })));
  ok(e && e.code === 'permission-denied', '등록 안 된 기기는 옛 목록 못 비움');
  r = await m.adminDevice.run({ op: 'pushClearLegacy', deviceId: T }, ctx({ admin: 1 }));
  ok(r.cleared === 1 && DB.pushTokens.admin.tokens.length === 0, '믿을 기기에서 옛 목록 비움');

  console.log('6) memberLogin App Check');
  const mctx = (app) => ({ auth: null, app, rawRequest: { headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari/604.1', 'x-forwarded-for': '9.9.9.9' }, ip: '9.9.9.9' } });
  const EID = '11111111-2222-3333-4444-555555555555';
  DB.app = { state: { entries: [], pendingEntries: [] } };
  delete process.env.GCLOUD_PROJECT; process.env.FIREBASE_CONFIG = '{"projectId":"benny-meeting"}';
  e = await err(m.memberLogin.run({ entryId: EID, pin: '582941', acMs: 1234 }, mctx(undefined)));
  ok(e && e.code === 'not-found', '운영: App Check 없어도 막지 않음(감시만)');
  const la = Object.values(DB.loginAudit || {});
  ok(la.some((x) => x.status === 'notfound' && x.ac === 0 && x.acMs === 1234), '로그인 기록에 ac 0·acMs 1234');
  e = await err(m.memberLogin.run({ entryId: EID, pin: '582941', acMs: 'abc' }, mctx({ appId: 'x' })));
  ok(Object.values(DB.loginAudit).some((x) => x.ac === 1 && x.acMs === -1), '확인됨 ac 1, 이상한 acMs → -1');
  process.env.FIREBASE_CONFIG = '{"projectId":"benny-bridge-beta"}';
  const snap = () => JSON.stringify(Object.fromEntries(Object.entries(DB).filter(([k]) => k !== 'loginAudit')));
  const before = snap();
  e = await err(m.memberLogin.run({ entryId: EID, pin: '582941', acMs: 900 }, mctx(undefined)));
  ok(e && e.code === 'failed-precondition' && e.details && e.details.appcheck === 1, '베타: App Check 없으면 거부 + details.appcheck');
  ok(Object.values(DB.loginAudit).some((x) => x.status === 'appcheck-refused'), '거부 기록 appcheck-refused');
  ok(snap() === before, '거부는 로그인 기록 말고 아무것도 안 바꿈(실패 횟수·IP 기록 없음)');
  e = await err(m.memberLogin.run({ entryId: EID, pin: '582941', acMs: 900 }, mctx({ appId: 'x' })));
  ok(e && e.code === 'not-found', '베타: App Check 있으면 통과');
  e = await err(m.memberLogin.run({ ping: 1 }, mctx(undefined)));
  ok(e === null, '미리 깨우기(ping)는 App Check 없어도 됨');

  console.log('\n통과 ' + pass + ' · 실패 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((x) => { console.error('시험 오류', x); process.exit(2); });
