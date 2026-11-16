// 실행: cd functions && node ../tools/test-admin/triagetest.js ../functions/index.js (가짜 DB + mock HTTPS, 네트워크 없음)
// 보안 경고 AI 심사(runTriage) Opus -> Gemini -> Ollama Cloud 폴백 시험
const fs = require('fs'), path = require('path'), Module = require('module'), crypto = require('crypto'), { EventEmitter } = require('events');
process.env.NUM_ENC_KEY = crypto.randomBytes(32).toString('hex');

let DB = {};
let pushes = [];
let mockPlan = {};
const clone = (v) => v && JSON.parse(JSON.stringify(v));
const docOf = (col, id) => ({
  id,
  get: async () => {
    const v = (DB[col] || {})[id];
    return { exists: !!v, id, data: () => clone(v) };
  },
  set: async (o, opt) => {
    DB[col] = DB[col] || {};
    DB[col][id] = Object.assign({}, opt && opt.merge ? DB[col][id] : {}, o);
  },
  update: async (o) => { Object.assign(DB[col][id], o); }
});
const query = (c, filters, lim) => ({
  where: (f, op, v) => query(c, filters.concat([[f, v, op]]), lim),
  limit: (n) => query(c, filters, n),
  orderBy: () => query(c, filters, lim),
  get: async () => {
    const docs = Object.entries(DB[c] || {})
      .filter(([, x]) => filters.every(([f, v, op]) => op === '>' ? x[f] > v : x[f] === v))
      .map(([id, x]) => ({ id, data: () => clone(x) }));
    return { docs, empty: !docs.length, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
});
const db = {
  collection: (c) => Object.assign(query(c, [], 0), { doc: (id) => docOf(c, id || crypto.randomUUID()), add: async (o) => { (DB[c] = DB[c] || {})[crypto.randomUUID()] = o; } }),
  doc: (p) => { const [c, id] = p.split('/'); return docOf(c, id); },
  runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, o) => r.update(o), set: (r, o, opt) => r.set(o, opt) })
};

const rl = Module._load;
Module._load = function (r) {
  if (r === 'firebase-admin') {
    const a = {
      initializeApp() {},
      firestore: () => db,
      auth: () => ({ createCustomToken: async (uid) => uid, revokeRefreshTokens: async () => {} })
    };
    a.firestore.FieldValue = { delete: () => ({}), arrayUnion: () => ({}) };
    a.messaging = () => ({
      send: async (msg) => { pushes.push(msg); },
      sendEachForMulticast: async () => ({ responses: [] })
    });
    return a;
  }
  if (r === 'firebase-functions/v1' || r === 'firebase-functions') {
    const c = {}; const s = () => c; c.region = s; c.runWith = s;
    c.https = { onCall: (h) => ({ run: h }), HttpsError: class extends Error { constructor(code, msg) { super(msg); this.code = code; } } };
    c.firestore = { document: () => ({ onUpdate: (h) => ({ run: h }), onWrite: (h) => ({ run: h }), onCreate: (h) => ({ run: h }) }) };
    c.pubsub = { schedule: () => ({ timeZone: () => ({ onRun: (h) => ({ run: h }) }), onRun: (h) => ({ run: h }) }) };
    const f = function () { return c; }; Object.assign(f, c); f.config = () => ({}); return f;
  }
  if (r === 'https') {
    const realHttps = rl.apply(this, arguments);
    return Object.assign({}, realHttps, {
      request: (opts, cb) => {
        const req = new EventEmitter();
        req.write = () => {};
        req.destroy = (err) => { req.emit('error', err || new Error('destroyed')); };
        req.end = () => {
          process.nextTick(() => {
            const host = opts.hostname || '';
            const handler = mockPlan[host];
            if (!handler) {
              req.emit('error', new Error('unexpected host ' + host));
              return;
            }
            const out = handler(opts);
            if (out instanceof Error) {
              req.emit('error', out);
              return;
            }
            const res = new EventEmitter();
            res.statusCode = out.status || 200;
            res.setEncoding = () => {};
            cb(res);
            res.emit('data', JSON.stringify(out.body));
            res.emit('end');
          });
        };
        return req;
      }
    });
  }
  return rl.apply(this, arguments);
};
global.fetch = async () => { throw new Error('no net'); };
const tmpIdx = path.join(require('os').tmpdir(), '_triage_idx.js');
fs.writeFileSync(tmpIdx, fs.readFileSync(process.argv[2], 'utf8'));
const m = require(tmpIdx);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  OK', msg); } else { fail++; console.log('  FAIL', msg); } };

