// B-2 되돌리기 도구 (2026-10-29): memberMsgs/{회원} 의 메시지를 예전 자리 app/state.messages 로 다시 모음.
// 운영을 B-2 이전 버전으로 되돌려야 할 때만. 순서:
//   1) 함수를 이전 버전으로 배포 (새 onStateChange 가 state.messages 를 다시 옮겨 가지 않게 — 먼저!)
//   2) node tools/rollback-member-msgs.js --apply   (기본은 --dry-run: 개수만 보여 주고 아무것도 안 씀)
//   3) 이전 화면(index.html) push
// firebase CLI 로그인 토큰을 씀 — 만료면 `firebase projects:list` 한 번 실행. PROJ=benny-bridge-beta 로 베타에서 먼저.
const fs = require('fs'), path = require('path');
const APPLY = process.argv.includes('--apply');
const PROJ = process.env.PROJ || 'benny-meeting';
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.config/configstore/firebase-tools.json'), 'utf8'));
const H = { Authorization: 'Bearer ' + cfg.tokens.access_token, 'Content-Type': 'application/json' };
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';
const plain = (v) => v == null ? v : v.stringValue ?? (v.integerValue != null ? Number(v.integerValue) : undefined) ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue
  ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]))
    : v.arrayValue ? (v.arrayValue.values || []).map(plain) : null);
const enc = (x) => {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } };
};
(async () => {
  const all = []; let pg = '';
  do {
    const r = await (await fetch(BASE + '/memberMsgs?pageSize=300' + (pg ? '&pageToken=' + encodeURIComponent(pg) : ''), { headers: H })).json();
    if (r.error) throw new Error(r.error.code + ' ' + r.error.status + (r.error.code === 401 ? ' (토큰 만료 — firebase projects:list 실행)' : ''));
    (r.documents || []).forEach((d) => { (plain({ mapValue: { fields: d.fields || {} } }).msgs || []).forEach((m) => { if (m && m.id) { const c = Object.assign({}, m); delete c.mig; all.push(c); } }); });
    pg = r.nextPageToken || '';
  } while (pg);
  const st = await (await fetch(BASE + '/app/state', { headers: H })).json();
  const cur = (plain({ mapValue: { fields: (st.fields || {}) } }).messages || []);
  const have = {}; cur.forEach((m) => { if (m && m.id) have[m.id] = 1; });
  const merged = cur.concat(all.filter((m) => !have[m.id])).sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).slice(-5000);
  console.log('project', PROJ, '| memberMsgs 메시지', all.length, '| state 에 이미', cur.length, '| 되돌린 뒤 state.messages', merged.length);
  if (!APPLY) { console.log('(--dry-run: 아무것도 쓰지 않았어요. 실제로 하려면 --apply)'); return; }
  const r = await fetch(BASE + '/app/state?updateMask.fieldPaths=messages', { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { messages: enc(merged) } }) });
  const j = await r.json();
  if (j.error) throw new Error('쓰기 실패: ' + j.error.code + ' ' + j.error.message);
  console.log('완료: app/state.messages 에', merged.length, '건');
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
