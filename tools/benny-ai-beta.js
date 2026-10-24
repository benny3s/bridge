  /* ════ 🛠️ 베니브릿지 AI 자율 수리(Self-Healing) 파이프라인 (베타 전용) ════
     - 부가적인 문구 생성·테마 기능은 모두 제거하고, 오직 #1 「불편·오류 제보 → Argon 심사 → Opus/Argon 자율 수리」에만 집중합니다.
     - 모델 역할 분담:
       1) 접수 창구 (Groq Qwen3.8 / GPT-OSS): 0.4초 초고속 응대 + 현재 화면 맥락(탭·모달·해상도·콘솔 에러) 자동 캡처
       2) 진행 판단 (Argon — llm-bridge Gemini 구독 모델): 3단계 헌법에 따라 자율 수리 vs 허락 요청 판정
          - 🟢 Tier 1 (AUTO_FIX): 오타·문구·모바일 터치/여백·CSS 오류·JS 에러 방어 또는 베니 님(관리자) 직접 지시 → 즉시 수리 후 사후 보고
          - 🟡 Tier 2 (BETA_AND_ASK): 매칭 규칙·신청 한도·새 기능·DB/보안 변경 → 베타(beta/)에만 선반영 후 베니 님께 본서버 반영 허락 요청
          - 🔴 Tier 3 (REJECT): 보안 우회·장난성 요청 즉시 기각
       3) 실제 수리 (Claude Opus 5.5 / Argon): 코드 패치 생성 + vm.Script 문법 검증 + 실시간 CSS 핫픽스 프리뷰 반영 */
  (function bennyAiSelfHealer() {
    var HEAL_URLS = [
      'https://desktop-ijcbddr.tail4df4c9.ts.net:8443/api/bridge/heal',
      'http://127.0.0.1:8999/api/bridge/heal'
    ];
    var LIVE_HOTFIX_KEY = 'bennyAiLiveHotfixes';

    /* 이전에 저장됐던 테마/폰트 커스텀이 남아있다면 깔끔하게 초기화 (본연의 베니브릿지 디자인 유지) */
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
          /* 외부 모바일/LTE 접속 시 Firebase Cloud Function `aiConcierge` 호출 */
          if (typeof callFn === 'function') {
            var fnOp = payload.op === 'list' ? 'heal_list' : (payload.op === 'approve' ? 'heal_approve' : (payload.op === 'reject' ? 'heal_reject' : 'heal_submit'));
            return callFn('aiConcierge', Object.assign({}, payload, { op: fnOp })).then(function (r) {
              return (r && r.data) ? r.data : r;
            });
          }
          return Promise.reject(new Error('자율 수리 서버에 연결할 수 없어요.'));
        }
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var tm = ctl ? setTimeout(function () { ctl.abort(); }, 18000) : null;
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

    function openSelfHealModal() {
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      var me = (typeof currentState !== 'undefined' && typeof findMyEntry === 'function') ? findMyEntry(currentState) : null;
      var authorLabel = isAdm ? '관리자(베니)' : ((me && me.nickname) ? me.nickname : '회원/손님');
      var sctx = captureScreenContext();

      var ov = openModal(
        '<div style="text-align:left;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h3 style="margin:0;font-size:1.08rem;">🛠️ ' + (isAdm ? 'AI 자율 수리 지시 · 관제' : '불편·오류 제보 (AI 자율 수리)') + '</h3>' +
            '<button type="button" id="bai-heal-close" style="border:0;background:none;font-size:1.3rem;color:var(--muted);cursor:pointer;">×</button>' +
          '</div>' +
          (isAdm ? (
            '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
              '<button type="button" class="card-btn primary" id="bai-tab-submit" style="flex:1;padding:6px;">🛠️ 새 수리 지시·제보</button>' +
              '<button type="button" class="card-btn" id="bai-tab-list" style="flex:1;padding:6px;">📋 심사·허락 대기함</button>' +
            '</div>'
          ) : '') +
          '<div id="bai-pane-submit">' +
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
        var btnSubmit = ov.querySelector('#bai-tab-submit');
        var btnList = ov.querySelector('#bai-tab-list');
        var paneSubmit = ov.querySelector('#bai-pane-submit');
        var paneList = ov.querySelector('#bai-pane-list');

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

        btnSubmit.onclick = function () {
          btnSubmit.classList.add('primary');
          btnList.classList.remove('primary');
          paneSubmit.style.display = 'block';
          paneList.style.display = 'none';
        };
        btnList.onclick = function () {
          btnList.classList.add('primary');
          btnSubmit.classList.remove('primary');
          paneSubmit.style.display = 'none';
          paneList.style.display = 'block';
          loadTicketList();
        };
      }
    }

    function injectHeaderButton() {
      var row = document.querySelector('.admin-bar-row');
      if (!row) return;
      var existing = row.querySelector('#bai-self-heal-btn');
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      var label = isAdm ? '🛠️ AI 자율수리 · 관제' : '🛠️ 불편·오류 제보';
      if (existing) {
        if (existing.textContent !== label) existing.textContent = label;
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'bai-self-heal-btn';
      btn.className = 'admin-link bai-heal-btn';
      btn.textContent = label;
      btn.onclick = openSelfHealModal;
      row.insertBefore(btn, row.firstChild);
    }

    if (typeof paint === 'function') {
      var _origPaint = paint;
      paint = function () {
        var r = _origPaint.apply(this, arguments);
        try { injectHeaderButton(); } catch (e) {}
        return r;
      };
    }
    setTimeout(injectHeaderButton, 150);
  })();
