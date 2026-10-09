  /* ════ 🧪 베타 전용 패널 (tools/build-beta.js 가 beta/index.html 에만 넣음 — 운영 index.html 엔 없음) ════
     베타 서버(benny-bridge-beta)의 가짜 데이터로 관리자·회원·손님 화면을 버튼으로 오가며 시험.
     시험 계정 비밀번호·PIN 은 아래 상수 (가짜 데이터 전용 — 운영과 무관). */
  (function betaPanel() {
    var BETA_ADMIN_PW = 'Beta!Admin2026';
    var BETA_PIN = '0000';
    var COLORS = ['#E58C96', '#8DB4E2', '#9CCB9A', '#F2C46D', '#B79AD8', '#F09E6E', '#7FC8C2', '#D7A6C8'];

    function fakePhoto(label, i) {
      var c = document.createElement('canvas'); c.width = 480; c.height = 640;
      var g = c.getContext('2d');
      g.fillStyle = COLORS[i % COLORS.length]; g.fillRect(0, 0, 480, 640);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center';
      g.fillText(label.slice(0, 1), 240, 360);
      g.font = 'bold 34px sans-serif'; g.fillText('BETA · ' + label, 240, 470);
      return c.toDataURL('image/jpeg', 0.7);
    }
    var F_NICK = ['봄비', '모카', '달빛', '라떼', '하늘', '소금빵', '단풍', '별빛', '민트', '체리', '노을', '구름'];
    var M_NICK = ['바다', '곰돌이', '산책', '커피콩', '우주', '감자', '호두', '여름', '연필', '버터', '소나무', '파도'];
    var REGIONS = ['서울 강남구', '경기 화성시 동탄', '서울 마포구', '수원 영통구', '용인 수지구', '서울 송파구', '성남 분당구', '부산 해운대구', '광주 서구', '대구 수성구', '인천 연수구', '서울 성동구'];
    var JOBS = ['삼성전자', '공기업', '대학병원 간호사', '초등교사', 'IT 스타트업', '은행', '연구원', '디자이너', '공무원', '회계사', '약사', '마케터'];
    var DAY = 86400000;
    function iso(daysAgo, h) { return new Date(Date.now() - daysAgo * DAY - (h || 0) * 3600000).toISOString(); }

    function buildSeed() {
      return setupAdminPin(BETA_ADMIN_PW).then(function (auth) {
        var pub = auth.publicKeyJwk;
        var people = [];
        F_NICK.forEach(function (n, i) { people.push({ nick: n, gender: 'female', i: i }); });
        M_NICK.forEach(function (n, i) { people.push({ nick: n, gender: 'male', i: i + 12 }); });
        people.push({ nick: '베타주선자', mm: true, i: 30 });
        people.push({ nick: '친구A', gender: 'female', i: 31, managed: true });
        people.push({ nick: '대기중1', gender: 'male', i: 32, pending: true });
        people.push({ nick: '보류중1', gender: 'female', i: 33, pending: true, held: true });
        var photos = {};
        return Promise.all(people.map(function (p, k) {
          var id = genId(); p.id = id;
          var contact = '010-0000-' + String(1000 + k).slice(-4);
          var ph = p.mm ? [] : [fakePhoto(p.nick, p.i)].concat(k % 3 === 0 ? [fakePhoto(p.nick + '2', p.i + 1)] : []);
          if (ph.length) photos[id] = ph;
          return Promise.all([
            encryptForAdmin(pub, contact), makePinAuth(BETA_PIN), encryptForSelf(BETA_PIN, contact),
            encryptForAdmin(pub, '시험' + (k + 1)), encryptForAdmin(pub, '베타 시드 데이터'),
            ph.length ? resizeDataUrl(ph[0], THUMB_MAX, THUMB_MAX, THUMB_Q) : Promise.resolve(null)
          ]).then(function (r) {
            var e = { id: id, nickname: p.nick, serial: k + 1, submittedAt: iso(40 - k, 3), pinSet: true,
              contactEnc: r[0], pinAuth: r[1], contactSelfEnc: r[2], realNameEnc: r[3], referrerEnc: r[4] };
            if (p.mm) { e.isMatchmaker = true; e.lastSeenAt = iso(0, 2); return e; }
            Object.assign(e, { gender: p.gender, birthYear: 1988 + (k % 10), height: String(p.gender === 'female' ? 158 + (k % 12) : 170 + (k % 14)),
              region: REGIONS[k % REGIONS.length], workplace: JOBS[k % JOBS.length], degreeChoice: '',
              intro: '베타 시험용 가짜 프로필이에요. ' + p.nick + '입니다. 산책과 맛집 탐방을 좋아해요.',
              idealType: '대화가 잘 통하는 사람', dealbreaker: '거짓말', blurPhoto: false,
              photoCount: ph.length, photoThumb: r[5],
              lastSeenAt: iso(k % 5 === 0 ? 12 : (k % 4), k), mineSeenAt: iso(1) });
            return e;
          });
        })).then(function (entries) {
          var byNick = {}; entries.forEach(function (e) { byNick[e.nickname] = e; });
          var mm = byNick['베타주선자'], friend = byNick['친구A'];
          friend.managedBy = mm.id; friend.isProxy = true; friend.proxyConsentAt = iso(20);
          var pend = entries.filter(function (e) { return e.nickname === '대기중1' || e.nickname === '보류중1'; });
          pend.forEach(function (e) { delete e.serial; });
          byNick['보류중1'].heldReason = '사진을 다시 올려주세요'; byNick['보류중1'].heldAt = iso(1);
          var approved = entries.filter(function (e) { return pend.indexOf(e) < 0; });
          /* 요청: 대기(여러 날짜)·승인·거절 섞어서 */
          var reqs = [], conn = [];
          function req(from, to, type, daysAgo, status) {
            var r = { id: genId(), fromId: byNick[from].id, toId: byNick[to].id, type: type, note: '베타 시험 요청', submittedAt: iso(daysAgo, 1) };
            if (status === 'approved') { r.approved = true; r.decidedAt = iso(Math.max(0, daysAgo - 1)); r.approveMessage = '반가워요!'; }
            if (status === 'rejected') { r.rejected = true; r.rejectedBy = byNick[to].id; r.decidedAt = iso(Math.max(0, daysAgo - 1)); r.rejectMessage = '좋은 인연 만나세요'; }
            reqs.push(r);
            if (status === 'approved' && type === 'contact') conn.push({ id: genId(), a: r.fromId, b: r.toId, at: r.decidedAt });
          }
          req('바다', '봄비', 'photo', 9, 'pending'); req('곰돌이', '봄비', 'photo', 3, 'pending'); req('산책', '봄비', 'contact', 1, 'pending');
          req('커피콩', '모카', 'photo', 12, 'pending'); req('우주', '달빛', 'photo', 5, 'approved'); req('우주', '달빛', 'contact', 4, 'approved');
          req('감자', '라떼', 'photo', 8, 'rejected'); req('라떼', '호두', 'photo', 2, 'pending'); req('하늘', '여름', 'photo', 6, 'approved');
          req('연필', '소금빵', 'photo', 0, 'pending'); req('버터', '친구A', 'photo', 4, 'pending'); req('소나무', '단풍', 'contact', 15, 'approved');
          var state = {
            adminAuth: auth, entries: approved, pendingEntries: pend, dateRequests: reqs,
            messages: [{ id: genId(), entryId: byNick['봄비'].id, from: 'user', text: '베타 시험 문의예요!', at: iso(1) }],
            logs: [], connLog: conn, connEver: [], coupleReports: [], joinRequests: [], smsLog: [], deletedLog: [],
            supporters: [], supFloatOn: false, appVersion: APP_VERSION
          };
          return { state: state, photos: photos };
        });
      });
    }
    /* 운영 '모양' 그대로 심기 (2026-10-09 Benny: '기존 데이터랑 똑같이') — 템플릿은 운영 관리자 화면에서 만든 익명화 데이터
       (닉네임·사진·소개·직장·실명·번호는 가짜, 성별·나이·키·사는 지역·주선자 관계·휴면·시각·요청 관계는 그대로).
       같은 주소(benny3s.github.io)라 운영 탭에서 localStorage 'beta:seedTemplate' 에 넣어 두면 여기서 읽힘. */
    var NICK_A = ['가람', '나래', '다온', '라온', '마루', '보라', '새봄', '아라', '여울', '자람', '초롱', '하람', '한결', '해솔', '윤슬', '미르', '누리', '온새', '단비', '로운'];
    function smallPhoto(label, i) {
      var c = document.createElement('canvas'); c.width = 300; c.height = 400;
      var g = c.getContext('2d');
      g.fillStyle = COLORS[i % COLORS.length]; g.fillRect(0, 0, 300, 400);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center';
      g.fillText(label.slice(0, 1), 150, 225); g.font = 'bold 22px sans-serif'; g.fillText('BETA · ' + label, 150, 300);
      return c.toDataURL('image/jpeg', 0.6);
    }
    function buildSeedFromTemplate(tpl) {
      return setupAdminPin(BETA_ADMIN_PW).then(function (auth) {
        var pub = auth.publicKeyJwk, idOf = {}, photos = {};
        var all = (tpl.entries || []).map(function (t) { t._pending = false; return t; }).concat((tpl.pending || []).map(function (t) { t._pending = true; return t; }));
        all.forEach(function (t) { idOf[t.k] = genId(); });
        return Promise.all(all.map(function (t, n) {
          var id = idOf[t.k], nick = NICK_A[n % NICK_A.length] + String(n + 1).padStart(3, '0');
          var contact = '010-0000-' + String(1000 + n).slice(-4);
          var ph = (!t.isMM && t.photoCount) ? [smallPhoto(nick, n)] : [];
          if (ph.length) photos[id] = ph;
          return Promise.all([
            encryptForAdmin(pub, contact), makePinAuth(BETA_PIN), encryptForSelf(BETA_PIN, contact),
            encryptForAdmin(pub, '시험' + (n + 1)), encryptForAdmin(pub, '베타 시드(운영 모양)'),
            ph.length ? resizeDataUrl(ph[0], t.blurPhoto ? BLUR_THUMB_MAX : THUMB_MAX, t.blurPhoto ? BLUR_THUMB_MAX : THUMB_MAX, t.blurPhoto ? BLUR_THUMB_Q : THUMB_Q) : Promise.resolve(null)
          ]).then(function (r) {
            var e = { id: id, nickname: nick, submittedAt: t.submittedAt, pinSet: true, contactEnc: r[0], pinAuth: r[1], contactSelfEnc: r[2], realNameEnc: r[3], referrerEnc: r[4] };
            ['serial', 'lastSeenAt', 'mineSeenAt', 'deactivated', 'deactivatedAt', 'deactivatedVia', 'ownerSelf', 'isProxy', 'proxyConsentAt', 'heldAt'].forEach(function (f) { if (t[f] != null) e[f] = t[f]; });
            if (t.deactivated) e.deactivatedReason = '잠시 쉬어갈게요';
            if (t.heldReason) e.heldReason = '사진을 다시 올려주세요';
            if (t.managedBy && idOf[t.managedBy]) e.managedBy = idOf[t.managedBy];
            if (t.isMM) { e.isMatchmaker = true; return e; }
            Object.assign(e, { gender: t.gender, birthYear: t.birthYear, height: t.height, region: t.region || '', workplace: JOBS[n % JOBS.length],
              degreeChoice: t.degree || '', intro: '베타 시험용 프로필(운영 모양 복제)이에요. ' + nick + '입니다.', idealType: '대화가 잘 통하는 사람', dealbreaker: '거짓말',
              blurPhoto: !!t.blurPhoto && ph.length > 0, photoCount: ph.length, photoThumb: r[5] });
            return e;
          });
        })).then(function (es) {
          var entries = es.filter(function (e, i) { return !all[i]._pending; });
          var pendingEntries = es.filter(function (e, i) { return all[i]._pending; });
          var reqs = (tpl.requests || []).filter(function (q) { return idOf[q.from] && idOf[q.to]; }).map(function (q) {
            var r = { id: genId(), fromId: idOf[q.from], toId: idOf[q.to], type: q.type, note: '베타 시험 요청', submittedAt: q.submittedAt };
            ['decidedAt', 'approved', 'rejected', 'held', 'userApproved', 'viaMm', 'decidedViaMm', 'remind1Sent', 'remind2Sent', 'remind3Sent', 'reappliedAt', 'fromRevealed'].forEach(function (f) { if (q[f] != null) r[f] = q[f]; });
            if (q.rejected) { r.rejectedBy = r.toId; r.rejectMessage = '좋은 인연 만나세요'; }
            if (q.approved) r.approveMessage = '반가워요!';
            if (q.held) { r.holdMessage = '조금만 기다려 주세요'; r.heldBy = r.toId; }
            if (q.hiddenBy) r.hiddenBy = q.hiddenBy.map(function (k) { return idOf[k]; }).filter(Boolean);
            return r;
          });
          var conn = (tpl.conn || []).filter(function (c) { return idOf[c.a] && idOf[c.b]; }).map(function (c) { return { id: genId(), a: idOf[c.a], b: idOf[c.b], at: c.at }; });
          var sms = (tpl.sms || []).filter(function (s) { return idOf[s.k]; }).map(function (s) { return { id: genId(), entryId: idOf[s.k], at: s.at, kind: s.kind, ok: true }; });
          var state = {
            adminAuth: auth, entries: entries, pendingEntries: pendingEntries, dateRequests: reqs,
            messages: [], logs: [], connLog: conn, connEver: [], coupleReports: [], joinRequests: [], smsLog: sms, deletedLog: [],
            supporters: [], supFloatOn: false, appVersion: APP_VERSION
          };
          return { state: state, photos: photos };
        });
      });
    }
    function seedFromTemplate() {
      var tpl = null;
      try { tpl = JSON.parse(localStorage.getItem('seedTemplate') || 'null'); } catch (e) {}
      if (!tpl || !tpl.entries) { modalNotice('안내', '운영 모양 템플릿이 없어요. (운영 관리자 화면에서 만들어야 해요)'); return Promise.resolve(); }
      var hide = showBusy('운영 모양 데이터 만드는 중… (1분쯤)');
      return buildSeedFromTemplate(tpl).then(function (payload) {
        return fns.httpsCallable('betaSeed')(payload);
      }).then(function (r) {
        hide();
        clearAdminPin(); currentUser = null; saveSession();
        modalNotice('완료', '운영 모양으로 심었어요 (회원 ' + (r.data && r.data.entries) + '명, 사진 ' + (r.data && r.data.photos) + '명).');
        return toGuest();
      }).catch(function (e) { hide(); modalNotice('실패', (e && e.message) || String(e)); });
    }
    function seed() {
      var hide = showBusy('시험 데이터 만드는 중… (20초쯤)');
      return buildSeed().then(function (payload) {
        return fns.httpsCallable('betaSeed')(payload);
      }).then(function (r) {
        hide();
        clearAdminPin(); currentUser = null; saveSession();
        modalNotice('완료', '시험 데이터를 새로 심었어요 (회원 ' + (r.data && r.data.entries) + '명). 이제 관리자나 회원으로 들어가 보세요.');
        return toGuest();
      }).catch(function (e) { hide(); modalNotice('실패', (e && e.message) || String(e)); });
    }
    function toGuest() {
      clearAdminPin(); adminPrivateKey = null; isAdminUnlocked = false;
      currentUser = null; actingAs = null; actingResolved = false; saveSession();
      return dropToGuestAuth().then(switchDataForAuth).then(function () { activeTab = 'list'; paint(currentState); draw(); });
    }
    function asAdmin() {
      var hide = showBusy('베타 관리자로 들어가는 중…');
      currentUser = null; actingAs = null; actingResolved = false; saveSession();
      adminServerLogin(BETA_ADMIN_PW).then(switchDataForAuth).then(function (full) {
        return unlockAdminKey(BETA_ADMIN_PW, full.adminAuth).then(function (key) {
          adminPrivateKey = key; isAdminUnlocked = true; saveAdminPin(BETA_ADMIN_PW);
          return decryptAllAdminData(full);
        });
      }).then(function () { hide(); activeTab = 'admin'; paint(currentState); draw(); })
        .catch(function (e) { hide(); modalNotice('실패', (e && e.message) || String(e)); });
    }
    function asMember(id) {
      var hide = showBusy('시험 회원으로 들어가는 중…');
      clearAdminPin(); adminPrivateKey = null; isAdminUnlocked = false;
      memberServerLogin(id, BETA_PIN).then(switchDataForAuth).then(function () {
        var e = (currentState.entries || []).concat(currentState.pendingEntries || []).find(function (x) { return x.id === id; }) || {};
        currentUser = { id: id, nickname: e.nickname || '', pin: BETA_PIN };
        actingAs = null; actingResolved = false; formRole = e.isMatchmaker ? 'matchmaker' : 'self';
        saveSession(); hide(); activeTab = 'list'; paint(currentState); draw();
      }).catch(function (e) { hide(); modalNotice('실패', (e && e.message) || String(e)); });
    }
    /* 회원 목록: 손님 화면에선 공개 요약만 보이니, 한 번 받아 둔 목록을 기억 */
    var _known = [];
    function remember() {
      var all = ((currentState && currentState.entries) || []).concat((currentState && currentState.pendingEntries) || []);
      all = all.filter(function (e) { return e.id && e.nickname && !e.managedBy; });
      if (all.length) { _known = all.map(function (e) { return { id: e.id, nick: e.nickname, tag: e.isMatchmaker ? '주선자' : '' }; }); try { localStorage.setItem('betaKnown', JSON.stringify(_known)); } catch (x) {} }
      else { try { _known = JSON.parse(localStorage.getItem('betaKnown') || '[]'); } catch (x) {} }
    }
    var box = document.createElement('div');
    box.id = 'beta-panel';
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;font:12px/1.4 sans-serif;';
    var open = false;
    function who() {
      if (isAdminUnlocked) return '관리자';
      if (currentUser) return '회원 ' + (currentUser.nickname || '');
      return '손님';
    }
    function draw() {
      remember();
      if (!open) {
        box.innerHTML = '<button type="button" id="bp-open" style="background:#5b3df5;color:#fff;border:0;border-radius:999px;padding:6px 12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.25);">🧪 BETA · ' + escapeHtml(who()) + '</button>';
        return;
      }
      box.innerHTML = '<div style="background:#fff;border:2px solid #5b3df5;border-radius:12px;padding:10px;width:230px;box-shadow:0 4px 16px rgba(0,0,0,.25);color:#222;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><b style="color:#5b3df5;">🧪 베타 서버</b><button type="button" id="bp-close" style="border:0;background:none;font-size:16px;">×</button></div>' +
        '<div style="margin-bottom:6px;color:#555;">지금: <b>' + escapeHtml(who()) + '</b><br>가짜 데이터 — 실제 회원과 무관</div>' +
        '<div style="display:flex;gap:4px;margin-bottom:6px;"><button type="button" id="bp-admin" style="flex:1;">관리자로</button><button type="button" id="bp-guest" style="flex:1;">손님으로</button></div>' +
        '<div style="display:flex;gap:4px;margin-bottom:6px;"><select id="bp-mem" style="flex:1;min-width:0;">' +
          (_known.length ? _known.map(function (k) { return '<option value="' + escapeHtml(k.id) + '">' + escapeHtml(k.nick) + (k.tag ? ' (' + k.tag + ')' : '') + '</option>'; }).join('') : '<option value="">(관리자로 한 번 들어가면 목록이 생겨요)</option>') +
        '</select><button type="button" id="bp-mem-go">회원으로</button></div>' +
        '<button type="button" id="bp-seed" style="width:100%;">🌱 시험 데이터 다시 심기 (작게)</button>' +
        '<button type="button" id="bp-seed-tpl" style="width:100%;margin-top:4px;">🧬 운영 모양으로 심기</button>' +
        '</div>';
    }
    box.addEventListener('click', function (ev) {
      var id = ev.target && ev.target.id;
      if (id === 'bp-open') { open = true; draw(); }
      else if (id === 'bp-close') { open = false; draw(); }
      else if (id === 'bp-admin') asAdmin();
      else if (id === 'bp-guest') toGuest();
      else if (id === 'bp-mem-go') { var v = box.querySelector('#bp-mem').value; if (v) asMember(v); }
      else if (id === 'bp-seed-tpl') modalConfirm('운영 모양으로 심기', '베타 데이터를 모두 지우고, 운영과 같은 모양(인원·관계·시각)의 가짜 데이터로 바꿔요. 계속할까요?').then(function (ok) { if (ok) seedFromTemplate(); });
      else if (id === 'bp-seed') modalConfirm('시험 데이터 다시 심기', '베타 서버의 데이터를 모두 지우고 가짜 회원 28명을 새로 만들어요. 계속할까요?').then(function (ok) { if (ok) seed(); });
    });
    document.body.appendChild(box);
    draw();
    setInterval(function () { if (!open) draw(); }, 3000);
    window.__beta = { seed: seed, seedFromTemplate: seedFromTemplate, asAdmin: asAdmin, asMember: asMember, toGuest: toGuest, known: function () { remember(); return _known; } };
  })();
