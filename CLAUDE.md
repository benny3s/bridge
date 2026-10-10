# 베니브릿지 (Benny Bridge)

지인 기반 소개팅 웹앱. "관리자(베니) 주변 사람들 중심으로 믿을 수 있는 소개팅"을 이어주는 작은 서비스.

- **레포**: `benny3s/bridge` (이 폴더 `matchmaking/`가 git 루트. 구 `benny-meeting`에서 rename됨 — 2026-09-21)
- **라이브**: https://benny3s.github.io/bridge/ (GitHub Pages, `master` push 시 자동 배포). 구 주소 `benny3s.github.io/benny-meeting/`는 별도 `benny-meeting` repo(리다이렉트 전용)가 `/bridge/`로 넘겨줌. ※ **Firebase 프로젝트명은 여전히 `benny-meeting`** (데이터 백엔드 — Pages 주소와 무관, 안 바뀜)

## 아키텍처 (한눈에)
- **클라이언트**: 단일 파일 **`index.html`** (~630KB, 바닐라 JS). 실제 로직은 `<script id="app-logic">` 인라인 블록 하나에 다 들어있음. (별도 `<script id="state-json" type="application/json">`은 시드용 JSON — JS 아님)
- **상태 저장**: Firestore 단일 문서 **`app/state`**. 주요 필드: `entries`(승인 회원), `pendingEntries`(승인 대기·보류), `dateRequests`(사진/대화 요청), `dm`(회원↔회원 채팅), `messages`(회원↔관리자 Q&A), `logs`(활동기록 **최근분만**, 최대 ~400 유지; 600 초과 시 오래된 건 별도 문서 **`app/logs`**로 배치 아카이브 — `maybeArchiveLogs`, 관리자 "이전 기록 더 보기"로 로드), `joinRequests`(주선자 요청), `connLog`/`connEver`(누적 연결), `coupleReports`(커플 성사), `smsLog`, `deletedLog`, `adminAuth`, `adminSecOrder`, `announce`/`checkin`/`popup`.
- **인증·신분 (2026-10 보안 개편)**: 손님은 Firebase 익명 로그인. 회원·관리자는 CF `memberLogin`/`adminLogin`이 PIN·관리자 비번을 **서버에서** 확인(계정별 5회 실패마다 잠금, `loginGuard`)하고 custom token 발급 — 승인 회원 `{m:1}`(uid=entryId), 승인 대기 `{p:1}`, 관리자 uid `admin` `{admin:1}`. 앱은 토큰 신분으로 `dataMode` 전환(`switchDataForAuth`): **full**(m/admin) = `app/state` 구독, **public**(손님·승인대기) = `app/public` 공개 요약(티저·로그인 목록, onStateChange가 생성) + 승인대기 본인은 `applicantAction{op:pendingView}`. 손님·승인대기의 쓰기(가입·주선자 신청·문의·PIN 재설정 요청·신청서 수정/철회·메시지)는 전부 CF `applicantAction`이 검증 후 대행 — **public 모드에서 app/state 직접 쓰기 금지**(규칙상 거부됨).
- **보안 규칙**: `app/state` 읽기=회원(m)·관리자, **회원 쓰기는 허용 키만**(`memberStateKeysOnly`: entries·pendingEntries·dateRequests·messages·logs·joinRequests·connLog·connEver·coupleReports·appVersion·dm) — adminAuth·announce·popup·checkin·adminSecOrder·smsLog·smsTpl·deletedLog·pinResetReqs 등은 관리자만(**새 state 키를 회원 기능에서 쓰려면 이 목록에 추가 필요**). `app/logs`=회원·관리자, `app/public`=누구나 읽기, `photos/{id}`=서버가 붙인 `viewers`만 읽기·`owners`가 photos 필드만 수정(서버 `syncPhotoAcl`), `chats/*`=viewers(+관리자는 신고된 방), `pushTokens/{id}`=본인·관리자, `adminOnly/*`·`adminKey/*`=관리자, `portal/config`=누구나 읽기·관리자만 쓰기(benny3s.github.io 메인 포털의 항목 목록 — 포털이 이름 붙인 Firebase 앱 `portal`로 `adminLogin` 토큰을 받아 저장, 2026-10-08), 나머지 서버 전용. ⚠️ 규칙 배포는 일반 셸에선 Claude 자동모드가 차단 → 소유자 지시로 **Windows MCP(PowerShell)로 배포**.
- **비밀 분리 (금고)**: PIN 해시(`pinAuth`/`pinHash`)·PIN 잠금 번호(`contactSelfEnc`)는 `secrets/{id}`(서버만), 실명·번호·경로 암호문(`realNameEnc`·`contactEnc`·`referrerEnc`, 관리자 공개키 RSA-OAEP)은 `adminOnly/{id}`(관리자만), 관리자 개인키(관리자 비번으로 감쌈)는 `adminKey/main`; state의 `adminAuth`엔 공개키만. **앱은 예전처럼 state에 써도 됨** → CF `onStateChange.sweepSecrets`가 즉시 금고로 옮기고 state에서 제거. state의 PIN 유무 표시는 `pinSet` → 앱은 `hasPin(e)`로 판단(직접 `e.pinAuth` 검사 금지). PIN 회수 시 `pinSet`도 delete. 계정 간 PIN·개인정보 승계는 `pinFrom`/`privFrom`(원래 계정 id). 관리자 화면은 `adminOnly`·`adminKey`를 구독해 메모리 state에만 덧붙임(`overlayAdminPriv`) → 관리자 코드는 그대로 `entry.contactEnc` 읽음. state에서 사라진 계정 금고는 삭제 표시 후 7일 뒤 `remindPending`이 정리.
- **쓰기 서명·보안 감시**: 앱의 모든 `app/state` 쓰기에 `_w`(토큰 uid)·`_wn`(새 난수)가 자동으로 붙음(`stampStateWrites`: 문서 update/set·트랜잭션·배치 감쌈) — 규칙 `signedWrite`가 필수로 요구하므로 **`update('필드', 값)` 같은 인자 나열형 쓰기는 거부됨(객체형만 사용)**. `_wn` 이 안 바뀐 변경 = 서버 쓰기. CF `detectTamper`가 회원의 남 데이터 변경(변경 전 관계 기준)을 `securityAlerts`에 전·후와 함께 기록 + 관리자 푸시 → 관리자 "🛡 보안 경고"에서 되돌리기(`restoreTamper`). 로그인은 계정 5회 실패마다 잠금+알림, IP당 1시간 20회 실패 시 1시간 차단(`loginIp`)+알림. **새 회원 기능이 남의 항목을 정상적으로 바꾼다면 `detectTamperIssues` 예외에 추가**(안 하면 오탐 경고).
- **회원 채팅 = 대화방 `chats/{pair}`** (pair=정렬한 두 entryId를 `__`로 연결): `members`·`viewers`(두 사람+각자의 주선자)·`msgs`·`clearedAt{id:시각}`·`bothClearedAt`·`reportedAt/By/Reason`·`reportHistory`. 읽기=viewers, 관리자는 **신고된 방만**(규칙 강제), 쓰기는 CF `chatAction`(send/clear/report, 관리자 adminViewed/resolve)만. 앱은 `startChats`로 실시간 구독(`_chats`, 관리자는 `_reportedChats`), `dmThread`는 대화방+옛 `state.dm` 병합. 지우기=내 화면만, 둘 다 지우거나 둘 다 탈퇴해도 **90일 보관 후** `remindPending`(KST 04시 `purgeOldChats`)이 삭제, 신고 중이면 보존. 연결 해제·탈퇴 상대는 메시지함 "지난 대화"(읽기 전용). v429: 대화방 목록(`chatRoomsHtml`, 안 읽은 수 `chatUnreadTotal`)·전체 화면 채팅(`openDmChat`, 상단에서 프로필·사진 공개 상태), 길게 누르기/우클릭 지우기(`bindChatItemPress`), 읽음은 `chatAction{op:'read'}`가 `readAt{id}` 기록(8초 간격) — 상대에게 '1' 표시는 `SHOW_READ_MARK=false`로 꺼 둠. 색은 기존 테마 변수 유지(카톡 디자인 흉내 금지 — 사용자 결정). `state.dm`은 비었고 옛 앱이 쓰면 onStateChange가 대화방으로 옮김. 관리자 섹션 `reports`(🚨 신고된 대화).
- **관리자 키**: RSA 키쌍(공개키 + 관리자 비번으로 감싼 개인키). 잠금 해제 = adminLogin 토큰 → adminKey 읽기 → `unlockAdminKey` → `adminPrivateKey`, 관리자만 client에서 복호화(`decryptWithAdmin`).
- **사진**: `photos/{entryId}` 컬렉션. **푸시 토큰**: `pushTokens/{entryId}`(+ `'admin'`).
- **Cloud Functions** (`functions/index.js`, region `asia-northeast3`, Node 22):
  - `onStateChange` — app/state 변경 감지 → 요청/승인/거절/DM/새신청 FCM 푸시
  - `remindPending` — 매시간 스케줄, pending 요청 1일/3일차 리마인더 푸시
  - `savePhone`/`setAcqFilter`/`clearAcqFilter`/`getHiddenIds` — 보안 번호 저장소(`sendContacts/{id}`, 서버키 AES) + 지인필터. 본인 토큰이면 PIN 없이, 아니면 PIN+실패 잠금(`callerOwns`)
  - `memberLogin`/`adminLogin`/`applicantAction` — 위 인증·대행. 서버 코드 변경 시 가짜 Firestore로 로컬 시험 가능(firebase-admin을 Module._load로 모킹 후 `exports.X.run(data, context)`) — Firebase callable SDK는 window.fetch 가로채기로 막을 수 없으니 브라우저 가로채기 시험 금지(실제 전송됨)
  - `adminSendSms` — Solapi 문자(배포돼 있으나 **현재 수동 문자는 "내 폰 문자앱(sms: 링크)"** 사용, `openSmsNative`. Solapi는 070·자동/대량용으로 보류)

