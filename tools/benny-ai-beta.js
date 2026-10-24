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
      '.bai-tier-badge { display: inline-block; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }',
      '.bai-tier-1 { background: #e6f4ea; color: #137333; border: 1px solid #81c995; }',
      '.bai-tier-2 { background: var(--gold-soft, #F1E2C4); color: #8a5a10; border: 1px solid var(--gold, #C08A34); }',
      '.bai-tier-3 { background: #fce8e6; color: #c5221f; border: 1px solid #f28b82; }',
      '.bai-tier-0 { background: #e8f0fe; color: #1967d2; border: 1px solid #8ab4f8; }',
      '.bai-step-card { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-top: 10px; font-size: 0.84rem; line-height: 1.55; }',
      '.bai-ticket-item { background: var(--paper); border: 1px solid var(--line); border-radius: 11px; padding: 10px 12px; margin-bottom: 8px; font-size: 0.82rem; }',
      '.bai-chat-log { height: 50vh; max-height: 410px; min-height: 250px; overflow-y: auto; padding: 10px 6px; background: var(--paper); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; gap: 10px; }',
      '.bai-msg-row { display: flex; align-items: flex-start; gap: 8px; }',
      '.bai-msg-row.mine { justify-content: flex-end; }',
      '.bai-av { width: 28px; height: 28px; border-radius: 50%; background: var(--gold-soft, #F1E2C4); border: 1px solid var(--gold, #C08A34); display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; }',
      '.bai-bubble { max-width: 82%; padding: 9px 13px; border-radius: 15px; font-size: 0.85rem; line-height: 1.5; word-break: break-word; background: var(--card, #fff); color: var(--ink); border: 1px solid var(--line); box-shadow: 0 1px 2px rgba(0,0,0,0.03); }',
      '.bai-msg-row.mine .bai-bubble { background: var(--accent, #7A283B); color: #fff; border-color: var(--accent, #7A283B); border-bottom-right-radius: 4px; }',
      '.bai-msg-row.ai .bai-bubble { border-top-left-radius: 4px; }',
      '.bai-ex-list { display: flex; flex-wrap: wrap; gap: 6px; margin-left: 36px; margin-top: -2px; }',
      '.bai-ex-chip { background: var(--card, #fff); border: 1px solid var(--line); color: var(--ink); border-radius: 999px; padding: 5px 11px; font-size: 0.76rem; cursor: pointer; transition: all 0.15s; }',
      '.bai-ex-chip:hover { border-color: var(--gold, #C08A34); background: var(--gold-soft, #F1E2C4); }',
      '.bai-chat-bar { display: flex; gap: 6px; margin-top: 8px; align-items: center; }',
      '.bai-chat-input { flex: 1; margin: 0 !important; border-radius: 999px !important; padding: 9px 14px !important; font-size: 0.86rem !important; }',
      '.bai-chat-send { border-radius: 999px !important; padding: 9px 16px !important; font-weight: 700 !important; flex-shrink: 0; }',
      '.bai-inline-act { display: inline-flex; align-items: center; gap: 4px; margin-top: 7px; padding: 5px 11px; border-radius: 8px; font-size: 0.76rem; font-weight: 700; cursor: pointer; border: 1px solid var(--gold, #C08A34); background: var(--gold-soft, #F1E2C4); color: var(--ink); }'
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

    /* 일반 문의(ADMIN_MSG_ONLY)일 때 기존 관리자 Q&A 메시지함(messages)으로 자동 전달 */
    function forwardToAdminQnaInbox(msgText, guestName, guestPhone) {
      try {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
          var p = (typeof dataMode !== 'undefined' && dataMode === 'full' && typeof sendMessageTo === 'function')
            ? sendMessageTo(currentUser.id, 'user', msgText)
            : (typeof callFn === 'function' ? callFn('applicantAction', { op: 'message', text: msgText }) : Promise.resolve());
          return Promise.resolve(p).then(function () {
            if (typeof appendLog === 'function') appendLog('message', currentUser.nickname || '회원', '관리자에게 메시지 (AI 도우미)');
            return { forwarded: true, mode: 'member' };
          }).catch(function () { return { forwarded: false }; });
        }
        /* 비로그인 손님: 이름·전화번호가 있으면 암호화하여 게스트 문의로 전달 */
        var cleanPhone = String(guestPhone || '').replace(/[^0-9]/g, '');
        var cleanName = String(guestName || '').trim();
        if (cleanName && /^01[0-9]{8,9}$/.test(cleanPhone) && typeof encryptForAdmin === 'function' && typeof callFn === 'function') {
          var pubJwk = (typeof currentState !== 'undefined' && currentState && currentState.adminAuth) ? currentState.adminAuth.publicKeyJwk : null;
          if (pubJwk) {
            return encryptForAdmin(pubJwk, cleanPhone).then(function (phoneEnc) {
              return callFn('applicantAction', { op: 'guestMessage', name: cleanName, text: msgText, phoneEnc: phoneEnc });
            }).then(function () {
              if (typeof appendLog === 'function') appendLog('message', cleanName + ' (비로그인)', '관리자에게 문의 (AI 도우미)');
              try { if (typeof notifyAdmin === 'function') notifyAdmin('💬 비로그인 문의', cleanName + ': ' + msgText.slice(0, 40)); } catch (e) {}
              return { forwarded: true, mode: 'guest' };
            }).catch(function () { return { forwarded: false }; });
          }
        }
      } catch (e) {}
      return Promise.resolve({ forwarded: false });
    }

    var _chatHistory = [];

    function openSelfHealModal(initialTab) {
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      var hasUser = (typeof currentUser !== 'undefined' && currentUser && currentUser.id);
      var me = (typeof currentState !== 'undefined' && typeof findMyEntry === 'function') ? findMyEntry(currentState) : null;
      var authorLabel = isAdm ? '관리자(베니)' : ((me && me.nickname) ? me.nickname : (hasUser && currentUser.nickname ? currentUser.nickname : '손님'));
      var sctx = captureScreenContext();

      var examples = isAdm ? [
        '명단 카드의 대화 신청 버튼을 더 눈에 띄게 해줘',
        '모바일에서 상단 버튼 여백을 조금 더 넓혀줘'
      ] : [
        '사진·대화 신청은 하루 몇 번 돼요?',
        '잠시 쉬거나 PIN을 바꾸고 싶어요',
        '화면이나 버튼이 불편한 곳이 있어요',
        '관리자님께 문의할 게 있어요'
      ];

      var exHtml = '<div class="bai-ex-list" id="bai-ex-box">' +
        examples.map(function (q) {
          return '<button type="button" class="bai-ex-chip" data-ex="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
        }).join('') +
      '</div>';

      var greetingText = isAdm
        ? '베니 님, 수정할 화면·문구나 지시할 내용을 편하게 말씀해 주세요!'
        : '안녕하세요! 궁금한 점이나 불편한 화면, 관리자에게 전할 말을 대화로 편하게 남겨주세요 😊';

      var ov = openModal(
        '<div style="text-align:left;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h3 style="margin:0;font-size:1.05rem;">' + (isAdm ? '👑 AI 부관리자' : '✨ AI 도우미') + '</h3>' +
            '<button type="button" id="bai-heal-close" style="border:0;background:none;font-size:1.3rem;color:var(--muted);cursor:pointer;line-height:1;">×</button>' +
          '</div>' +
          (isAdm ? (
            '<div style="display:flex;gap:5px;margin-bottom:10px;">' +
              '<button type="button" class="card-btn primary" id="bai-tab-coadmin" style="flex:1.15;padding:6px 4px;font-size:0.78rem;">👑 부관리자</button>' +
              '<button type="button" class="card-btn" id="bai-tab-submit" style="flex:1;padding:6px 4px;font-size:0.78rem;">💬 대화·수리</button>' +
              '<button type="button" class="card-btn" id="bai-tab-list" style="flex:1;padding:6px 4px;font-size:0.78rem;">📋 대기함</button>' +
            '</div>'
          ) : '') +
          '<div id="bai-pane-coadmin" style="display:' + (isAdm ? 'block' : 'none') + ';"></div>' +
          '<div id="bai-pane-submit" style="display:' + (isAdm ? 'none' : 'block') + ';">' +
            '<div class="bai-chat-log" id="bai-chat-log">' +
              '<div class="bai-msg-row ai">' +
                '<div class="bai-av">✨</div>' +
                '<div class="bai-bubble">' + escapeHtml(greetingText) + '</div>' +
              '</div>' +
              exHtml +
            '</div>' +
            '<div class="bai-chat-bar">' +
              '<input type="text" class="modal-input bai-chat-input" id="bai-heal-input" maxlength="600" placeholder="메시지를 입력하세요…" autocomplete="off" />' +
              '<button type="button" class="card-btn primary bai-chat-send" id="bai-heal-send">전송</button>' +
            '</div>' +
          '</div>' +
          '<div id="bai-pane-list" style="display:none;"></div>' +
        '</div>'
      );
      ov.classList.add('wide-modal');

      var closeFn = function () {
        closeModal(ov);
        if (typeof schedulePaint === 'function') schedulePaint();
      };
      ov.querySelector('#bai-heal-close').onclick = closeFn;
      ov.addEventListener('click', function (e) {
        if (e.target === ov) closeFn();
      });

      var chatLog = ov.querySelector('#bai-chat-log');
      var sendBtn = ov.querySelector('#bai-heal-send');
      var inputEl = ov.querySelector('#bai-heal-input');

      function scrollBottom() {
        try { chatLog.scrollTop = chatLog.scrollHeight; } catch (e) {}
      }

      /* 말풍선 안의 원클릭 기능 칩 생성 (회원이 물어봤을 때만 노출) */
      function buildActionChipHtml(chipType) {
        if (!chipType) return '';
        var myId = (me && me.id) ? escapeHtml(me.id) : (hasUser ? escapeHtml(currentUser.id) : '');
        if (chipType === 'deactivate' && myId) {
          return '<div><button type="button" class="bai-inline-act" data-action="deactivate" data-id="' + myId + '">💤 잠시 쉬기 실행</button></div>';
        }
        if (chipType === 'delete' && myId) {
          return '<div><button type="button" class="bai-inline-act" data-action="delete" data-id="' + myId + '">🗑 탈퇴 신청하기</button></div>';
        }
        if (chipType === 'pin' && myId) {
          return '<div><button type="button" class="bai-inline-act" id="change-my-pin">🔑 PIN 변경하기</button></div>';
        }
        if (chipType === 'kakao') {
          return '<div><button type="button" class="bai-inline-act" data-kakao="1" style="background:#FEE500;border-color:#FEE500;color:#3C1E1E;">💬 카카오톡 문의 열기</button></div>';
        }
        return '';
      }

      /* 기존 대화 내역이 이번 세션에 있으면 복원 */
      function appendBubble(role, htmlContent) {
        var row = document.createElement('div');
        row.className = 'bai-msg-row ' + (role === 'mine' ? 'mine' : 'ai');
        if (role === 'mine') {
          row.innerHTML = '<div class="bai-bubble">' + htmlContent + '</div>';
        } else {
          row.innerHTML = '<div class="bai-av">✨</div><div class="bai-bubble">' + htmlContent + '</div>';
        }
        chatLog.appendChild(row);
        scrollBottom();
        return row;
      }

      chatLog.addEventListener('click', function (e) {
        var exBtn = e.target.closest ? e.target.closest('.bai-ex-chip') : null;
        if (exBtn) {
          var q = exBtn.getAttribute('data-ex') || '';
          if (q) sendChatMessage(q);
          return;
        }
        var actBtn = e.target.closest ? e.target.closest('.bai-inline-act') : null;
        if (actBtn && !actBtn.hasAttribute('data-kakao')) {
          setTimeout(closeFn, 60);
        }
      });

      function sendChatMessage(rawText) {
        var msg = String(rawText != null ? rawText : (inputEl.value || '')).trim();
        if (!msg) return;
        inputEl.value = '';
        var exBox = ov.querySelector('#bai-ex-box');
        if (exBox) exBox.style.display = 'none';

        appendBubble('mine', escapeHtml(msg));
        _chatHistory.push({ role: 'user', text: msg });

        sendBtn.disabled = true;
        var loadingRow = appendBubble('ai', '<span style="color:var(--muted);">생각 중…</span>');
        var bubbleEl = loadingRow.querySelector('.bai-bubble');

        callHealBackend({
          op: 'submit',
          message: msg,
          history: _chatHistory.slice(-6),
          is_admin: isAdm,
          author: authorLabel,
          screen_context: sctx
        }).then(function (r) {
          var tk = r.ticket || {};
          var shouldForwardQna = (!isAdm && (tk.forward_admin || tk.decision === 'BETA_AND_ASK'));
          var qnaPromise = shouldForwardQna ? forwardToAdminQnaInbox(msg, '', '') : Promise.resolve({ forwarded: false });

          return qnaPromise.then(function (qnaRes) {
            sendBtn.disabled = false;
            if (tk.css_override && tk.decision !== 'REJECT') {
              appendLiveHotfix(tk.css_override);
            }
            var replyText = tk.user_reply || '말씀해 주셔서 감사합니다 😊';
            _chatHistory.push({ role: 'ai', text: replyText });

            var statusPill = '';
            if (tk.decision === 'AUTO_FIX') {
              statusPill = '<div style="margin-top:6px;"><span class="bai-tier-badge bai-tier-1">🛠️ 실시간 수리 반영됨</span></div>';
            } else if (tk.decision === 'BETA_AND_ASK') {
              statusPill = '<div style="margin-top:6px;"><span class="bai-tier-badge bai-tier-2">🛠️ 베타 수리 접수 · 관리자 확인 대기</span></div>';
            } else if (qnaRes && qnaRes.forwarded) {
              statusPill = '<div style="margin-top:6px;"><span class="bai-tier-badge bai-tier-0">📨 관리자에게 전달 완료</span></div>';
            } else if (shouldForwardQna && !hasUser) {
              /* 비로그인 손님이 관리자에게 문의 남길 때만 말풍선 안에 미니 연락처 칸 표시 */
              statusPill =
                '<div class="bai-guest-mini" style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);font-size:0.76rem;">' +
                  '<div style="color:var(--muted);margin-bottom:4px;">답변 받으실 이름과 연락처를 남겨주시면 관리자에게 바로 전달돼요:</div>' +
                  '<div style="display:flex;gap:4px;">' +
                    '<input type="text" class="modal-input bai-gm-name" placeholder="이름" style="width:70px;margin:0;padding:5px 7px;font-size:0.75rem;" />' +
                    '<input type="tel" class="modal-input bai-gm-phone" placeholder="01012345678" style="flex:1;margin:0;padding:5px 7px;font-size:0.75rem;" />' +
                    '<button type="button" class="card-btn primary bai-gm-send" style="padding:5px 9px;font-size:0.75rem;">전달</button>' +
                  '</div>' +
                '</div>';
            }

            bubbleEl.innerHTML =
              '<div style="white-space:pre-wrap;">' + escapeHtml(replyText) + '</div>' +
              buildActionChipHtml(tk.action_chip) +
              statusPill;

            var gmBtn = bubbleEl.querySelector('.bai-gm-send');
            if (gmBtn) {
              gmBtn.onclick = function () {
                var gn = (bubbleEl.querySelector('.bai-gm-name').value || '').trim();
                var gp = (bubbleEl.querySelector('.bai-gm-phone').value || '').trim();
                if (!gn || !gp) return;
                gmBtn.disabled = true;
                forwardToAdminQnaInbox(msg, gn, gp).then(function (gr) {
                  var mini = bubbleEl.querySelector('.bai-guest-mini');
                  if (mini) {
                    mini.innerHTML = gr.forwarded
                      ? '<span class="bai-tier-badge bai-tier-0">📨 관리자에게 연락처와 함께 전달되었어요!</span>'
                      : '<span style="color:var(--accent);">전달 실패 (연락처 형식을 확인해 주세요)</span>';
                  }
                });
              };
            }
            scrollBottom();
            inputEl.focus();
          });
        }).catch(function (err) {
          sendBtn.disabled = false;
          bubbleEl.innerHTML = '<span style="color:var(--accent);">잠시 연결이 지연되었어요. 다시 한 번 말씀해 주세요 🙏 (' + escapeHtml(err.message || String(err)) + ')</span>';
          scrollBottom();
        });
      }

      sendBtn.onclick = function () { sendChatMessage(); };
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });

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
      var fbBtn = document.querySelector('#feedback-btn');
      if (!fbBtn) return;
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
      var badgeCount = 0;
      if (isAdm) {
        var pendC = ((st.pendingEntries || []).filter(function (p) { return !p.heldReason && !p.rejectedAt; })).length;
        var editC = ((st.entries || []).filter(function (e) { return e.editReviewAt && !e.deactivated; })).length;
        badgeCount = pendC + editC;
      }
      var label = isAdm
        ? ('👑 AI 부관리자' + (badgeCount > 0 ? ' (' + badgeCount + ')' : ''))
        : '✨ AI 도우미';

      fbBtn.removeAttribute('style');
      fbBtn.className = 'admin-link bai-heal-btn';
      if (fbBtn.textContent !== label) fbBtn.textContent = label;
    }

    /* 상단 #feedback-btn (기존 💬 Q&A 자리) 클릭을 가로채어 통합 AI 도우미·문의 모달 실행 */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('#feedback-btn') : null;
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      openSelfHealModal(isAdm ? 'coadmin' : 'submit');
    }, true);

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
