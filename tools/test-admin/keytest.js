// 실행: 프로젝트 루트에서 node tools/test-admin/keytest.js (가짜 DB, 네트워크 없음)
// 리뷰 반영 시험: 기기 열쇠 · 이번만 제한 · 옛 화면(onceOk) · 옛 알림 목록 보호 · pushOff 소유 확인 · 이번만 목록 (가짜 DB)
const fs = require('fs'), path = require('path'), Module = require('module'), crypto = require('crypto');
process.env.NUM_ENC_KEY = crypto.randomBytes(32).toString('hex');
let DB = {}; let revoked = 0; const sent = [];
const clone = (v) => v && JSON.parse(JSON.stringify(v));
const DEL = { __del: 1 };
function applyMerge(cur, o) {
  const out = Object.assign({}, cur || {});
  for (const [k, v] of Object.entries(o)) {
    if (v === DEL) delete out[k];
    else if (v && v.__arrayRemove) out[k] = (Array.isArray(out[k]) ? out[k] : []).filter((x) => !v.vals.includes(x));
    else if (v && v.__arrayUnion) out[k] = Array.from(new Set((Array.isArray(out[k]) ? out[k] : []).concat(v.vals)));
    else out[k] = clone(v);
  }
  return out;
}
const docOf = (col, id) => ({ id,
  get: async () => { const v = (DB[col] || {})[id]; return { exists: !!v, id, data: () => clone(v) }; },
  set: async (o, opt) => { DB[col] = DB[col] || {}; DB[col][id] = opt && opt.merge ? applyMerge(DB[col][id], o) : applyMerge({}, o); },
  update: async (o) => { DB[col][id] = applyMerge(DB[col][id], o); }, delete: async () => { delete (DB[col] || {})[id]; } });
