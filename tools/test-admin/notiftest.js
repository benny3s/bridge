// 실행: 프로젝트 루트에서 node tools/test-admin/notiftest.js (가짜 DB, 네트워크 없음)
// 관리자 폰 알림 정리 시험 (2026-11-06): 🔴 꼭 할 일은 소리, 소식(새 신청서·주간 행동 보고·💕 커플 소식 11-12)은 quiet → 서비스워커가 소리 없이
const fs = require('fs'), path = require('path'), Module = require('module'), crypto = require('crypto'), vm = require('vm');
process.env.NUM_ENC_KEY = crypto.randomBytes(32).toString('hex');
let DB = {}; let sent = [];
const clone = (v) => v && JSON.parse(JSON.stringify(v));
const DEL = { __del: 1 };
const docOf = (col, id) => ({ id,
  get: async () => { const v = (DB[col] || {})[id]; return { exists: !!v, id, data: () => clone(v) }; },
  set: async (o, opt) => { DB[col] = DB[col] || {}; DB[col][id] = Object.assign({}, opt && opt.merge ? DB[col][id] : {}, clone(o)); },
  update: async (o) => { DB[col] = DB[col] || {}; DB[col][id] = Object.assign({}, DB[col][id], clone(o)); } });
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
    const a = { initializeApp() {}, firestore: () => db, auth: () => ({ createCustomToken: async () => 'tok', revokeRefreshTokens: async () => {} }) };
    a.firestore.FieldValue = { delete: () => DEL, arrayUnion: (...v) => ({ __arrayUnion: 1, vals: v }), arrayRemove: (...v) => ({ __arrayRemove: 1, vals: v }), serverTimestamp: () => new Date().toISOString(), increment: (n) => n };
    a.messaging = () => ({ send: async () => {}, sendEachForMulticast: async (m) => { sent.push(clone(m)); return { responses: m.tokens.map(() => ({ success: true })) }; } });
    return a;
  }
  if (r === 'firebase-functions/v1' || r === 'firebase-functions') {
    const c = {}; const s = () => c; c.region = s; c.runWith = s;
    c.https = { onCall: (h) => ({ run: h }), HttpsError: class extends Error { constructor(code, msg) { super(msg); this.code = code; } } };
    c.firestore = { document: () => ({ onUpdate: (h) => ({ run: h }), onWrite: (h) => ({ run: h }), onCreate: (h) => ({ run: h }) }) };
    c.pubsub = { schedule: () => ({ timeZone: () => ({ onRun: (h) => ({ run: h }) }), onRun: (h) => ({ run: h }) }) };
    const f = function () { return c; }; Object.assign(f, c); f.config = () => ({}); return f;
  }
  return rl.apply(this, arguments);
};
global.fetch = async () => { throw new Error('no net'); };
const root = path.join(__dirname, '..', '..');
const fnSrc = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
fs.writeFileSync(path.join(require('os').tmpdir(), '_notif_idx.js'), fnSrc + '\nmodule.exports.__sendToAdmin=sendToAdmin;');
const m = require(path.join(require('os').tmpdir(), '_notif_idx.js'));
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) { pass++; console.log('  OK', msg); } else { fail++; console.log('  FAIL', msg); } };
const ADMIN_TOK = 'f' + 'a'.repeat(140) + ':APA91b' + 'a'.repeat(20), MEMBER_TOK = 'f' + 'm'.repeat(140) + ':APA91b' + 'm'.repeat(20);
const now = new Date().toISOString();
const E = (id, nick, extra) => Object.assign({ id, nickname: nick, gender: 'female', submittedAt: now, lastSeenAt: now }, extra || {});
const base = () => ({ entries: [E('m1', '겨울'), E('m2', '소금'), E('m3', '석지')], pendingEntries: [], dateRequests: [], pinResetReqs: [], logs: [] });
/* 관리자 앞으로 간 알림만 (회원 토큰 것은 뺌) */
const adminPushes = () => sent.filter((x) => x.tokens.includes(ADMIN_TOK)).map((x) => x.data);
async function run(before, after) {
  sent = [];
  DB = { adminDevices: { D1: { status: 'trusted', name: '베니 폰', push: { token: ADMIN_TOK } } }, pushTokens: { m1: { tokens: [MEMBER_TOK] } }, app: { state: clone(after) } };
  try { await m.onStateChange.run({ before: { data: () => clone(before) }, after: { data: () => clone(after) } }, { params: {} }); }
  catch (e) { console.log('  (onStateChange 오류)', e.message); }
  return adminPushes();
}
(async () => {
  console.log('1) 새 신청서 = 소식(quiet)');
  let b = base(), a = base(); a.pendingEntries = [E('p1', '새벽', { isPending: true })];
  let p = await run(b, a);
  ok(p.length === 1 && /^새 신청서/.test(p[0].title), '새 신청서 알림 1개');
  ok(p[0] && p[0].quiet === '1', '새 신청서는 quiet');
  ok(p[0] && /AI 가 먼저 심사/.test(p[0].body), '본문에 AI 가 먼저 심사');

  console.log('2) PIN 재설정 요청 = 소리');
  b = base(); a = base(); a.pinResetReqs = [{ id: 'q1', entryId: 'm1', nickname: '겨울', status: 'pending', at: now }];
  p = await run(b, a);
  ok(p.length === 1 && p[0].title === '🔑 PIN 재설정 요청 · 겨울', 'PIN 요청 알림 제목');
  ok(p[0] && !p[0].quiet, 'PIN 요청은 소리(quiet 없음)');
  ok(p[0] && p[0].route === 'admin', '누르면 관리자 탭');

  console.log('3) 같은 회원이 다시 요청(기다리던 요청이 새 id 로 바뀜) = 알림 없음');
  b = base(); b.pinResetReqs = [{ id: 'q1', entryId: 'm1', nickname: '겨울', status: 'pending', at: now }];
  a = base(); a.pinResetReqs = [{ id: 'q2', entryId: 'm1', nickname: '겨울', status: 'pending', at: now }];
  p = await run(b, a);
  ok(p.length === 0, '다시 요청은 조용히');

  console.log('4) 처리된 요청(sent)은 알림 없음, 다른 회원 새 요청은 알림');
  b = base(); b.pinResetReqs = [{ id: 'q1', entryId: 'm1', nickname: '겨울', status: 'pending', at: now }];
  a = base(); a.pinResetReqs = [{ id: 'q1', entryId: 'm1', nickname: '겨울', status: 'sent', at: now }, { id: 'q3', entryId: 'm2', nickname: '소금', status: 'pending', at: now }];
  p = await run(b, a);
  ok(p.length === 1 && /소금$/.test(p[0].title), '새 요청 1개만(소금)');

  console.log('5) 삭제 · 주선자로만 남기 · 보관 요청 = 소리');
  b = base(); a = base();
  a.entries[0] = Object.assign({}, a.entries[0], { deleteRequested: true, deleteReason: '좋은 인연을 만났어요 (커플 성사)' });
  a.entries[1] = Object.assign({}, a.entries[1], { deleteRequested: true, deleteReason: '주선자로만 남기 (소개팅 프로필 삭제)' });
  a.entries[2] = Object.assign({}, a.entries[2], { deactivateRequested: true, deactivateReason: '잠시 쉬고 싶어요' });
  p = await run(b, a);
  const t = p.map((x) => x.title).sort();
  ok(t.length === 3, '알림 3개 (' + t.join(' / ') + ')');
  ok(t.includes('🗑 삭제 요청 · 겨울') && t.includes('🤝 주선자로만 남기 요청 · 소금') && t.includes('🗄 보관 요청 · 석지'), '제목 셋');
  ok(p.every((x) => !x.quiet), '셋 다 소리');
  const del = p.find((x) => /삭제 요청/.test(x.title));
  ok(del && /좋은 인연/.test(del.body), '삭제 사유가 본문에');

  console.log('6) 이미 요청 중이던 상태가 그대로면 알림 없음');
  b = clone(a); p = await run(b, a);
  ok(p.length === 0, '같은 상태 다시 저장 = 조용히');

  console.log('7) 관계없는 변경(기록만)은 관리자 알림 없음');
  b = base(); a = base(); a.logs = [{ id: 'l1', at: now, type: 'x' }];
  p = await run(b, a);
  ok(p.length === 0, '기록만 바뀜 = 조용히');

  console.log('7-2) 💕 커플 소식 = 소식(quiet), 이미 있던 기록·확인된 기록은 조용히');
  b = base(); a = base(); a._w = 'm1'; a._wn = 'n1';   /* 회원 본인이 쓴 것 — 조작 검사도 지나야 함 */
  a.coupleReports = [{ id: 'c1', byId: 'm1', byNick: '겨울', partner: '소금', partnerId: 'm2', where: 'in', review: '', vis: 'private', at: now, confirmed: false, via: 'leave' }];
  a.entries[0] = Object.assign({}, a.entries[0], { deleteRequested: true, deleteReason: '베니브릿지에서 좋은 인연을 만났어요' });
  p = await run(b, a);
  const cpn = p.find((x) => /커플 소식/.test(x.title));
  ok(cpn && cpn.title === '💕 커플 소식 · 겨울', '커플 소식 알림 제목');
  ok(cpn && cpn.quiet === '1' && cpn.route === 'admin', '커플 소식은 quiet, 누르면 관리자 탭');
  ok(cpn && /베니브릿지에서 만났대요/.test(cpn.body) && /소금/.test(cpn.body), '본문에 여기서 만남 · 상대');
  ok(p.some((x) => x.title === '🗑 삭제 요청 · 겨울' && !x.quiet), '같이 온 탈퇴 요청은 소리 그대로');
  ok(!p.some((x) => /조작|보안/.test(x.title)), '본인 커플 기록은 조작 경고 없음');
  b = clone(a); p = await run(b, a);
  ok(!p.some((x) => /커플 소식/.test(x.title)), '이미 있던 기록은 다시 안 알림');
  b = base(); a = base(); a.coupleReports = [{ id: 'c2', byId: 'm3', byNick: '석지', partner: '', where: 'out', at: now, confirmed: false, via: 'menu' }];
  p = await run(b, a);
  ok(p.length === 1 && p[0].quiet === '1' && /다른 곳/.test(p[0].body), '앱 밖 인연도 소식으로, 배너에 안 센다고 알림');

  console.log('7-3) 💕 커플 소식: 상대 안 밝힘 문구 · 한 번에 여러 건이면 한 통 (11-13)');
  b = base(); a = base(); a.coupleReports = [{ id: 'c3', byId: 'm1', byNick: '겨울', partner: '', partnerHidden: true, where: 'in', at: now, confirmed: false, via: 'rest' }];
  p = await run(b, a);
  ok(p.length === 1 && /상대는 안 밝힘/.test(p[0].body), '상대 안 밝힘이 본문에');
  b = base(); a = base(); a.coupleReports = [1, 2, 3, 4, 5].map((i) => ({ id: 'cm' + i, byId: 'm1', byNick: '겨울', partner: 'x' + i, where: 'in', at: now, confirmed: false }));
  p = await run(b, a);
  const cpm = p.filter((x) => /커플 소식/.test(x.title));
  ok(cpm.length === 1 && /한 번에 5건/.test(cpm[0].body) && cpm[0].quiet === '1', '다섯 건이 한 번에 들어오면 알림 한 통 (' + cpm.length + ')');
  b = base(); a = base(); a.coupleReports = [1, 2].map((i) => ({ id: 'cn' + i, byId: 'm1', byNick: '겨울', partner: 'y' + i, where: 'in', at: now, confirmed: false }));
  p = await run(b, a);
  ok(p.filter((x) => /커플 소식/.test(x.title)).length === 2, '두 건은 따로따로');

  console.log('8) sendToAdmin: quiet 는 nav 로 넘기면 data.quiet=1, 아니면 없음');
  sent = []; DB = { adminDevices: { D1: { status: 'trusted', push: { token: ADMIN_TOK } } }, pushTokens: {} };
  await m.__sendToAdmin('🧭 시험', '본문', { route: 'admin', quiet: true });
  await m.__sendToAdmin('🚨 시험', '본문', { route: 'admin' });
  await m.__sendToAdmin('🚨 시험', '본문');
  ok(sent[0].data.quiet === '1' && !('quiet' in sent[1].data) && !('quiet' in sent[2].data), 'quiet 는 고른 것만');

  console.log('9) 코드 전체: quiet 를 쓰는 관리자 알림은 새 신청서 · 주간 행동 보고 · 커플 소식 셋뿐');
  const quietCalls = (fnSrc.match(/sendToAdmin\([^\n]*quiet: true/g) || []).map((s) => (s.match(/sendToAdmin\('([^']*)'/) || [])[1]);
  ok(quietCalls.length === 3 && quietCalls.includes('새 신청서 📝') && quietCalls.includes('🧭 주간 행동 보고') && quietCalls.includes('💕 커플 소식 · '), 'quiet 호출 = ' + quietCalls.join(', '));

  console.log('10) 서비스워커: quiet=1 이면 silent, 아니면 소리');
  const swSrc = fs.readFileSync(path.join(root, 'firebase-messaging-sw.js'), 'utf8');
  const shown = []; let bg = null;
  const sb = { importScripts: () => {}, self: null, clients: {},
    firebase: { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: (h) => { bg = h; } }) } };
  sb.self = { addEventListener: () => {}, skipWaiting: () => {}, registration: { showNotification: (t, o) => shown.push({ t, o }) } };
  vm.runInNewContext(swSrc, sb);
  bg({ data: { title: '새 신청서 📝', body: 'x', quiet: '1' } });
  bg({ data: { title: '🔑 PIN 재설정 요청 · 겨울', body: 'x' } });
  ok(shown[0] && shown[0].o.silent === true, '소식은 silent');
  ok(shown[1] && shown[1].o.silent === false, '할 일은 소리');

  console.log('11) 앱이 열려 있을 때: 소식은 창을 안 띄움');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ok(/payload\.data\.quiet === '1'\) return;/.test(html), 'onMessage 에 quiet 건너뛰기');

  console.log('\n결과: ' + pass + ' 통과 · ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