## 배포 워크플로 (모든 코드 변경 시 반드시)
1. `index.html` 편집 후 **`var APP_VERSION = 'YYYY-MM-DD-NNN';`** (파일 상단, ~907줄) **버전 올리기**. 새 버전 뜨면 열려있는 다른 탭에 새로고침 안내가 뜸.
2. **문법 검사** (인라인 app-logic 스크립트만 검사, state-json은 제외). **프로젝트 루트에서 실행**(절대경로 하드코딩 금지 — 환경마다 경로 다름. 필요하면 `cd "$(git rev-parse --show-toplevel)"`):
   ```bash
   node -e 'const fs=require("fs"),vm=require("vm");const h=fs.readFileSync("index.html","utf8");const re=/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,bad=0;while((m=re.exec(h))){i++;try{new vm.Script(m[1]);}catch(e){bad++;console.log("BLOCK "+i+" ERR: "+e.message);}}console.log("scanned "+i+" block(s), "+bad+" error(s)");'
   ```
   (functions 변경 시 `node --check functions/index.js`)
3. **커밋 + 푸시**. 커밋 메시지는 한국어로 무엇을 왜 바꿨는지 + 끝에 버전.
   - **브랜치 정책**: 로컬 데스크톱 세션은 **`master` 직푸시**(GitHub Pages가 master에서 배포). **단, 샌드박스/클라우드 세션이 "특정 브랜치에만 푸시" 같은 제한을 두면 그 세션 지침이 우선** — 그때는 세션 브랜치에 푸시하고 사용자가 master로 병합. 어느 쪽인지 애매하면 사용자에게 확인.
