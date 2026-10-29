/* 함수마다 쓰는 비밀값(Secret Manager)이 runWith secrets 에 다 들어 있는지 배포 전에 확인.
   2026-10-29: aiConcierge 가 decPhone(→ NUM_ENC_KEY)을 쓰는데 secrets 에 없어 번호를 못 풀고
   모든 신청자를 '형식오류'로 보류함 — 이런 빠짐을 배포 전에 막는다 (firebase.json predeploy).
   방법: 파일 맨 왼쪽에서 시작하는 선언(function·const·exports.)을 한 덩어리로 보고,
   process.env.<비밀값> 을 직접 쓰거나 그런 함수를 (몇 단계든) 부르는 export 가 그 비밀값을 선언했는지 본다.
   비밀값 목록 = 어느 함수든 secrets: [...] 에 한 번이라도 적힌 이름. 사용: node tools/check-secrets.js [functions/index.js] */
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'functions', 'index.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);

/* 비밀값 이름들 */
const SECRETS = new Set();
for (const m of src.matchAll(/secrets:\s*\[([^\]]*)\]/g)) for (const s of m[1].matchAll(/['"]([A-Z0-9_]+)['"]/g)) SECRETS.add(s[1]);

/* 맨 왼쪽 선언으로 덩어리 나누기 */
const START = /^(?:async\s+function\s+([A-Za-z_$][\w$]*)|function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=|let\s+([A-Za-z_$][\w$]*)\s*=|exports\.([A-Za-z_$][\w$]*)\s*=)/;
const blocks = [];
let cur = null;
lines.forEach((ln, i) => {
  const m = ln.match(START);
  if (m) {
    if (cur) blocks.push(cur);
    const isExport = !!m[5];
    cur = { name: m[1] || m[2] || m[3] || m[4] || m[5], isExport, line: i + 1, text: '' };
  }
  if (cur) cur.text += ln + '\n';
});
if (cur) blocks.push(cur);

/* 주석 빼고 보기 (주석에 이름만 적힌 것으로 잘못 걸리지 않게) */
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const helpers = {};
blocks.filter((b) => !b.isExport).forEach((b) => { helpers[b.name] = b; });
const direct = (t) => { const out = new Set(); for (const m of t.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (SECRETS.has(m[1])) out.add(m[1]); return out; };
const callees = (t, self) => Object.keys(helpers).filter((n) => n !== self && new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '\\b').test(t));

const memo = {};
function need(name, stack) {
  if (memo[name]) return memo[name];
  if (stack.has(name)) return new Set();
  stack.add(name);
  const t = code(helpers[name].text);
  const out = direct(t);
  callees(t, name).forEach((c) => need(c, stack).forEach((s) => out.add(s)));
  stack.delete(name);
  memo[name] = out;
  return out;
}

let bad = 0, checked = 0;
blocks.filter((b) => b.isExport).forEach((b) => {
  const t = code(b.text);
  if (!/functions\s*\.|onCall|onRequest|onSchedule|onDocument/.test(t)) return;
  checked++;
  const needs = direct(t);
  callees(t, null).forEach((c) => need(c, new Set()).forEach((s) => needs.add(s)));
  const rw = t.match(/runWith\(\s*\{[\s\S]*?\}\s*\)/);
  const declared = new Set();
  if (rw) { const sm = rw[0].match(/secrets:\s*\[([^\]]*)\]/); if (sm) for (const s of sm[1].matchAll(/['"]([A-Z0-9_]+)['"]/g)) declared.add(s[1]); }
  const missing = [...needs].filter((s) => !declared.has(s));
  if (missing.length) { bad++; console.log('✗ ' + b.name + ' (' + path.basename(file) + ':' + b.line + ') — secrets 에 빠짐: ' + missing.join(', ')); }
});
console.log('비밀값 ' + [...SECRETS].join(', ') + ' · 함수 ' + checked + '개 확인, 빠짐 ' + bad + '개');
process.exit(bad ? 1 : 0);