const getPath = (x, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), x);
const test = (x, [f, op, v]) => { const a = getPath(x, f); return op === '>' ? a > v : op === '<' ? a < v : a === v; };
const query = (c, filters, lim) => ({ where: (f, op, v) => query(c, filters.concat([[f, op, v]]), lim), limit: (n) => query(c, filters, n), orderBy: () => query(c, filters, lim),
  get: async () => { let docs = Object.entries(DB[c] || {}).filter(([id, x]) => filters.every((fl) => test(x, fl))).map(([id, x]) => ({ id, data: () => clone(x), ref: docOf(c, id) }));
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
    a.messaging = () => ({ send: async () => {}, sendEachForMulticast: async (m) => { sent.push(m.tokens.slice()); return { responses: m.tokens.map(() => ({ success: true })) }; } });
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
fs.writeFileSync(path.join(require('os').tmpdir(), '_key_idx.js'), fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'index.js'), 'utf8'));
const m = require(path.join(require('os').tmpdir(), '_key_idx.js'));
let ipn = 10;
const ctx = (token) => ({ auth: token ? { uid: 'admin', token } : null, rawRequest: { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/150', 'x-forwarded-for': '1.2.3.' + ipn }, ip: '1.2.3.' + ipn } });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const PW = 'correct horse battery';
function adminKeyFixture(pw) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pw, salt, 150000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update('private-key'), c.final(), c.getAuthTag()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), wrappedPrivateKey: enc.toString('base64') };
}
const T = 'A'.repeat(20), V = 'C'.repeat(20), L = 'D'.repeat(20), L2 = 'E'.repeat(20), N = 'F'.repeat(20);
const KT = 'key-of-T-' + 'x'.repeat(20), KV = 'key-of-V-' + 'y'.repeat(20);
const tok = (ch) => 'f' + ch.repeat(140) + ':APA91b' + ch.repeat(20);
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) { pass++; console.log('  OK', msg); } else { fail++; console.log('  FAIL', msg); } };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const dev = (op, id, key, token, extra) => m.adminDevice.run(Object.assign({ op, deviceId: id, deviceKey: key }, extra || {}), ctx(token));
(async () => {
  const now = Date.now();
  DB = { adminKey: { main: adminKeyFixture(PW) },
    adminDevices: { [T]: { status: 'trusted', name: '베니 폰', keyHash: sha(KT) }, [V]: { status: 'trusted', name: '회사 PC', keyHash: sha(KV) }, [L]: { status: 'trusted', name: '아내 폰(예전)' }, [L2]: { status: 'trusted', name: '집 PC(예전)' } },
    pushTokens: { admin: { tokens: [tok('7'), tok('8')] } } };

  console.log('1) 믿을 기기 = id + 열쇠');
  let r = await dev('list', T, '', { admin: 1 });
  ok(r.meTrusted === false, '열쇠 없이 T id 만 → 믿을 기기 아님');
  r = await dev('list', T, KT, { admin: 1 });
  ok(r.meTrusted === true && r.devices.find((d) => d.id === L).keyed === false && r.devices.find((d) => d.id === T).keyed === true, 'T+열쇠 → 믿을 기기, 목록에 열쇠 여부');
  r = await dev('list', T, KT, { admin: 1, ao: now + 60000 });
  ok(r.meTrusted === false, '이번만 토큰은 T id+열쇠를 대도 믿을 기기 아님');
  let e = await err(dev('pushOn', T, '', { admin: 1 }, { token: tok('1') }));
  ok(e && e.code === 'permission-denied', '열쇠 없이 pushOn 거부');
  e = await err(dev('revoke', T, 'wrong', { admin: 1 }, { targetId: V }));
  ok(e && e.code === 'permission-denied' && DB.adminDevices[V].status === 'trusted', '틀린 열쇠로 해제 못 함');

  console.log('2) adminLogin');
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: T, deviceKey: KT }, ctx(null));
  ok(r.token && !JSON.parse(r.token).cl.ao && !r.pending, 'T+열쇠+비번 → 바로 관리자 토큰');
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: T, deviceKey: 'stolen?' }, ctx(null));
  ok(r.pending && !r.token, 'T id + 틀린 열쇠 → 보류(새 기기처럼)');
  const holdBad = DB.adminHolds[r.holdId];
  ok(holdBad.keyMiss === '열쇠 다름' && holdBad.onceOk === false, '보류에 keyMiss·onceOk 없음 기록');
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: L, onceOk: 1 }, ctx(null));
  ok(r.pending && DB.adminHolds[r.holdId].keyMiss === '열쇠 없는 예전 기기' && DB.adminHolds[r.holdId].onceOk === true, '열쇠 없는 예전 기기 → 보류, 새 화면 onceOk');
  ipn++; e = await err(m.adminLogin.run({ password: 'wrong', deviceId: T, deviceKey: KT }, ctx(null)));
  ok(e && e.code === 'permission-denied', '비번 틀림 → 거부');

  console.log('3) 승인 — 이번만은 새 화면만, 그냥 허용은 열쇠');
  ipn++; const a1 = await m.adminLogin.run({ password: PW, deviceId: N }, ctx(null));   // 옛 화면(onceOk 없음)
  e = await err(dev('approve', T, KT, { admin: 1 }, { holdId: a1.holdId, once: true }));
  ok(e && e.code === 'failed-precondition' && DB.adminHolds[a1.holdId].status === 'pending', '옛 화면 보류는 이번만으로 허용 못 함');
  DB.adminHolds[a1.holdId].status = 'approved'; DB.adminHolds[a1.holdId].once = true;   // (옛 서버가 이미 once 로 승인했다고 치면)
  e = await err(m.adminLogin.run({ holdId: a1.holdId, pollKey: a1.pollKey, deviceId: N }, ctx(null)));
  ok(e && e.code === 'failed-precondition', '받는 쪽에서도 옛 화면엔 이번만 토큰 안 줌');
  ipn++; const a2 = await m.adminLogin.run({ password: PW, deviceId: N, onceOk: 1 }, ctx(null));
  r = await dev('approve', T, KT, { admin: 1 }, { holdId: a2.holdId, once: true });
  ok(r.once === true, '새 화면 보류 → 이번만 허용');
  r = await m.adminLogin.run({ holdId: a2.holdId, pollKey: a2.pollKey, deviceId: N }, ctx(null));
  ok(r.once && JSON.parse(r.token).cl.ao > now && !r.deviceKey && !(DB.adminDevices[N] && DB.adminDevices[N].status === 'trusted'), '이번만 → ao 토큰, 열쇠 없음, 믿을 기기 아님');
  // 그 이번만 세션이 T 의 id 를 알아도(목록·경고에 보임) 열쇠가 없으니 영구 관리자 못 됨
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: T, onceOk: 1 }, ctx(null));
  ok(r.pending && !r.token, '이번만 사람이 T id + 비번으로 adminLogin → 보류(바로 토큰 아님)');
  e = await err(dev('approve', T, '', { admin: 1, ao: now + 60000 }, { holdId: r.holdId }));
  ok(e && e.code === 'permission-denied', '이번만 세션은 자기 보류를 허용 못 함');
  e = await err(dev('setPhones', T, '', { admin: 1, ao: now + 60000 }, { phones: [{ label: 'x', phone: '01012345678' }] }));
  ok(e && e.code === 'permission-denied', '이번만 세션은 문자 번호 못 바꿈');
  ipn++; const a3 = await m.adminLogin.run({ password: PW, deviceId: L2, onceOk: 1 }, ctx(null));
  await dev('approve', T, KT, { admin: 1 }, { holdId: a3.holdId });
  r = await m.adminLogin.run({ holdId: a3.holdId, pollKey: a3.pollKey, deviceId: L2 }, ctx(null));
  ok(r.token && r.deviceKey && DB.adminDevices[L2].keyHash === sha(r.deviceKey), '그냥 허용 → 열쇠 줌(서버엔 해시만)');
  const KL2 = r.deviceKey;
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: L2, deviceKey: KL2 }, ctx(null));
  ok(r.token && !r.pending, '받은 열쇠로 다음부턴 바로');

  console.log('4) enroll — 열쇠 없는 예전 기기 (첫 열쇠가 이미 나간 뒤)');
  r = await dev('enroll', L, '', { admin: 1 }, {});
  ok(r.legacy === true && !r.deviceKey && !DB.adminDevices[L].keyHash, '옛 화면(wantKey 없음) → 열쇠 안 줌');
  r = await dev('enroll', L, '', { admin: 1, ao: now + 60000 }, { wantKey: 1 });
  ok(!r.deviceKey && r.onceUntil, '이번만 토큰 → 열쇠 안 줌');
  r = await dev('enroll', L, '', { admin: 1 }, { wantKey: 1 });
  ok(r.legacy === true && !r.deviceKey && !DB.adminDevices[L].keyHash, '열쇠 가진 기기가 있으면 관리자 토큰만으론 남의 예전 기기 열쇠 못 받음(다시 로그인해 승인)');
  const alerts0 = Object.keys(DB.securityAlerts || {}).length;
  r = await dev('enroll', T, 'other', { admin: 1 }, { wantKey: 1 });
  ok(r.trusted === false && !r.deviceKey && Object.values(DB.adminAudit).some((x) => x.status === 'enroll-refused' && x.deviceId === T), '열쇠 틀린 enroll → 거절 기록');
  ok(Object.keys(DB.securityAlerts || {}).length > alerts0, '열쇠 틀린 enroll 은 보안 경고');
  r = await dev('enroll', T, KT, { admin: 1 }, { wantKey: 1 });
  ok(r.trusted === true && !r.deviceKey, '맞는 열쇠 → 믿을 기기, 새 열쇠 안 줌');

  console.log('4b) 이미 열쇠 가진 기기 id 로 다시 승인 → 기존 기기를 덮지 않고 새 id');
  const tHashBefore = DB.adminDevices[T].keyHash;
  ipn++; const a4 = await m.adminLogin.run({ password: PW, deviceId: T, deviceKey: 'lost', onceOk: 1, keyOk: 1 }, ctx(null));
  await dev('approve', L2, KL2, { admin: 1 }, { holdId: a4.holdId });
  r = await m.adminLogin.run({ holdId: a4.holdId, pollKey: a4.pollKey, deviceId: T }, ctx(null));
  ok(r.token && r.deviceKey && r.deviceId && r.deviceId !== T && DB.adminDevices[r.deviceId].status === 'trusted', '승인 → 새 id + 새 열쇠');
  ok(DB.adminDevices[T].keyHash === tHashBefore, '원래 T 의 열쇠·기록은 그대로');
  e = await err(m.adminLogin.run({ holdId: a4.holdId, pollKey: a4.pollKey, deviceId: T }, ctx(null)));
  ok(e && e.code === 'failed-precondition', '같은 승인으로 두 번 못 받음');
  r = await dev('approve', T, KT, { admin: 1 }, { holdId: a4.holdId, once: true });
  ok(r.decided === true && r.once === undefined, '이미 정해진 보류는 decided 표시(화면 경고 안 띄움)');

  console.log('5) 알림 — 남의 기기 끄기 막기 · 옛 목록 보호');
  await dev('pushOn', V, KV, { admin: 1 }, { token: tok('3') });
  await dev('pushOff', V, '', { admin: 1, ao: now + 60000 }, { token: tok('9') });
  ok(DB.adminDevices[V].push && DB.adminDevices[V].push.token === tok('3'), '이번만 세션이 V id 로 pushOff → V 알림 그대로');
  await dev('pushOff', V, KV, { admin: 1 }, { token: tok('3') });
  ok(!DB.adminDevices[V].push, 'V 자기 열쇠로 끄면 지워짐');
  // 지금 묶인 기기 없음 → 해제해도 옛 목록 유지, 비우기는 거절
  r = await dev('revoke', T, KT, { admin: 1 }, { targetId: L2 });
  ok(r.legacyCleared === 0 && r.legacyKept === 2 && DB.pushTokens.admin.tokens.length === 2, '묶인 기기 없으면 해제해도 옛 목록 남김');
  e = await err(dev('pushClearLegacy', T, KT, { admin: 1 }));
  ok(e && e.code === 'failed-precondition' && DB.pushTokens.admin.tokens.length === 2, '묶인 기기 없으면 옛 목록 비우기 거절');
  await dev('pushOn', T, KT, { admin: 1 }, { token: tok('1') });
  r = await dev('revoke', T, KT, { admin: 1 }, { targetId: V });
  ok(r.legacyCleared === 2 && DB.pushTokens.admin.tokens.length === 0, 'T 가 묶인 뒤 해제 → 옛 목록 비움');

  console.log('6) 이번만 목록 = 끝 시각이 지금 뒤인 것');
  for (let i = 0; i < 120; i++) DB.adminHolds['ah_' + String(i).padStart(24, '0')] = { status: 'approved', once: true, onceUntil: now - 1000 };
  r = await dev('list', T, KT, { admin: 1 });
  ok(r.onces.length === 1 && r.onces[0].id === a2.holdId, '오래된 승인 120개 사이에서도 살아 있는 이번만 1건');

  console.log('6b) 첫 열쇠: 전체에서 한 번, 열쇠 저장 가능한 화면만');
  const saved = DB.adminDevices, savedSec = DB.security;
  const P1 = 'P'.repeat(20), P2 = 'Q'.repeat(20), P3 = 'R'.repeat(20);
  DB.adminDevices = { [P1]: { status: 'trusted', name: '베니 폰(예전)' }, [P2]: { status: 'trusted', name: '아내 폰(예전)' }, [P3]: { status: 'trusted', name: 'Music Lab' } };
  DB.security = {};
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: P3 }, ctx(null));
  ok(r.pending && !DB.adminDevices[P3].keyHash, 'keyOk 없는 화면(Music Lab·옛 화면)은 첫 열쇠를 못 씀 → 보류');
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: P1, keyOk: 1 }, ctx(null));
  ok(r.token && r.deviceKey && DB.adminDevices[P1].keyHash === sha(r.deviceKey) && DB.security.adminKeys.bootstrapped, 'P1 keyOk + 비번 → 첫 열쇠');
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: P2, keyOk: 1 }, ctx(null));
  ok(r.pending && !r.token, '두 번째 예전 기기는 보류(P1 이 승인)');
  ipn++; e = await err(m.adminLogin.run({ password: 'bad', deviceId: P2, keyOk: 1 }, ctx(null)));
  ok(e && e.code === 'permission-denied', '비번 틀리면 열쇠 없음');
  DB.adminDevices[P1].status = 'revoked';   // 열쇠 가진 기기를 다 해제해도
  ipn++; r = await m.adminLogin.run({ password: PW, deviceId: P2, keyOk: 1 }, ctx(null));
  ok(r.pending && !r.token, '첫 열쇠는 다시 안 열림(한 번 나가면 끝)');
  // enroll 로도 첫 열쇠: 이미 로그인돼 있던 예전 기기가 새 앱을 열 때
  DB.adminDevices = { [P1]: { status: 'trusted', name: '베니 폰(예전)' }, [P2]: { status: 'trusted', name: '아내 폰(예전)' } };
  DB.security = {};
  r = await dev('enroll', P1, '', { admin: 1 }, { wantKey: 1 });
  ok(r.trusted && r.deviceKey && DB.adminDevices[P1].keyHash === sha(r.deviceKey), '새 앱 enroll → 첫 열쇠');
  r = await dev('enroll', P2, '', { admin: 1 }, { wantKey: 1 });
  ok(r.legacy === true && !r.deviceKey, '두 번째는 enroll 로 못 받음');
  DB.adminDevices = saved; DB.security = savedSec;

  console.log('7) 베타 전용 trustDevice');
  process.env.FIREBASE_CONFIG = '{"projectId":"benny-meeting"}'; delete process.env.GCLOUD_PROJECT;
  e = await err(m.betaSeed.run({ op: 'trustDevice', password: PW, deviceId: 'G'.repeat(20) }, ctx(null)));
  ok(e && e.code === 'permission-denied' && !DB.adminDevices['G'.repeat(20)], '운영에선 거절');
  process.env.FIREBASE_CONFIG = '{"projectId":"benny-bridge-beta"}';
  e = await err(m.betaSeed.run({ op: 'trustDevice', password: 'nope', deviceId: 'G'.repeat(20) }, ctx(null)));
  ok(e && e.code === 'permission-denied', '베타라도 비번 틀리면 거절');
  r = await m.betaSeed.run({ op: 'trustDevice', password: PW, deviceId: 'G'.repeat(20) }, ctx(null));
  ok(r.deviceKey && DB.adminDevices['G'.repeat(20)].status === 'trusted' && DB.adminDevices['G'.repeat(20)].keyHash === sha(r.deviceKey), '베타 + 비번 → 믿을 기기 + 열쇠');

  console.log('\n통과 ' + pass + ' · 실패 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((x) => { console.error('시험 오류', x); process.exit(2); });
