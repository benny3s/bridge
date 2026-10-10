#!/usr/bin/env node
/* 베타 페이지 만들기 (2026-10-09)
   운영 index.html 을 그대로 복사하되 Firebase 접속 대상만 베타 프로젝트(benny-bridge-beta)로 바꿔 beta/index.html 로 저장.
   - 같은 주소(benny3s.github.io)라 브라우저 저장소(localStorage·sessionStorage)가 운영과 섞이지 않게 키 앞에 'beta:' 를 붙임
   - 푸시(FCM)는 끔 (베타엔 푸시 키가 없음)
   - 화면 왼쪽 아래 🧪 패널: 시험 관리자·회원·손님 전환, 시험 데이터 다시 심기 (베타에만 들어감)
   사용: 프로젝트 루트에서  node tools/build-beta.js   → beta/index.html, beta/firebase-messaging-sw.js
   운영 코드를 고친 뒤 베타에서 먼저 시험하려면 이 스크립트를 다시 돌리고 커밋·푸시. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const BETA = {
  apiKey: 'AIzaSyBcblfRSeybWcCveXT6dZ9nV42bmsjFi5Q',
  authDomain: 'benny-bridge-beta.firebaseapp.com',
  projectId: 'benny-bridge-beta',
  storageBucket: 'benny-bridge-beta.firebasestorage.app',
  messagingSenderId: '139096808793',
  appId: '1:139096808793:web:516002f6f9fcac348bc048'
};

/* 인자로 git 브랜치를 주면 그 브랜치의 index.html 로 만듦 (운영 반영 전 기능 브랜치 시험용):
   node tools/build-beta.js feature/meet-zones   — master 에 있는 채로 실행하고 beta/ 만 커밋 */
const ref = process.argv[2];
let h = ref
  ? require('child_process').execSync('git show ' + ref + ':index.html', { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  : fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (ref) console.log('원본: ' + ref + ' 브랜치의 index.html');
function rep(re, to, label) {
  const before = h;
  h = h.replace(re, to);
  if (h === before) throw new Error('바꿀 곳을 못 찾음: ' + label);
}

/* 0) 지역 기능 스위치: 베타는 켬. ZONES_OFF=1 이면 운영과 같은 상태(끔)로 — 운영 미리보기용 */
if (!process.env.ZONES_OFF) h = h.replace('var ZONES_ON = false;', 'var ZONES_ON = true;');

/* 1) Firebase 접속 설정 → 베타 */
rep(/var firebaseConfig = \{[\s\S]*?\};/, 'var firebaseConfig = ' + JSON.stringify(BETA, null, 4).replace(/\n/g, '\n  ') + ';', 'firebaseConfig');

/* 2) 저장소 분리 + 검색 노출 막기 + 제목 — <head> 바로 뒤, 다른 스크립트보다 먼저 */
const headInject = `<meta name="robots" content="noindex,nofollow">
<script>/* BETA: 운영과 같은 주소라 저장소 키를 분리 */(function(){var P='beta:';var S=Storage.prototype,g=S.getItem,s=S.setItem,r=S.removeItem;S.getItem=function(k){return g.call(this,P+k)};S.setItem=function(k,v){return s.call(this,P+k,v)};S.removeItem=function(k){return r.call(this,P+k)};})();</script>`;
rep(/<head>/, '<head>\n' + headInject, '<head>');
rep(/<title>/, '<title>[베타] ', '<title>');

/* 3) 푸시 끔 */
rep(/var _pushUsable = \(function \(\) \{/, 'var _pushUsable = false && (function () {', '_pushUsable');

/* 4) 상대 경로 이미지 */
h = h.split('src="coffee-qr.png"').join('src="../coffee-qr.png"');

/* 5) 🧪 베타 패널 — 앱 코드 안(마지막 })(); 직전)에 넣어 앱 함수·변수를 그대로 씀 */
const panel = fs.readFileSync(path.join(__dirname, 'beta-panel.js'), 'utf8');
const endRe = /\}\)\(\);\s*<\/script>\s*<\/body>/g;
let at = -1, mm;
while ((mm = endRe.exec(h))) at = mm.index;   /* 마지막 것 (줄바꿈 CRLF·LF 모두) */
if (at < 0) throw new Error('앱 코드 끝을 못 찾음');
h = h.slice(0, at) + '\n' + panel + '\n' + h.slice(at);

fs.mkdirSync(path.join(root, 'beta'), { recursive: true });
const outName = process.argv[3] || 'index.html';   /* 예: node tools/build-beta.js master old.html (비교용 옛 화면) */
fs.writeFileSync(path.join(root, 'beta', outName), h);

/* 서비스워커도 베타 설정으로 (푸시는 꺼져 있지만 혹시 등록돼도 운영과 섞이지 않게) */
let sw = fs.readFileSync(path.join(root, 'firebase-messaging-sw.js'), 'utf8');
sw = sw.replace(/apiKey: "[^"]*"/, 'apiKey: "' + BETA.apiKey + '"')
  .replace(/authDomain: "[^"]*"/, 'authDomain: "' + BETA.authDomain + '"')
  .replace(/projectId: "[^"]*"/, 'projectId: "' + BETA.projectId + '"')
  .replace(/storageBucket: "[^"]*"/, 'storageBucket: "' + BETA.storageBucket + '"')
  .replace(/messagingSenderId: "[^"]*"/, 'messagingSenderId: "' + BETA.messagingSenderId + '"')
  .replace(/appId: "[^"]*"/, 'appId: "' + BETA.appId + '"');
fs.writeFileSync(path.join(root, 'beta', 'firebase-messaging-sw.js'), sw);

const ver = (h.match(/APP_VERSION = '([0-9-]+)'/) || [])[1];
console.log('beta/' + outName + ' 생성 — 버전 ' + ver + ', ' + Math.round(h.length / 1024) + 'KB');