4. **라이브 확인** — Pages 반영에 1~2분. 새 버전 뜰 때까지 폴링:
   ```bash
   for i in 1 2 3 4 5 6; do v=$(curl -s "https://benny3s.github.io/bridge/index.html?cb=$RANDOM" | grep -o "APP_VERSION = '[0-9-]*'" | head -1); echo "try $i: $v"; case "$v" in *NNN*) echo LIVE; break;; esac; sleep 15; done
   ```
   - ⚠️ **일부 환경(클라우드/샌드박스)에선 `benny3s.github.io` 접속이 네트워크 정책으로 차단**될 수 있음(예: 403 to CONNECT). 그러면 이 폴링은 실패 → 배포 반영은 **사용자가 직접 확인**하거나, GitHub API로 Pages 빌드 상태만 확인. (api.github.com·firestore.googleapis.com은 대개 열려 있음)
- **커밋 attribution**: 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (세션 지침이 다르면 그걸 우선).

## 베타 서버 (2026-10-09~)
운영과 완전히 분리된 시험 환경. **데이터 구조 변경·이전(마이그레이션)·위험한 기능은 베타에서 먼저 시험한 뒤 운영 반영.**
- Firebase 프로젝트 **`benny-bridge-beta`** (Blaze, 서울 asia-northeast3, 월 예산 알림 1,000원) — 가짜 데이터만. 운영은 `benny-meeting`.
- 페이지 **https://benny3s.github.io/bridge/beta/** = `beta/index.html` (**직접 고치지 말 것** — `node tools/build-beta.js`가 운영 `index.html`을 복사해 만듦: Firebase 설정만 베타로, 저장소 키 `beta:` 접두어로 운영과 분리, 푸시 끔, 🧪 패널 삽입). 운영 코드를 고치면 → 빌드 → 커밋·푸시 → 베타에서 시험 → 문제없으면 운영 그대로.
- **🧪 패널**(`tools/beta-panel.js`, 베타에만 들어감): 관리자로 / 손님으로 / 회원 골라 들어가기 / 🌱 시험 데이터 다시 심기. 시험 계정 비번·PIN은 그 파일 상수(가짜 데이터 전용). 콘솔에선 `window.__beta.asAdmin()` 등.
- 시드: CF **`betaSeed`** — 베타 프로젝트에서만 동작(운영에서 부르면 거절). 처음엔 누구나, 그 뒤엔 베타 관리자만. 베타의 모든 컬렉션을 지우고 가짜 회원(여12·남12·주선자1+친구1·대기1·보류1)·요청·사진을 심음.
- **운영 반영 전 기능은 브랜치로**: 기능 브랜치(예 `feature/meet-zones`)에 index.html·functions 커밋 → master 로 돌아와 `node tools/build-beta.js feature/meet-zones` → `beta/`만 커밋·푸시(Pages는 master만 배포) → 베타 시험 → 문제없으면 브랜치를 master 에 병합해 운영 반영 + 운영 함수 배포. master 의 index.html = 항상 운영 코드.
- **index.html 은 CRLF** — Git Bash `sed -i` 는 LF로 바꿔 파일 전체가 바뀐 것처럼 됨 → 편집은 Edit/python 으로.
- 🧬 운영 모양으로 심기: 운영 관리자 탭에서 익명화 템플릿(성별·나이·키·사는 지역·관계·시각·요청 그래프만, 이름·사진·소개·연락처 없음)을 `localStorage['beta:seedTemplate']`에 넣고 같은 브라우저 베타 탭에서 패널 버튼.
- **지역 채널 스위치 `ZONES_ON`**(index.html, 2026-10-10 v429): 운영은 `false`(지역 화면 전부 숨김 — 데이터·서버 검증 `MEET_ZONES`·teaser meetZones는 이미 운영에 있음), 베타 빌드는 자동으로 `true`. `ZONES_OFF=1 node tools/build-beta.js <브랜치> preview.html` = 운영 모습 미리보기. 운영에서 켜려면 `ZONES_ON = true` 한 줄 + 버전.
- 배포: 규칙 `firebase deploy --only firestore:rules --project benny-bridge-beta`(Windows MCP), 함수 `--project benny-bridge-beta`. 베타 비밀값(NUM_ENC_KEY 등)은 베타 전용 새 값(SOLAPI는 가짜). **운영에 배포할 땐 `--project benny-meeting`(기본값) 확인.**