function makeAlertSnap(id) {
  const data = {
    kind: 'ok',
    target: 'U1',
    ip: '203.0.113.10',
    at: '2026-11-16T10:00:00Z',
    triage: { state: 'pending', title: '⚠️ 테스트 경고', body: '본문' }
  };
  DB.securityAlerts = { [id]: data };
  return { id, ref: db.doc('securityAlerts/' + id), data: () => clone(data) };
}

(async () => {
  DB = { app: { state: { entries: [{ id: 'U1', nickname: '테스터' }] } } };
  pushes = [];

  // 1) Opus 성공
  process.env.ANTHROPIC_API_KEY = 'a-key';
  process.env.GEMINI_API_KEY = 'g-key';
  process.env.OLLAMA_API_KEY = 'o-key';
  mockPlan = {
    'api.anthropic.com': () => ({
      status: 200,
      body: { model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ verdict: 'benign', reason: '본인 패턴' }) }] }
    })
  };
  await m.triageSecurityAlert.run(makeAlertSnap('t1'));
  ok(DB.securityAlerts.t1.triage.state === 'benign' && DB.securityAlerts.t1.triage.by === 'claude-opus-5-5', '1) Opus 5.5 성공');

  // 2) Opus 실패 -> Gemini 폴백 성공
  mockPlan = {
    'api.anthropic.com': () => ({ status: 500, body: { error: { message: 'credit exhausted' } } }),
    'generativelanguage.googleapis.com': () => ({
      status: 200,
      body: { modelVersion: 'gemini-3.8-flash', candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: 'suspicious', reason: '수상한 해외 접속' }) }] } }] }
    })
  };
  await m.triageSecurityAlert.run(makeAlertSnap('t2'));
  ok(DB.securityAlerts.t2.triage.state === 'suspicious' && DB.securityAlerts.t2.triage.by === 'gemini-3.8-flash', '2) Opus 실패 -> Gemini 폴백 성공');

  // 3) Opus 실패 + Gemini 키 없음 -> Ollama Cloud 폴백 성공
  process.env.GEMINI_API_KEY = '';
  mockPlan = {
    'api.anthropic.com': () => ({ status: 429, body: { error: { message: 'rate limit' } } }),
    'ollama.com': () => ({
      status: 200,
      body: { model: 'deepseek-v4.1-flash', choices: [{ message: { content: '{"verdict":"benign","reason":"동일 통신사 접속"}' } }] }
    })
  };
  await m.triageSecurityAlert.run(makeAlertSnap('t3'));
  ok(DB.securityAlerts.t3.triage.state === 'benign' && DB.securityAlerts.t3.triage.by === 'deepseek-v4.1-flash', '3) Opus 실패 + Gemini 미설정 -> Ollama 폴백 성공');

  // 4) Opus 키 없음 + Gemini 실패 -> Ollama 폴백 성공
  process.env.ANTHROPIC_API_KEY = '';
  process.env.GEMINI_API_KEY = 'g-key';
  mockPlan = {
    'generativelanguage.googleapis.com': () => ({ status: 503, body: { error: { message: 'unavailable' } } }),
    'ollama.com': () => ({
      status: 200,
      body: { model: 'deepseek-v4.1-flash', choices: [{ message: { content: '```json\n{"verdict":"unsure","reason":"확인 필요"}\n```' } }] }
    })
  };
  await m.triageSecurityAlert.run(makeAlertSnap('t4'));
  ok(DB.securityAlerts.t4.triage.state === 'unsure' && DB.securityAlerts.t4.triage.by === 'deepseek-v4.1-flash', '4) Gemini 실패 -> Ollama 폴백 성공');

  // 5) Opus refused + 나머지 키 없음 -> unsure 기록
  process.env.ANTHROPIC_API_KEY = 'a-key';
  process.env.GEMINI_API_KEY = '';
  process.env.OLLAMA_API_KEY = '';
  mockPlan = {
    'api.anthropic.com': () => ({ status: 200, body: { model: 'claude-opus-5-5', stop_reason: 'refusal' } })
  };
  await m.triageSecurityAlert.run(makeAlertSnap('t5'));
  ok(DB.securityAlerts.t5.triage.state === 'unsure' && DB.securityAlerts.t5.triage.by === 'claude-opus-5-5', '5) Opus refused 시 unsure 처리');

  // 6) 전부 키 없음 -> error 기록
  process.env.ANTHROPIC_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  process.env.OLLAMA_API_KEY = '';
  await m.triageSecurityAlert.run(makeAlertSnap('t6'));
  ok(DB.securityAlerts.t6.triage.state === 'error' && DB.securityAlerts.t6.triage.reason === 'no AI key configured', '6) AI 키 전부 없을 때 error 처리');

  console.log('\n' + pass + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
