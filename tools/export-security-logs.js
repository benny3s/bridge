// 운영 보안 기록을 이 PC 로 받아 두기 (2026-10-29 Benny: 서버는 1년 뒤 지우니, 공격 대비 증거는 PC 에도)
// 받는 것: loginAudit(로그인 시도·IP·기기), accessSeen(접속 기기·IP), securityAlerts(보안 경고), adminOnly/deleted_profiles(탈퇴 기록)
// 쓰는 법: node tools/export-security-logs.js [저장 폴더]   (기본 D:\BridgeBackup\security-logs)
//   firebase CLI 로그인 토큰을 씀 — 만료면 `firebase projects:list` 한 번 실행 후 다시.
// 같은 날 여러 번 돌려도 그날 폴더를 덮어씀. 파일은 이 PC 에만 (GitHub·클라우드에 올리지 말 것: IP·닉네임 포함).
const fs = require('fs'), path = require('path');
const OUT = process.argv[2] || 'D:\\BridgeBackup\\security-logs';
const PROJ = process.env.PROJ || 'benny-meeting';
const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.config/configstore/firebase-tools.json'), 'utf8'));
const H = { Authorization: 'Bearer ' + cfg.tokens.access_token };
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';
const plain = (v) => v == null ? v : v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue
  ?? (v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]))
    : v.arrayValue ? (v.arrayValue.values || []).map(plain) : null);
const docOf = (d) => Object.assign({ _id: d.name.split('/').pop() }, plain({ mapValue: { fields: d.fields || {} } }));

async function dumpCollection(col) {
  const rows = []; let pg = '';
  do {
    const r = await (await fetch(BASE + '/' + col + '?pageSize=300' + (pg ? '&pageToken=' + encodeURIComponent(pg) : ''), { headers: H })).json();
    if (r.error) throw new Error(col + ': ' + r.error.code + ' ' + r.error.status + (r.error.code === 401 ? ' (토큰 만료 — firebase projects:list 실행)' : ''));
    (r.documents || []).forEach((d) => rows.push(docOf(d)));
    pg = r.nextPageToken || '';
  } while (pg);
  return rows;
}
(async () => {
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const dir = path.join(OUT, day);
  fs.mkdirSync(dir, { recursive: true });
  for (const col of ['loginAudit', 'accessSeen', 'securityAlerts']) {
    const rows = await dumpCollection(col);
    fs.writeFileSync(path.join(dir, col + '.json'), JSON.stringify(rows, null, 1));
    console.log(col, rows.length);
  }
  const dp = await (await fetch(BASE + '/adminOnly/deleted_profiles', { headers: H })).json();
  fs.writeFileSync(path.join(dir, 'deleted_profiles.json'), JSON.stringify(dp.fields ? docOf(dp) : {}, null, 1));
  console.log('saved →', dir);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