## 환경별 주의 (로컬 데스크톱 vs 클라우드/샌드박스)
이 프로젝트의 풀 워크플로(배포·라이브확인·QA·라이브 데이터)는 **로컬 데스크톱 세션**을 전제로 한다. 클라우드/샌드박스(원격) 세션은 제약이 있으니 주의:
- **브라우저 도구(`mcp__Claude_Browser__*`)** 는 데스크톱 앱 세션에만 있음. 없는 환경에선 **QA·data-ops·라이브 Firestore 조작이 불가**(컨테이너에 Chromium+Playwright가 있으면 대체 경로를 별도로 만들 수 있음).
- **`benny3s.github.io` 접속 차단** 가능 → 라이브 버전 폴링 불가(위 4단계 참고).
- **경로**는 환경마다 다름(로컬 `/c/Users/...`, 컨테이너 `/home/user/...`) → 절대경로 하드코딩 금지, 프로젝트 루트 기준 상대경로.
- **브랜치 제한**을 두는 세션에선 master 직푸시 금지 → 세션 브랜치로(위 3단계).
- **에이전트 정의**는 세션 시작 시 로드됨. git으로 방금 받아온 에이전트는 그 세션에서 이름 호출이 안 될 수 있음 → **새 세션**을 열면 확실.
- **결론**: 배포·QA·데이터·라이브확인이 필요하면 **로컬 데스크톱 세션**에서. 클라우드/원격 세션은 planner(기획)·dev(코드 초안 작성)까지가 무난.

