// 관리자 탭 '📨 보낼 문자'에 문자 한 통 준비해 두기 (2026-10-31 Benny: '요청할 때마다 문자앱이 바로 열리고 문구도 채워지는 버튼')
// 쓰는 법: node tools/sms-draft.js <닉네임> <문구 파일(UTF-8)> [메모]      — 목록 보기: node tools/sms-draft.js --list
//   PROJ=benny-bridge-beta 로 베타. firebase CLI 로그인 토큰을 씀 — 만료면 `firebase projects:list` 한 번 실행 후 다시.
// 번호는 다루지 않음: 앱에서 [📱 보내기]를 누르면 관리자 기기가 번호를 풀어 문자앱을 엶. 문자앱을 열면 목록에서 빠짐.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PROJ = process.env.PROJ || 'benny-meeting';
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.config/configstore/firebase-tools.json'), 'utf8'));
const H = { Authorization: 'Bearer ' + cfg.tokens.access_token, 'Content-Type': 'application/json' };
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';
const plain = (v) => v == null ? v : v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue
  ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]))
    : v.arrayValue ? (v.arrayValue.values || []).map(plain) : null);
const enc = (v) => v == null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } }
    : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
async function getDoc(p) {
  const r = await (await fetch(BASE + '/' + p, { headers: H })).json();
  if (r.error && r.error.code === 404) return {};
  if (r.error) throw new Error(p + ': ' + r.error.code + ' ' + r.error.status + (r.error.code === 401 ? ' (토큰 만료 — firebase projects:list 실행)' : ''));
  return plain({ mapValue: { fields: r.fields || {} } });
}
(async () => {
  const drafts = await getDoc('adminOnly/_smsDrafts');
  const items = Array.isArray(drafts.items) ? drafts.items : [];
  if (process.argv[2] === '--list') { items.forEach((d) => console.log(d.at, d.nick, '|', String(d.text || '').replace(/\n/g, ' / ').slice(0, 80))); console.log(items.length + '건'); return; }
  const [nick, file, note] = process.argv.slice(2);
  if (!nick || !file) { console.log('쓰는 법: node tools/sms-draft.js <닉네임> <문구 파일> [메모]'); process.exit(1); }
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  if (!text || text.length > 500) throw new Error('문구가 비었거나 500자를 넘어요 (' + text.length + '자)');
  const st = await getDoc('app/state');
  const hits = (st.entries || []).concat(st.pendingEntries || []).filter((e) => e && e.nickname === nick);
  if (hits.length !== 1) throw new Error('닉네임 "' + nick + '" 회원이 ' + hits.length + '명이에요 (정확히 1명이어야 함)');
  const item = { id: crypto.randomUUID(), entryId: hits[0].id, nick, text, note: note || '', at: new Date().toISOString(), by: 'claude' };
  const next = items.filter((d) => d.entryId !== item.entryId || d.text !== item.text).concat([item]);
  const body = JSON.stringify({ fields: { items: enc(next), at: enc(item.at) } });
  const r = await (await fetch(BASE + '/adminOnly/_smsDrafts', { method: 'PATCH', headers: H, body })).json();
  if (r.error) throw new Error('저장 실패: ' + r.error.code + ' ' + r.error.status);
  console.log('준비됨 →', PROJ, nick, '(보낼 문자 ' + next.length + '건)');
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
