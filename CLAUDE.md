# 베니브릿지 (Benny Bridge)

지인 기반 소개팅 웹앱. "관리자(베니) 주변 사람들 중심으로 믿을 수 있는 소개팅"을 이어주는 작은 서비스.

- **레포**: `benny3s/benny-meeting` (이 폴더 `matchmaking/`가 git 루트)
- **라이브**: https://benny3s.github.io/benny-meeting/ (GitHub Pages, `master` push 시 자동 배포)

## 아키텍처 (한눈에)
- **클라이언트**: 단일 파일 **`index.html`** (~630KB, 바닐라 JS). 실제 로직은 `<script id="app-logic">` 인라인 블록 하나에 다 들어있음. (별도 `<script id="state-json" type="application/json">`은 시드용 JSON — JS 아님)
- **상태 저장**: Firestore 단일 문서 **`app/state`**. 주요 필드: `entries`(승인 회원), `pendingEntries`(승인 대기·보류), `dateRequests`(사진/대화 요청), `dm`(회원↔회원 채팅), `messages`(회원↔관리자 Q&A), `logs`(활동기록 **최근분만**, 최대 ~400 유지; 600 초과 시 오래된 건 별도 문서 **`app/logs`**로 배치 아카이브 — `maybeArchiveLogs`, 관리자 "이전 기록 더 보기"로 로드), `joinRequests`(주선자 요청), `connLog`/`connEver`(누적 연결), `coupleReports`(커플 성사), `smsLog`, `deletedLog`, `adminAuth`, `adminSecOrder`, `announce`/`checkin`/`popup`.
- **인증**: Firebase **익명 로그인**(`signInAnonymously`). Firestore 규칙: `app/state`·`app/logs`(로그 아카이브)·`photos/{id}`·`pushTokens/{id}`는 `auth != null`일 때만 read/write, 그 외 전부 차단. → **익명 인증이 안 잡히면 쓰기 실패("Missing or insufficient permissions")**. 제출 전 인증 가드 있음.
- **관리자**: `adminAuth`에 RSA 키쌍(공개키 + PIN으로 감싼 개인키). 관리자 PIN 입력 시 개인키 unlock(`adminPrivateKey`). 민감정보(`realNameEnc`·`contactEnc`·`referrerEnc`)는 **관리자 공개키로 암호화(RSA-OAEP)**, 관리자만 client에서 복호화(`decryptWithAdmin`).
- **사진**: `photos/{entryId}` 컬렉션. **푸시 토큰**: `pushTokens/{entryId}`(+ `'admin'`).
- **Cloud Functions** (`functions/index.js`, region `asia-northeast3`, Node 22):
  - `onStateChange` — app/state 변경 감지 → 요청/승인/거절/DM/새신청 FCM 푸시
  - `remindPending` — 매시간 스케줄, pending 요청 1일/3일차 리마인더 푸시
  - `savePhone`/`setAcqFilter`/`clearAcqFilter`/`getHiddenIds` — 보안 번호 저장소(`sendContacts/{id}`, 서버키 AES) + 지인필터
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
   for i in 1 2 3 4 5 6; do v=$(curl -s "https://benny3s.github.io/benny-meeting/index.html?cb=$RANDOM" | grep -o "APP_VERSION = '[0-9-]*'" | head -1); echo "try $i: $v"; case "$v" in *NNN*) echo LIVE; break;; esac; sleep 15; done
   ```
   - ⚠️ **일부 환경(클라우드/샌드박스)에선 `benny3s.github.io` 접속이 네트워크 정책으로 차단**될 수 있음(예: 403 to CONNECT). 그러면 이 폴링은 실패 → 배포 반영은 **사용자가 직접 확인**하거나, GitHub API로 Pages 빌드 상태만 확인. (api.github.com·firestore.googleapis.com은 대개 열려 있음)
- **커밋 attribution**: 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (세션 지침이 다르면 그걸 우선).

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
- firebase 시크릿/배포 명령은 Claude Code 자동모드에서 "Credential Materialization"으로 막힐 수 있음 → 사용자에게 안내.

## 주요 관례 · 함정
- **관리자 섹션**: `DEFAULT_SEC_ORDER` 배열 + `SEC_NAMES` 맵 + `secHtml` 객체 + `adminFold()` + `<details data-sec="...">` + `secOpenAttr`. 새 키를 배열·맵·객체에 추가하면 순서에 자동 편입됨(`adminSecOrder` 병합).
- **클라이언트 검색**: 행에 `data-*search` 속성 + `apply*Search()`가 `style.display`로 숨김/표시(리페인트 없이 → 포커스·한글 IME 유지). `paint()`에서 재적용.
- `modalNotice`는 메시지를 escape함(HTML 태그 넣지 말 것). `modalMessage`(입력)·`modalConfirm`(예/아니오) 패턴.
- **Firestore 문서 ID**: `__이름__`(양쪽 밑줄) 예약어 → `invalid-argument`. 쓰지 말 것.
- **PowerShell**: `firebase.ps1` 실행정책 차단됨 → `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` 후 실행하거나 `& "$env:APPDATA\npm\firebase.cmd" ...`.
- **테스트 계정**: `entry.testAccount = true` → 일반 명단/집계에서 숨김. 관리자 패널 스위치로만 노출. **닉네임이 `QA_`로 시작하면 가입 시 자동으로 testAccount 처리**(v347, handleFormSubmit·handleMatchmakerSubmit). QA는 `QA_` 접두어로 계정 생성 → 자동 숨김.
- **삭제 정책**: 일반 회원·주선자(프로필 포함) 모두 **"삭제 요청 → 관리자 승인"**. 주선자 껍데기(프로필·친구 없음)만 즉시 삭제. `handleApproveDelete`가 승인 시 오펀 주선자 껍데기까지 정리.
- **주선자(대리) 모델**: `managedBy`(주선자 id) + `ownerSelf`(주선자 본인 프로필) + `isMatchmaker`(매니저 계정). `viaMm`/`decidedViaMm` 플래그.

## 배경 지식 (제약)
- 카카오 **비즈니스 채널/알림톡**은 **"만남주선" 업종으로 반려**됨. 개인별 자동 알림은 카카오 불가 → **FCM 푸시(자동·무료) + SMS(수동)** 로.
- **유료 매칭**은 `결혼중개업법` 신고/등록 대상 소지 → 유료화 전 확인 필요(법무 자문 별도).

## 메모리
프로젝트 비자명한 사실·결정·상태는 Claude 메모리(이 프로젝트 경로에 스코프됨)에 축적됨. 세션 시작 시 자동 로드되니, 코드/깃 히스토리와 함께 참고할 것.