## 라이브 데이터 확인/수정 (Firestore)
- 인앱 브라우저(데스크톱 세션)로: **먼저 `navigate` 로 라이브 사이트 로드**(턴 사이에 탭이 비므로), 그다음 `javascript_tool`에서 `firebase.firestore().doc('app/state')` 로 읽기/쓰기.
- **읽기는 자유롭게. 쓰기는 프로덕션 데이터**라 신중히(가능하면 임시 필드→삭제, 실회원 건드리지 않기).
- ⚠️ **새 세션에선 자동모드 권한 검사가 운영 데이터 읽기(`javascript_tool`)를 막을 수 있음** — 이전 대화의 허락은 이어지지 않기 때문. 사용자(소유자)는 라이브 데이터 조회를 원칙적으로 허용함: 막히면 "운영 데이터 조회 허용"을 한 줄 요청해 받고 진행. **반드시 새 주소 `/bridge/`에서** 읽을 것(구 `/benny-meeting/`은 Firebase 없는 안내 페이지라 읽기 실패).
- firebase 시크릿/배포 명령은 Claude Code 자동모드에서 "Credential Materialization"으로 막힐 수 있음 → 사용자에게 안내. (functions 배포 `firebase.cmd deploy --only functions:<이름>`은 대개 통과, "Failed to list functions"는 일시 오류라 재시도)
- GitHub repo 이름 변경·새 repo 생성은 자동모드가 막음 → 사용자 계정 브라우저(Claude in Chrome, benny3s 로그인)로 처리. git push는 `gh auth setup-git`로 benny3s 인증 고정됨(다른 계정 minim0 캐시 주의).

