  /* ════ 🛠️ 베니브릿지 AI 자율 수리(Self-Healing) & 👑 AI 부관리자(Co-Admin) 파이프라인 (베타 전용) ════
     1) 🛠️ AI 자율 수리 (Self-Healing):
        - 접수 (Groq Qwen3.8 / GPT-OSS): 0.4초 응대 + 화면 맥락(탭·해상도·콘솔 에러) 자동 캡처
        - 심사 (Argon): 🟢 Tier 1 (오타·문구·터치/여백·CSS 오류·관리자 직접 지시 → 즉시 수리) / 🟡 Tier 2 (정책·한도·새 기능·DB/보안 → 베타 선반영 후 허락 요청) / 🔴 Tier 3 (기각)
        - 수리 (Claude Opus / Argon): 패치 생성 + vm.Script 문법 검증 + 실시간 CSS 프리뷰 반영
     2) 👑 AI 부관리자 (Co-Admin — 신청서 심사 · 프로필 변경 확인 · 정기 브리핑):
        - 신규 신청서(⏳ 승인 대기): ① 정면 얼굴 사진 여부(Vision AI 판독), ② 휴대폰 번호 010-4자리-4자리 정상 여부, ③ 자기소개·이상형 이상 유무 검사 → 모두 정상이면 승인, 미달이면 보완 사유와 함께 보류
        - 프로필 변경(📝 프로필 변경): 기존 승인 내용 대비 이상 변경(내용 삭제·욕설·비정상 번호 등)이 없으면 자동으로 '프로필 변경 확인 완료' 처리, 이상 징후 시 베니 님께 경고 보고 */
  (function bennyAiSelfHealer() {
    var HEAL_URLS = [
      'https://desktop-ijcbddr.tail4df4c9.ts.net:8443/api/bridge/heal',
      'http://127.0.0.1:8999/api/bridge/heal'
    ];
    var LIVE_HOTFIX_KEY = 'bennyAiLiveHotfixes';
    var AUTO_COADMIN_KEY = 'bennyAiAutoCoAdmin';

    /* 이전 테마/폰트 커스텀 흔적 초기화 */
    try {
      localStorage.removeItem('bennyAiTheme');
      localStorage.removeItem('bennyAiFont');
      localStorage.removeItem('bennyAiBubbleMuted');
      ['--paper', '--card', '--accent', '--accent-deep', '--accent-soft', '--ink', '--line'].forEach(function (k) {
        document.documentElement.style.removeProperty(k);
      });
      document.documentElement.style.removeProperty('font-size');
    } catch (e) {}

    /* 최근 JS 런타임 에러 자동 수집기 (최대 5건) */
    var _recentErrors = [];
    window.addEventListener('error', function (ev) {
      if (ev && ev.message) {
        _recentErrors.push(String(ev.message).slice(0, 140) + (ev.lineno ? ' (L' + ev.lineno + ')' : ''));
        if (_recentErrors.length > 5) _recentErrors.shift();
      }
    });

    /* 실시간 CSS 핫픽스 적용용 스타일 태그 */
    var liveStyle = document.createElement('style');
    liveStyle.id = 'bai-live-hotfix';
    document.head.appendChild(liveStyle);

    function applySavedHotfixes() {
      try {
        var saved = JSON.parse(localStorage.getItem(LIVE_HOTFIX_KEY) || '[]');
        if (Array.isArray(saved) && saved.length) {
          liveStyle.textContent = saved.join('\n');
        }
      } catch (e) {}
    }
    function appendLiveHotfix(cssText) {
      if (!cssText || !cssText.trim()) return;
      try {
        var saved = JSON.parse(localStorage.getItem(LIVE_HOTFIX_KEY) || '[]');
        if (!Array.isArray(saved)) saved = [];
        if (saved.indexOf(cssText.trim()) < 0) saved.push(cssText.trim());
        localStorage.setItem(LIVE_HOTFIX_KEY, JSON.stringify(saved.slice(-15)));
        liveStyle.textContent = saved.join('\n');
      } catch (e) {}
    }
    applySavedHotfixes();

    /* UI 전용 스타일 */
    var uiStyle = document.createElement('style');
    uiStyle.id = 'bai-healer-ui-style';
    uiStyle.textContent = [
      '.bai-heal-btn { background: rgba(192,138,52,0.16) !important; border-color: var(--gold, #C08A34) !important; color: var(--paper, #FBF3EE) !important; font-weight: 700 !important; opacity: 0.96 !important; }',
      '.bai-heal-btn:hover { background: var(--gold, #C08A34) !important; color: #1C1519 !important; }',
      '.bai-ctx-box { font-size: 0.76rem; color: var(--muted); background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 8px 11px; margin-bottom: 10px; line-height: 1.5; }',
      '.bai-ctx-box b { color: var(--ink); }',
      '.bai-tier-badge { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }',
      '.bai-tier-1 { background: #e6f4ea; color: #137333; border: 1px solid #81c995; }',
      '.bai-tier-2 { background: var(--gold-soft, #F1E2C4); color: #8a5a10; border: 1px solid var(--gold, #C08A34); }',
      '.bai-tier-3 { background: #fce8e6; color: #c5221f; border: 1px solid #f28b82; }',
      '.bai-tier-0 { background: #e8f0fe; color: #1967d2; border: 1px solid #8ab4f8; }',
      '.bai-step-card { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-top: 10px; font-size: 0.84rem; line-height: 1.55; }',
      '.bai-ticket-item { background: var(--paper); border: 1px solid var(--line); border-radius: 11px; padding: 10px 12px; margin-bottom: 8px; font-size: 0.82rem; }'
    ].join('\n');
    document.head.appendChild(uiStyle);

    function captureScreenContext() {
      var activeTabEl = document.querySelector('.tab-btn[aria-selected="true"]');
      var tabName = activeTabEl ? (activeTabEl.textContent || '').trim() : (typeof activeTab !== 'undefined' ? activeTab : 'home');
      var chatOpen = !!document.querySelector('.chat-screen');
      var role = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked)
        ? 'admin'
        : ((typeof currentUser !== 'undefined' && currentUser) ? 'member' : 'guest');
      return {
        tab: tabName,
        chat_open: chatOpen,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        touch: ('ontouchstart' in window),
        role: role,
        recent_errors: _recentErrors.slice(-3)
      };
    }

    function callHealBackend(payload) {
      function tryLocal(idx) {
        if (idx >= HEAL_URLS.length) {
          if (typeof callFn === 'function') {
            var fnOp = payload.op === 'list'
              ? 'heal_list'
              : (payload.op === 'approve' ? 'heal_approve' : (payload.op === 'reject' ? 'heal_reject' : (payload.op === 'coadmin_audit' ? 'coadmin_audit' : 'heal_submit')));
            return callFn('aiConcierge', Object.assign({}, payload, { op: fnOp })).then(function (r) {
              return (r && r.data) ? r.data : r;
            });
          }
          return Promise.reject(new Error('자율 수리 서버에 연결할 수 없어요.'));
        }
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var tm = ctl ? setTimeout(function () { ctl.abort(); }, 22000) : null;
        return fetch(HEAL_URLS[idx], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctl ? ctl.signal : undefined
        }).then(function (r) {
          if (tm) clearTimeout(tm);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (j) {
          if (j && j.ok) return j;
          throw new Error((j && j.error) || 'empty');
        }).catch(function () {
          if (tm) clearTimeout(tm);
          return tryLocal(idx + 1);
        });
      }
      return tryLocal(0);
    }

    function tierBadgeHtml(tier, decision) {
      if (decision === 'REJECT' || tier === 3) return '<span class="bai-tier-badge bai-tier-3">🔴 Tier 3 · 기각 (보안/정책 위배)</span>';
      if (decision === 'ADMIN_MSG_ONLY' || tier === 0) return '<span class="bai-tier-badge bai-tier-0">💬 일반 운영 문의 · 관리자 전달</span>';
      if (decision === 'AUTO_FIX' || tier === 1) return '<span class="bai-tier-badge bai-tier-1">🟢 Tier 1 · 즉시 자율 수리 (허락 불필요)</span>';
      return '<span class="bai-tier-badge bai-tier-2">🟡 Tier 2 · 베타 선반영 후 베니 님 허락 대기</span>';
    }

    /* ── 👑 AI 부관리자: 현재 대기 중인 신청서 & 프로필 변경 건 수집 및 자동 처분 실행 ── */
    function gatherCoAdminTargets() {
      var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
      var decContacts = (typeof decryptedContacts !== 'undefined' && decryptedContacts) ? decryptedContacts : {};
      var pendList = (st.pendingEntries || []).filter(function (p) { return !p.heldReason && !p.rejectedAt; });
      var editList = (st.entries || []).filter(function (e) { return e.editReviewAt && !e.deactivated; });

      /* 각 신청자의 첫 번째 사진(원본 또는 썸네일) 가져오기 */
      return Promise.all(pendList.slice(0, 12).map(function (p) {
        var pUrl = p.photoThumb || '';
        var pProm = (!p.isMatchmaker && typeof db !== 'undefined')
          ? db.collection('photos').doc(p.id).get().then(function (doc) {
              var arr = (doc && doc.exists && doc.data() && Array.isArray(doc.data().photos)) ? doc.data().photos : [];
              return arr[0] || pUrl;
            }).catch(function () { return pUrl; })
          : Promise.resolve(pUrl);
        return pProm.then(function (finalUrl) {
          return {
            id: p.id,
            nickname: p.nickname || '',
            isMatchmaker: !!p.isMatchmaker,
            gender: p.gender || '',
            birthYear: p.birthYear || '',
            region: p.region || '',
            workplace: p.workplace || '',
            intro: p.intro || '',
            idealType: p.idealType || '',
            dealbreaker: p.dealbreaker || '',
            photoCount: p.photoCount || (finalUrl ? 1 : 0),
            photoDataUrl: finalUrl || '',
            phone: decContacts[p.id] || ''
          };
        });
      })).then(function (pendingItems) {
        var editItems = editList.slice(0, 15).map(function (e) {
          return {
            id: e.id,
            nickname: e.nickname || '',
            phone: decContacts[e.id] || '',
            intro: e.intro || '',
            idealType: e.idealType || '',
            dealbreaker: e.dealbreaker || '',
            region: e.region || '',
            workplace: e.workplace || '',
            editChanges: Array.isArray(e.editChanges) ? e.editChanges : []
          };
        });
        var statsSummary = {
          pin_resets: ((st.pinResetReqs || []).filter(function (r) { return r.status === 'pending'; })).length,
          reported_chats: (typeof _reportedChats !== 'undefined' && _reportedChats) ? Object.keys(_reportedChats).length : 0,
          stale_requests: ((st.dateRequests || []).filter(function (r) { return !r.approved && !r.rejected && !r.held; })).length
        };
        return { pending_items: pendingItems, edit_items: editItems, stats_summary: statsSummary };
      });
    }

    /* AI 부관리자 판정 결과를 실제 Firestore 트랜잭션으로 집행 (승인 / 보류 / 프로필변경 확인완료) */
    function executeCoAdminDecisions(auditRes) {
      if (typeof db === 'undefined' || typeof stateRef === 'undefined') {
        return Promise.reject(new Error('데이터베이스 연결을 찾을 수 없어요.'));
      }
      var pendResults = (auditRes && auditRes.pending_results) || [];
      var editResults = (auditRes && auditRes.edit_results) || [];

      var approveMap = {}, holdMap = {}, confirmEditMap = {};
      pendResults.forEach(function (r) {
        if (r.action === 'APPROVE') approveMap[r.id] = r;
        else if (r.action === 'HOLD') holdMap[r.id] = r;
      });
      editResults.forEach(function (r) {
        if (r.action === 'CONFIRM_EDIT') confirmEditMap[r.id] = r;
      });

      var approveIds = Object.keys(approveMap);
      var holdIds = Object.keys(holdMap);
      var confirmIds = Object.keys(confirmEditMap);
      if (!approveIds.length && !holdIds.length && !confirmIds.length) {
        return Promise.resolve({ approved: 0, held: 0, confirmed: 0 });
      }

      var approvedList = [];
      return db.runTransaction(function (tx) {
        return tx.get(stateRef).then(function (doc) {
          var s = doc.data() || {};
          var pend = (s.pendingEntries || []).slice();
          var entries = (s.entries || []).slice();
          var nowIso = new Date().toISOString();

          /* 1) 신청서 승인 및 보류 반영 */
          var nextPend = [];
          pend.forEach(function (p) {
            if (approveMap[p.id]) {
              var entry = JSON.parse(JSON.stringify(p));
              var tempState = { entries: entries, pendingEntries: nextPend };
              if (!entry.serial && typeof nextSerial === 'function') entry.serial = nextSerial(tempState);
              delete entry.rejectedReason; delete entry.rejectedAt; delete entry.heldReason; delete entry.heldAt;
              if (!entry.lastSeenAt) entry.lastSeenAt = nowIso;
              entries.push(entry);
              approvedList.push(entry);
            } else if (holdMap[p.id]) {
              var heldCopy = JSON.parse(JSON.stringify(p));
              heldCopy.heldReason = holdMap[p.id].hold_reason || '프로필 사진 및 소개글 보완이 필요해요.';
              heldCopy.heldAt = nowIso;
              nextPend.push(heldCopy);
            } else {
              nextPend.push(p);
            }
          });

          /* 2) 프로필 변경 정상 건 확인 완료(editReviewAt, editChanges 제거) */
          entries = entries.map(function (e) {
            if (!confirmEditMap[e.id]) return e;
            var c = JSON.parse(JSON.stringify(e));
            delete c.editReviewAt;
            delete c.editChanges;
            return c;
          });

          tx.update(stateRef, { pendingEntries: nextPend, entries: entries });
        });
      }).then(function () {
        /* 환영 안내 메시지 및 활동 로그 기록 */
        approvedList.forEach(function (entry) {
          if (typeof appendLog === 'function') appendLog('admin', 'AI 부관리자', '신청 자동 승인 · ' + (entry.nickname || ''));
          var welcome = entry.isMatchmaker
            ? (typeof APPROVE_MSG_MM !== 'undefined' ? APPROVE_MSG_MM : '')
            : (typeof APPROVE_MSG_DEFAULT !== 'undefined' ? APPROVE_MSG_DEFAULT : '');
          if (welcome && typeof sendMessageTo === 'function') {
            sendMessageTo(entry.id, 'admin', welcome, '', { auto: true }).catch(function () {});
          }
        });
        holdIds.forEach(function (id) {
          if (typeof appendLog === 'function') appendLog('admin', 'AI 부관리자', '신청 보완 요청(보류) · ' + (holdMap[id].nickname || ''));
        });
        confirmIds.forEach(function (id) {
          if (typeof appendLog === 'function') appendLog('admin', 'AI 부관리자', '프로필 변경 확인 완료 · ' + (confirmEditMap[id].nickname || ''));
        });
        if (typeof refreshNow === 'function') return refreshNow();
      }).then(function () {
        return { approved: approveIds.length, held: holdIds.length, confirmed: confirmIds.length };
      });
    }

    function openSelfHealModal(initialTab) {
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      var me = (typeof currentState !== 'undefined' && typeof findMyEntry === 'function') ? findMyEntry(currentState) : null;
      var authorLabel = isAdm ? '관리자(베니)' : ((me && me.nickname) ? me.nickname : '회원/손님');
      var sctx = captureScreenContext();

      var ov = openModal(
        '<div style="text-align:left;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h3 style="margin:0;font-size:1.08rem;">' + (isAdm ? '👑 AI 부관리자 & 자율 수리 관제' : '🛠️ 불편·오류 제보 (AI 자율 수리)') + '</h3>' +
            '<button type="button" id="bai-heal-close" style="border:0;background:none;font-size:1.3rem;color:var(--muted);cursor:pointer;">×</button>' +
          '</div>' +
          (isAdm ? (
            '<div style="display:flex;gap:5px;margin-bottom:10px;">' +
              '<button type="button" class="card-btn primary" id="bai-tab-coadmin" style="flex:1.15;padding:6px 4px;font-size:0.78rem;">👑 AI 부관리자</button>' +
              '<button type="button" class="card-btn" id="bai-tab-submit" style="flex:1;padding:6px 4px;font-size:0.78rem;">🛠️ 자율수리 지시</button>' +
              '<button type="button" class="card-btn" id="bai-tab-list" style="flex:1;padding:6px 4px;font-size:0.78rem;">📋 허락 대기함</button>' +
            '</div>'
          ) : '') +
          '<div id="bai-pane-coadmin" style="display:' + (isAdm ? 'block' : 'none') + ';"></div>' +
          '<div id="bai-pane-submit" style="display:' + (isAdm ? 'none' : 'block') + ';">' +
            '<p class="modal-msg" style="margin-bottom:8px;">' +
              (isAdm
                ? '관리자 모드입니다. 고치고 싶은 UI·문구·버그를 적으시면 <b>Argon 심사 후 Opus/Argon이 즉시 자율 수리</b>합니다.'
                : '쓰시면서 안 눌리는 버튼, 어색한 문구, 불편한 점을 편하게 적어주세요. <b>Groq</b>가 즉시 접수하고 <b>Argon & Opus</b>가 수리합니다.') +
            '</p>' +
            '<div class="bai-ctx-box">' +
              '📡 <b>자동 첨부되는 화면 맥락</b>: 탭(<b>' + escapeHtml(sctx.tab) + '</b>) · 화면(<b>' + escapeHtml(sctx.viewport) + '</b>) · 신분(<b>' + escapeHtml(authorLabel) + '</b>)' +
              (sctx.recent_errors.length ? '<br>⚠️ 감지된 스크립트 오류: ' + escapeHtml(sctx.recent_errors.join(', ')) : '') +
            '</div>' +
            '<textarea class="modal-input" id="bai-heal-input" rows="3" maxlength="800" placeholder="' +
              (isAdm
                ? '예) 명단 카드에서 대화 신청 버튼 글자를 조금 더 크고 선명하게 키워줘 / 모바일에서 닫기 버튼 터치 영역 넓혀줘'
                : '예) 모바일에서 사진 닫기 버튼이 너무 작아서 잘 안 눌려요 / 신청서 안내 문구가 조금 헷갈려요') +
            '"></textarea>' +
            '<div class="modal-actions" style="margin-top:10px;">' +
              '<button type="button" class="card-btn" id="bai-heal-cancel">닫기</button>' +
              '<button type="button" class="card-btn primary" id="bai-heal-send">⚡ AI 수리팀에 전달하기</button>' +
            '</div>' +
            '<div id="bai-heal-result"></div>' +
          '</div>' +
          '<div id="bai-pane-list" style="display:none;"></div>' +
        '</div>'
      );
      ov.classList.add('wide-modal');

      var closeFn = function () { closeModal(ov); };
      ov.querySelector('#bai-heal-close').onclick = closeFn;
      ov.querySelector('#bai-heal-cancel').onclick = closeFn;
      ov.addEventListener('click', function (e) { if (e.target === ov) closeFn(); });

      var sendBtn = ov.querySelector('#bai-heal-send');
      var inputEl = ov.querySelector('#bai-heal-input');
      var resEl = ov.querySelector('#bai-heal-result');

      sendBtn.onclick = function () {
        var msg = (inputEl.value || '').trim();
        if (msg.length < 4) {
          resEl.innerHTML = '<div style="color:var(--accent);font-size:0.82rem;margin-top:6px;font-weight:700;">내용을 4자 이상 적어주세요.</div>';
          return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = '⚡ Groq 접수 & Argon 심사 중…';
        resEl.innerHTML =
          '<div class="bai-step-card">' +
            '<div>⏳ <b>1단계 (Groq)</b>: 화면 상태 캡처 및 접수 중…</div>' +
            '<div style="color:var(--muted);margin-top:4px;">⏳ <b>2단계 (Argon 심사관)</b>: 3단계 헌법에 따라 [즉시 자율 수리 vs 베타 선반영 후 허락 요청] 판정 중…</div>' +
          '</div>';

        callHealBackend({
          op: 'submit',
          message: msg,
          is_admin: isAdm,
          author: authorLabel,
          screen_context: sctx,
          judge_model: 'argon'
        }).then(function (r) {
          sendBtn.disabled = false;
          sendBtn.textContent = '⚡ AI 수리팀에 전달하기';
          var tk = r.ticket || {};
          if (tk.css_override && tk.decision !== 'REJECT') {
            appendLiveHotfix(tk.css_override);
          }
          resEl.innerHTML =
            '<div class="bai-step-card" style="border-color:var(--gold);">' +
              '<div style="margin-bottom:6px;">' + tierBadgeHtml(tk.tier, tk.decision) + '</div>' +
              '<div style="font-weight:700;color:var(--ink);margin-bottom:4px;">💬 ' + escapeHtml(tk.user_reply || '접수 완료되었습니다.') + '</div>' +
              '<div style="font-size:0.78rem;color:var(--muted);border-top:1px dashed var(--line);padding-top:6px;margin-top:6px;">' +
                '• <b>심사 모델</b>: ' + escapeHtml(tk.judge_via || 'Argon') + ' (' + ((tk.latency_ms || 400) / 1000).toFixed(1) + 's)<br>' +
                '• <b>판정 사유</b>: ' + escapeHtml(tk.reason || '-') + '<br>' +
                '• <b>배정 일꾼</b>: <b>' + escapeHtml((tk.worker || 'opus').toUpperCase()) + '</b>' +
                (tk.css_override ? '<br>✨ <b>실시간 패치</b>: 현재 화면에 즉시 반영되었습니다!' : '') +
              '</div>' +
            '</div>';
          inputEl.value = '';
        }).catch(function (err) {
          sendBtn.disabled = false;
          sendBtn.textContent = '⚡ AI 수리팀에 전달하기';
          resEl.innerHTML = '<div class="bai-step-card" style="color:var(--accent);">접수 중 오류가 발생했어요: ' + escapeHtml(err.message || String(err)) + '</div>';
        });
      };

      if (isAdm) {
        var btnCoAdmin = ov.querySelector('#bai-tab-coadmin');
        var btnSubmit = ov.querySelector('#bai-tab-submit');
        var btnList = ov.querySelector('#bai-tab-list');
        var paneCoAdmin = ov.querySelector('#bai-pane-coadmin');
        var paneSubmit = ov.querySelector('#bai-pane-submit');
        var paneList = ov.querySelector('#bai-pane-list');

        function renderCoAdminPane() {
          var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
          var pendCount = ((st.pendingEntries || []).filter(function (p) { return !p.heldReason && !p.rejectedAt; })).length;
          var editCount = ((st.entries || []).filter(function (e) { return e.editReviewAt && !e.deactivated; })).length;
          var autoOn = false;
          try { autoOn = localStorage.getItem(AUTO_COADMIN_KEY) === '1'; } catch (e) {}

          paneCoAdmin.innerHTML =
            '<div class="bai-ctx-box" style="margin-bottom:10px;">' +
              '👑 <b>AI 부관리자 심사 기준</b><br>' +
              '1. <b>신규 신청서 (대기 ' + pendCount + '건)</b>: ① 정면 얼굴 사진(Vision 판독) · ② <code>010-XXXX-XXXX</code> 정상 번호 · ③ 자기소개 적절성 확인 → <b>정상 시 승인 / 미달 시 사유 안내 후 보류</b><br>' +
              '2. <b>프로필 변경 (미검토 ' + editCount + '건)</b>: 기존 승인 내용 대비 이상 변경(내용 삭제·욕설·비정상 번호) 없으면 <b>자동 확인 완료</b>, 이상 시 베니 님께 경고 보고' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;padding:8px 11px;background:var(--paper);border:1px solid var(--gold);border-radius:10px;margin-bottom:10px;cursor:pointer;">' +
              '<input type="checkbox" id="bai-auto-coadmin-chk" ' + (autoOn ? 'checked' : '') + ' />' +
              '<span><b>자동 부관리자 모드 켜기</b> (관리자 접속 중 새 신청·프로필 변경 감지 시 자동 심사·승인·텔레그램 보고)</span>' +
            '</label>' +
            '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
              '<button type="button" class="card-btn primary" id="bai-run-audit" style="flex:1;padding:9px;">🔍 지금 심사 + 텔레그램 보고받기</button>' +
              '<button type="button" class="card-btn approve" id="bai-run-auto-exec" style="flex:1;padding:9px;">⚡ 심사 후 승인·확인 즉시 집행</button>' +
            '</div>' +
            '<div id="bai-coadmin-out"></div>';

          paneCoAdmin.querySelector('#bai-auto-coadmin-chk').onchange = function (e) {
            try {
              if (e.target.checked) localStorage.setItem(AUTO_COADMIN_KEY, '1');
              else localStorage.removeItem(AUTO_COADMIN_KEY);
            } catch (err) {}
          };

          var outBox = paneCoAdmin.querySelector('#bai-coadmin-out');

          function runAuditFlow(autoExecute) {
            outBox.innerHTML = '<div class="bai-step-card">⏳ <b>AI 부관리자(Vision + 텍스트 감사관)</b>가 신청서 사진·전화번호·자기소개 및 프로필 변경 전/후 내역을 정밀 점검하고 있어요…</div>';
            gatherCoAdminTargets().then(function (targets) {
              return callHealBackend({
                op: 'coadmin_audit',
                pending_items: targets.pending_items,
                edit_items: targets.edit_items,
                stats_summary: targets.stats_summary,
                send_report: true,
                force_telegram: true
              });
            }).then(function (res) {
              var pList = res.pending_results || [];
              var eList = res.edit_results || [];

              function renderResults(execSummary) {
                var html = '';
                if (execSummary) {
                  html += '<div class="bai-step-card" style="border-color:#137333;background:#e6f4ea;color:#137333;font-weight:700;margin-bottom:8px;">' +
                    '✅ AI 부관리자 집행 완료: 신청 자동 승인 ' + execSummary.approved + '건 · 보완 보류 ' + execSummary.held + '건 · 프로필 변경 확인 ' + execSummary.confirmed + '건 (텔레그램 브리핑 발송됨)' +
                  '</div>';
                } else {
                  html += '<div style="font-size:0.78rem;color:var(--gold);font-weight:700;margin-bottom:6px;">📨 베니 님 텔레그램으로 점검 브리핑 보고서를 전송했습니다.</div>';
                }

                if (!pList.length && !eList.length) {
                  html += '<div class="bai-step-card">현재 대기 중인 신규 신청서나 미검토 프로필 변경 건이 없습니다 ✨ (모두 깔끔하게 처리된 상태예요!)</div>';
                } else {
                  pList.forEach(function (p) {
                    var isOk = p.action === 'APPROVE';
                    html += '<div class="bai-ticket-item">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                        '<span class="bai-tier-badge ' + (isOk ? 'bai-tier-1' : 'bai-tier-2') + '">' + (isOk ? '🟢 신규 신청 · 승인 적합' : '🟡 신규 신청 · 보류 권장') + '</span>' +
                        '<b>' + escapeHtml(p.nickname) + '</b>' +
                      '</div>' +
                      '<div style="font-size:0.78rem;color:var(--ink);">' +
                        '• 📷 사진: ' + escapeHtml(p.photo_note || '-') + '<br>' +
                        '• 📱 번호: ' + escapeHtml(p.phone_note || '-') + '<br>' +
                        '• 📝 소개: ' + escapeHtml(p.text_note || '-') +
                      '</div>' +
                    '</div>';
                  });
                  eList.forEach(function (e) {
                    var isOk = e.action === 'CONFIRM_EDIT';
                    html += '<div class="bai-ticket-item">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                        '<span class="bai-tier-badge ' + (isOk ? 'bai-tier-1' : 'bai-tier-3') + '">' + (isOk ? '🟢 프로필 변경 · 이상 없음' : '🚨 프로필 변경 · 이상 감지') + '</span>' +
                        '<b>' + escapeHtml(e.nickname) + '</b>' +
                      '</div>' +
                      '<div style="font-size:0.78rem;color:var(--ink);">' + escapeHtml(e.reason || '') + '</div>' +
                    '</div>';
                  });
                  if (!autoExecute && (pList.length || eList.length)) {
                    html += '<button type="button" class="card-btn approve" id="bai-apply-decisions-now" style="width:100%;padding:9px;margin-top:6px;">⚡ 위 AI 부관리자 판정대로 일괄 승인·보류·확인 처리하기</button>';
                  }
                }
                outBox.innerHTML = html;
                var applyBtn = outBox.querySelector('#bai-apply-decisions-now');
                if (applyBtn) {
                  applyBtn.onclick = function () {
                    applyBtn.disabled = true;
                    applyBtn.textContent = '처리 중…';
                    executeCoAdminDecisions(res).then(function (summary) {
                      renderResults(summary);
                    }).catch(function (err) {
                      modalNotice('오류', '처리 실패: ' + (err.message || err));
                    });
                  };
                }
              }

              if (autoExecute) {
                return executeCoAdminDecisions(res).then(function (summary) {
                  renderResults(summary);
                });
              } else {
                renderResults(null);
              }
            }).catch(function (err) {
              outBox.innerHTML = '<div class="bai-step-card" style="color:var(--accent);">점검 중 오류: ' + escapeHtml(err.message || String(err)) + '</div>';
            });
          }

          paneCoAdmin.querySelector('#bai-run-audit').onclick = function () { runAuditFlow(false); };
          paneCoAdmin.querySelector('#bai-run-auto-exec').onclick = function () { runAuditFlow(true); };
        }

        function loadTicketList() {
          paneList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.85rem;">티켓 목록을 불러오는 중…</div>';
          callHealBackend({ op: 'list' }).then(function (r) {
            var list = r.tickets || [];
            if (!list.length) {
              paneList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.85rem;">아직 접수된 자율 수리 티켓이 없어요.</div>';
              return;
            }
            paneList.innerHTML = list.map(function (t) {
              var needApprove = (t.decision === 'BETA_AND_ASK' && t.status !== 'approved_live' && t.status !== 'rejected');
              return '<div class="bai-ticket-item" data-tid="' + escapeHtml(t.id) + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;">' +
                  tierBadgeHtml(t.tier, t.decision) +
                  '<span style="font-size:0.72rem;color:var(--muted);">' + escapeHtml((t.created_at || '').slice(5, 16).replace('T', ' ')) + ' · ' + escapeHtml(t.author || '') + '</span>' +
                '</div>' +
                '<div style="font-weight:700;color:var(--ink);">' + escapeHtml(t.title || t.message) + '</div>' +
                '<div style="color:var(--muted);font-size:0.78rem;margin-top:2px;">원문: ' + escapeHtml(t.message || '') + '</div>' +
                '<div style="font-size:0.75rem;color:var(--ink);margin-top:4px;background:var(--card);padding:6px 8px;border-radius:7px;border:1px solid var(--line);">' +
                  '🧠 <b>판정</b>: ' + escapeHtml(t.reason || '-') + ' (일꾼: <b>' + escapeHtml(t.used_worker || t.worker || 'opus') + '</b>)<br>' +
                  '🛠️ <b>상태</b>: ' + escapeHtml(t.heal_log || t.status || '-') +
                '</div>' +
                (needApprove ? (
                  '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;">' +
                    '<button type="button" class="card-btn" data-reject-id="' + escapeHtml(t.id) + '" style="padding:4px 10px;font-size:0.76rem;">↩️ 기각</button>' +
                    '<button type="button" class="card-btn approve" data-approve-id="' + escapeHtml(t.id) + '" style="padding:4px 12px;font-size:0.76rem;">✅ 본서버 반영 허락</button>' +
                  '</div>'
                ) : '') +
              '</div>';
            }).join('');

            Array.prototype.forEach.call(paneList.querySelectorAll('[data-approve-id]'), function (b) {
              b.onclick = function () {
                var id = b.getAttribute('data-approve-id');
                b.disabled = true;
                callHealBackend({ op: 'approve', id: id }).then(loadTicketList);
              };
            });
            Array.prototype.forEach.call(paneList.querySelectorAll('[data-reject-id]'), function (b) {
              b.onclick = function () {
                var id = b.getAttribute('data-reject-id');
                b.disabled = true;
                callHealBackend({ op: 'reject', id: id }).then(loadTicketList);
              };
            });
          }).catch(function (err) {
            paneList.innerHTML = '<div style="padding:14px;color:var(--accent);font-size:0.82rem;">목록 로드 실패: ' + escapeHtml(err.message || String(err)) + '</div>';
          });
        }

        function switchAdminModalTab(which) {
          [btnCoAdmin, btnSubmit, btnList].forEach(function (b) { b.classList.remove('primary'); });
          paneCoAdmin.style.display = 'none';
          paneSubmit.style.display = 'none';
          paneList.style.display = 'none';
          if (which === 'coadmin') {
            btnCoAdmin.classList.add('primary');
            paneCoAdmin.style.display = 'block';
            renderCoAdminPane();
          } else if (which === 'list') {
            btnList.classList.add('primary');
            paneList.style.display = 'block';
            loadTicketList();
          } else {
            btnSubmit.classList.add('primary');
            paneSubmit.style.display = 'block';
          }
        }

        btnCoAdmin.onclick = function () { switchAdminModalTab('coadmin'); };
        btnSubmit.onclick = function () { switchAdminModalTab('submit'); };
        btnList.onclick = function () { switchAdminModalTab('list'); };
        switchAdminModalTab(initialTab || 'coadmin');
      }
    }

    /* 자동 부관리자 모드 ON 일 때: 미처리 신청서·프로필 변경이 있으면 중복 없이 자동 심사·집행 */
    var _autoProcessedIds = {};
    var _autoRunning = false;
    function maybeRunAutoCoAdmin() {
      if (_autoRunning) return;
      if (typeof isAdminUnlocked === 'undefined' || !isAdminUnlocked) return;
      var autoOn = false;
      try { autoOn = localStorage.getItem(AUTO_COADMIN_KEY) === '1'; } catch (e) {}
      if (!autoOn) return;

      var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
      var pend = (st.pendingEntries || []).filter(function (p) { return !p.heldReason && !p.rejectedAt && !_autoProcessedIds['p:' + p.id]; });
      var edits = (st.entries || []).filter(function (e) { return e.editReviewAt && !e.deactivated && !_autoProcessedIds['e:' + e.id + ':' + e.editReviewAt]; });
      if (!pend.length && !edits.length) return;

      _autoRunning = true;
      pend.forEach(function (p) { _autoProcessedIds['p:' + p.id] = true; });
      edits.forEach(function (e) { _autoProcessedIds['e:' + e.id + ':' + e.editReviewAt] = true; });

      gatherCoAdminTargets().then(function (targets) {
        return callHealBackend({
          op: 'coadmin_audit',
          pending_items: targets.pending_items,
          edit_items: targets.edit_items,
          stats_summary: targets.stats_summary,
          send_report: true
        });
      }).then(function (res) {
        return executeCoAdminDecisions(res);
      }).catch(function () {}).then(function () {
        _autoRunning = false;
      });
    }

    function injectHeaderButton() {
      var row = document.querySelector('.admin-bar-row');
      if (!row) return;
      var existing = row.querySelector('#bai-self-heal-btn');
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      var label = isAdm ? '👑 AI 부관리자 · 자율수리' : '🛠️ 불편·오류 제보';
      if (existing) {
        if (existing.textContent !== label) existing.textContent = label;
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'bai-self-heal-btn';
      btn.className = 'admin-link bai-heal-btn';
      btn.textContent = label;
      btn.onclick = function () { openSelfHealModal(isAdm ? 'coadmin' : 'submit'); };
      row.insertBefore(btn, row.firstChild);
    }

    if (typeof paint === 'function') {
      var _origPaint = paint;
      paint = function () {
        var r = _origPaint.apply(this, arguments);
        try {
          injectHeaderButton();
          setTimeout(maybeRunAutoCoAdmin, 600);
        } catch (e) {}
        return r;
      };
    }
    setTimeout(injectHeaderButton, 150);
  })();
