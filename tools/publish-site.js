#!/usr/bin/env node
/* 공개 사이트 내보내기 (2026-11-02, 비공개 전환용): origin/master 의 화면 파일만 benny3s.github.io 저장소의 bridge/ 로 복사해 push. 주소는 그대로 benny3s.github.io/bridge/.
   node tools/publish-site.js   ← master push 뒤에 (어느 브랜치·worktree 에서 돌려도 origin/master 를 씀). 올리지 않으면 라이브가 안 바뀔 뿐, 다른 파일이 새지는 않음.
   공개되는 건 FILES 뿐 — 화면이 새 정적 파일을 불러 쓰면 여기에 추가. 서버·도구·규칙·문서는 절대 넣지 않음. 커밋 메시지도 공개되므로 버전만 적음. */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const FILES = ['index.html', 'firebase-messaging-sw.js', 'coffee-qr.png', 'notif-icon.png', 'notif-badge.png', 'beta'];
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const here = git(__dirname, 'rev-parse', '--show-toplevel');
const common = path.resolve(here, git(here, 'rev-parse', '--git-common-dir'));
const SITE = process.env.SITE_REPO || path.resolve(common, '..', '..', 'secretary', 'benny3s.github.io');
if (!fs.existsSync(path.join(SITE, '.git'))) throw new Error('사이트 저장소가 없어요: ' + SITE);

git(here, 'fetch', '-q', 'origin', 'master');
const names = git(here, 'ls-tree', '-r', '--name-only', 'origin/master', '--', ...FILES).split('\n').filter(Boolean);
if (!names.includes('index.html')) throw new Error('origin/master 에 index.html 이 없어요');
const sha = git(here, 'rev-parse', '--short', 'origin/master');

git(SITE, 'pull', '-q', '--rebase', '--autostash');
const out = path.join(SITE, 'bridge');
fs.rmSync(out, { recursive: true, force: true });
for (const n of names) {
  const f = path.join(out, n);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, execFileSync('git', ['show', 'origin/master:' + n], { cwd: here, maxBuffer: 1 << 26 }));   // 저장소 그대로 (줄바꿈 변환 없음)
}
git(SITE, 'add', '-A', '--', 'bridge');
let changed = false;
try { git(SITE, 'diff', '--cached', '--quiet', '--', 'bridge'); } catch (e) { changed = true; }
if (!changed) { console.log('바뀐 것 없음 (master ' + sha + ')'); process.exit(0); }
const ver = (fs.readFileSync(path.join(out, 'index.html'), 'utf8').match(/APP_VERSION = '([0-9-]+)'/) || [])[1] || sha;
git(SITE, 'commit', '-q', '-m', '베니브릿지 ' + ver, '--', 'bridge');
for (let i = 0; ; i++) {
  try { git(SITE, 'push', '-q'); break; }
  catch (e) {
    if (i >= 4) throw e;
    git(SITE, 'pull', '-q', '--rebase', '--autostash');
  }
}
console.log('올림: ' + ver + ' (master ' + sha + ', 파일 ' + names.length + '개)');