## 주요 관례 · 함정
- **관리자 섹션**: `DEFAULT_SEC_ORDER` 배열 + `SEC_NAMES` 맵 + `secHtml` 객체 + `adminFold()` + `<details data-sec="...">` + `secOpenAttr`. 새 키를 배열·맵·객체에 추가하면 순서에 자동 편입됨(`adminSecOrder` 병합).
- **클라이언트 검색**: 행에 `data-*search` 속성 + `apply*Search()`가 `style.display`로 숨김/표시(리페인트 없이 → 포커스·한글 IME 유지). `paint()`에서 재적용.
- `modalNotice`는 메시지를 escape함(HTML 태그 넣지 말 것). `modalMessage`(입력)·`modalConfirm`(예/아니오) 패턴.
- **Firestore 문서 ID**: `__이름__`(양쪽 밑줄) 예약어 → `invalid-argument`. 쓰지 말 것.
- **PowerShell**: `firebase.ps1` 실행정책 차단됨 → `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` 후 실행하거나 `& "$env:APPDATA\npm\firebase.cmd" ...`.
- **테스트 계정**: `entry.testAccount = true` → 일반 명단/집계에서 숨김. 관리자 패널 스위치로만 노출. **닉네임이 `QA_`로 시작하면 가입 시 자동으로 testAccount 처리**(v347, handleFormSubmit·handleMatchmakerSubmit). QA는 `QA_` 접두어로 계정 생성 → 자동 숨김.
- **삭제 정책**: 일반 회원·주선자(프로필 포함) 모두 **"삭제 요청 → 관리자 승인"**. 주선자 껍데기(프로필·친구 없음)만 즉시 삭제. `handleApproveDelete`가 승인 시 오펀 주선자 껍데기까지 정리.
- **주선자(대리) 모델**: `managedBy`(주선자 id) + `ownerSelf`(주선자 본인 프로필) + `isMatchmaker`(매니저 계정). `viaMm`/`decidedViaMm` 플래그.
- **app/state 쓰기 원칙(동시 저장 덮어쓰기 방지)**: 배열·필드를 바꿀 땐 **트랜잭션 안에서 `tx.get`으로 읽은 서버 최신값**을 고쳐 쓰거나 `FieldValue.arrayUnion`(한 줄 추가)만. 트랜잭션 없이 `get→update`나 **화면의 `currentState` 배열로 덮어쓰기 금지** — 2026-10-02 appendLog 가 이렇게 해서 다른 사람 기록을 지우고 보안 경고 오탐을 냄.
- **여러 명에게 메시지**: `sendMessageTo`를 `Promise.all`로 병렬 호출 금지(app/state 동시 트랜잭션 충돌 "stored version does not match") → **`sendMessagesBulk`**(한 트랜잭션 append) 사용.
- **보관(휴면, `deactivated`) 계정**: 명단 숨김 + 로그인 불가 + 요청·재요청·채팅 차단(앱) + 푸시·리마인더 생략(functions `notifyRecipient`/`remindPending`). 대기 요청은 지우지 않고 "💤 상대 휴면 중"으로 일시정지. 보관 출처는 `deactivatedVia`(deactivate-request/delete-request/admin). 삭제 대신 "보관으로 대신"이 기본 권장.
- **무응답 대응**: 요청 1·3일 푸시 리마인더 + 7일 앱 관리자 메시지 1회(`remindPending`, remind1/2/3Sent) + 관리자 **"📞 연락 필요"** 섹션(섹션 키는 `stale` 유지. 회원 1명=1줄, 가로 칸 👀무응답(요청 본 뒤 2일+)/📭미접속(요청 온 뒤 미접속)/💤장기(7일+), `contactStats`. 칸 클릭→`openSmsNative(id, null, kind)`로 그 상황 초안. 초안은 `state.smsTpl`(기본값과 같으면 저장 안 함, `SMS_TPL_DEFAULT`), "✏️ 문자 초안 관리"(`openSmsTplEditor`)에서 편집, 치환 {닉네임}{건수}{일수}{링크}. 문자앱 열면 `smsLog`에 `native-<kind>` 기록→"📱 M/D 보냄" 표시. 앱 메시지 선택 재촉 `stale-nudge`도 여기) + **앱 내 재촉 팝업**(`maybeShowReqNudge`: 2일+ pending 받은 요청 있으면 앱 열 때, 기기당 3일 1회, 주선자는 친구 앞 요청 합산·한 프로필이면 바로 전환). 거절 사유는 선택(`REJECT_CHIPS` 고르기/직접/비우면 기본 인사), 보류는 `HOLD_CHIPS`+10자 유지.
- **관리자 메시지함(`adminmsg`)**: 기본 보기는 💬 대화(회원 답 또는 관리자가 직접 쓴 말)만, 자동 안내(응답 재촉·휴면 안내·승인 축하·공지)는 `isAutoMsg`(`m.auto`·broadcast·`AUTO_MSG_RE` 문구 앞머리)로 판별해 대화 안에서 🤖 한 줄로 접힘. **새 자동 메시지를 추가하면 `auto:true`를 붙이거나 `AUTO_MSG_RE`에 앞머리 추가**(안 하면 대화로 섞임). 🤖 자동 안내만 탭의 일괄 정리는 `hiddenByAdmin`(관리자 목록만).
- **앱 열 때 자동 팝업은 최대 2개**(`autoPopupOk`/`noteAutoPopup`): 공지 > 1회성 공지 > 새 소식 > 응답 재촉(새 소식 떴으면 생략) > 주간 인사(다른 팝업 없을 때만). 새 자동 팝업 추가 시 이 예산에 편입할 것. 생략된 팝업은 seen 기록 전에 return해야 다음에 뜸.
- **렌더 성능**: `onSnapshot` → `schedulePaint`(~400ms 코얼레싱). 관리자 본인 조작은 즉시 `paint`. 관리자 PII는 `decryptedContacts`/`decryptedNames` 캐시(검색 인덱스에도 관리자일 때만 포함).

## 배경 지식 (제약)
- 카카오 **비즈니스 채널/알림톡**은 **"만남주선" 업종으로 반려**됨. 개인별 자동 알림은 카카오 불가 → **FCM 푸시(자동·무료) + SMS(수동)** 로.
- **유료 매칭**은 `결혼중개업법` 신고/등록 대상 소지 → 유료화 전 확인 필요(법무 자문 별도).

## 메모리
프로젝트 비자명한 사실·결정·상태는 Claude 메모리(이 프로젝트 경로에 스코프됨)에 축적됨. 세션 시작 시 자동 로드되니, 코드/깃 히스토리와 함께 참고할 것.
