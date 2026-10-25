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
    function isSafeCssHotfix(cssText) {
      var raw = String(cssText || '').trim();
      if (!raw) return false;
      var low = raw.toLowerCase();
      if (/<\/style|<script|javascript:|expression\s*\(|@import|url\s*\(/.test(low)) return false;
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      if (!isAdm) {
        if (/filter\s*:|backdrop-filter|-webkit-filter|blur\s*\(/.test(low)) return false;
        if (/pointer-events\s*:/.test(low)) return false;
        if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(\.[0-5])?\b/.test(low)) return false;
        if (/\.admin|#admin|\[hidden\]|\.pf-photo|\.blur/.test(low)) return false;
        if (/content\s*:|position\s*:\s*(fixed|absolute)|z-index\s*:\s*\d{4,}/.test(low)) return false;
      }
      return true;
    }
    function appendLiveHotfix(cssText) {
      if (!isSafeCssHotfix(cssText)) return;
      try {
        var saved = JSON.parse(localStorage.getItem(LIVE_HOTFIX_KEY) || '[]').filter(isSafeCssHotfix);
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

    var _localDeadUntil = 0;

    function matchInstantFaq(rawMsg) {
      var s = String(rawMsg || '').replace(/[\s?.!~·ㆍ,]+/g, '').toLowerCase();
      if (s === '사진대화신청은하루몇번돼요' || s === '사진대화신청은하루몇번되나요' || s === '하루몇번신청돼요') {
        return {
          tier: 0,
          decision: 'CHAT_CONTINUE',
          action_chip: '',
          title: '사진·대화 신청 한도 안내',
          user_reply: '사진 요청과 대화 신청은 각각 하루 최대 3번까지 신청하실 수 있어요! 매일 자정(00:00)에 다시 3건으로 초기화됩니다 😊'
        };
      }
      if (s === '잠시쉬거나pin을바꾸고싶어요' || s === '잠시쉬고싶어요' || s === '휴면하고싶어요' || s === 'pin바꾸고싶어요' || s === '비밀번호바꾸고싶어요') {
        var chip = (s.indexOf('pin') >= 0 || s.indexOf('비밀번호') >= 0) && s.indexOf('쉬') < 0 ? 'pin' : 'deactivate';
        return {
          tier: 0,
          decision: 'CHAT_CONTINUE',
          action_chip: chip,
          title: '휴면 및 PIN 변경 안내',
          user_reply: '잠시 쉬기(프로필 비노출)나 PIN 변경은 [내 공간] 탭 하단이나 아래 바로가기 버튼으로 즉시 설정하실 수 있어요 😊'
        };
      }
      if (s.indexOf('친구에게이사이트소개') >= 0 || s.indexOf('주변친구에게') >= 0 || s.indexOf('친구소개') >= 0 || s.indexOf('사이트소개') >= 0 || s.indexOf('친구초대') >= 0 || s.indexOf('공유하고싶') >= 0) {
        return {
          tier: 0,
          decision: 'CHAT_CONTINUE',
          action_chip: 'share_invite',
          title: '주변 친구 초대 & 카톡 소개 문구',
          user_reply: '와, 주변의 좋은 분께 베니브릿지를 소개해주신다니 정말 감사해요! 💕\n광고 느낌 없이 카톡에 바로 복사해서 보낼 수 있는 상황별 추천 문구 3가지를 준비했어요. 아래에서 마음에 드는 문구를 골라 복사·공유해 보세요 😊'
        };
      }
      if (s.indexOf('첫인사뭐라고') >= 0 || s.indexOf('매칭된분께첫인사') >= 0 || s.indexOf('첫인사추천') >= 0 || s.indexOf('아이스브레이커') >= 0 || s.indexOf('첫마디') >= 0) {
        return {
          tier: 0,
          decision: 'CHAT_CONTINUE',
          action_chip: 'icebreaker',
          title: '매칭 후 센스 있는 첫인사 코치',
          user_reply: '연결된 분께 첫 마디를 건네는 순간이 가장 설레고도 긴장되죠 😊\n상대방이 부담 없이 기분 좋게 답장할 수 있는 맞춤형 첫인사 문구를 아래에 준비했어요! 눌러서 복사한 뒤 대화방에 바로 보내보세요 💬'
        };
      }
      if (s === '화면이나버튼이불편한곳이있어요' || s === '화면이불편하거나관리자님께문의할래요' || s === '화면이불편해요' || s === '버튼이불편해요' || s === '오류가있어요') {
        return {
          tier: 0,
          decision: 'CHAT_CONTINUE',
          action_chip: '',
          title: '불편 사항 및 관리자 문의 확인',
          user_reply: '어느 화면(예: 명단, 내 공간, 신청서)이 불편하셨는지, 혹은 관리자님께 전하고 싶은 말씀이 무엇인지 편하게 적어주시면 바로 도와드릴게요 😊'
        };
      }
      if (s === '관리자님께문의할게있어요' || s === '관리자한테메세지보내고싶어' || s === '관리자한테메시지보내고싶어' || s === '관리자에게메시지보내고싶어') {
        return {
          tier: 0,
          decision: 'CHAT_CONTINUE',
          action_chip: '',
          title: '관리자 메시지 내용 확인',
          user_reply: '네! 제가 관리자님께 바로 메시지를 전달해 드릴 수 있어요 😊 어떤 내용을 전해드릴까요? 편하게 말씀해 주세요!'
        };
      }
      return null;
    }

    function callHealBackend(payload) {
      if (payload && payload.op === 'submit' && !payload.is_admin) {
        var instantTk = matchInstantFaq(payload.message);
        if (instantTk) {
          return new Promise(function (resolve) {
            setTimeout(function () { resolve({ ok: true, ticket: instantTk }); }, 120);
          });
        }
      }
      var timeoutMs = (payload && (payload.op === 'coadmin_audit' || payload.op === 'draft_broadcast')) ? 22000 : 4500;
      function callCloudFallback() {
        if (typeof callFn === 'function') {
          var fnOp = payload.op === 'list'
            ? 'heal_list'
            : (payload.op === 'approve'
                ? 'heal_approve'
                : (payload.op === 'reject'
                    ? 'heal_reject'
                    : (payload.op === 'coadmin_audit'
                        ? 'coadmin_audit'
                        : (payload.op === 'draft_broadcast'
                            ? 'draft_broadcast'
                            : (payload.op === 'confirm_forward' ? 'confirm_forward' : 'heal_submit')))));
          return callFn('aiConcierge', Object.assign({}, payload, { op: fnOp })).then(function (r) {
            return (r && r.data) ? r.data : r;
          });
        }
        return Promise.reject(new Error('자율 수리 서버에 연결할 수 없어요.'));
      }
      if (Date.now() < _localDeadUntil && payload.op === 'submit') {
        return callCloudFallback();
      }
      function tryLocal(idx) {
        if (idx >= HEAL_URLS.length) {
          _localDeadUntil = Date.now() + 120000;
          return callCloudFallback();
        }
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var tm = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
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
    function resolvePhoneForEntry(entry) {
      if (!entry || !entry.id) return Promise.resolve('');
      var decContacts = (typeof decryptedContacts !== 'undefined' && decryptedContacts) ? decryptedContacts : {};
      if (decContacts[entry.id]) return Promise.resolve(decContacts[entry.id]);
      if (typeof adminPrivateKey !== 'undefined' && adminPrivateKey && typeof decryptWithAdmin === 'function') {
        if (entry.contactEnc) {
          return decryptWithAdmin(adminPrivateKey, entry.contactEnc).then(function (v) {
            if (v) decContacts[entry.id] = v;
            return v || '';
          }).catch(function () { return ''; });
        }
        if (typeof db !== 'undefined') {
          return db.collection('adminOnly').doc(entry.id).get().then(function (doc) {
            var d = doc && doc.exists ? doc.data() : null;
            if (d && d.contactEnc) {
              return decryptWithAdmin(adminPrivateKey, d.contactEnc).then(function (v) {
                if (v) decContacts[entry.id] = v;
                return v || '';
              });
            }
            return '';
          }).catch(function () { return ''; });
        }
      }
      return Promise.resolve('');
    }

    function gatherCoAdminTargets() {
      var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
      var pendList = (st.pendingEntries || []).filter(function (p) { return !p.heldReason && !p.rejectedAt; });
      var editList = (st.entries || []).filter(function (e) { return e.editReviewAt && !e.deactivated; });

      /* 각 신청자의 첫 번째 사진(원본 또는 썸네일) 및 복호화된 전화번호 가져오기 */
      return Promise.all(pendList.slice(0, 12).map(function (p) {
        var pUrl = p.photoThumb || '';
        var pProm = (!p.isMatchmaker && typeof db !== 'undefined')
          ? db.collection('photos').doc(p.id).get().then(function (doc) {
              var arr = (doc && doc.exists && doc.data() && Array.isArray(doc.data().photos)) ? doc.data().photos : [];
              return arr[0] || pUrl;
            }).catch(function () { return pUrl; })
          : Promise.resolve(pUrl);
        return Promise.all([pProm, resolvePhoneForEntry(p)]).then(function (pair) {
          var finalUrl = pair[0];
          var phoneStr = pair[1] || (p.pinSet || p.contactEnc ? '010-암호화보관확인' : '');
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
            phone: phoneStr
          };
        });
      })).then(function (pendingItems) {
        return Promise.all(editList.slice(0, 15).map(function (e) {
          return resolvePhoneForEntry(e).then(function (phoneStr) {
            return {
              id: e.id,
              nickname: e.nickname || '',
              phone: phoneStr || '',
              intro: e.intro || '',
              idealType: e.idealType || '',
              dealbreaker: e.dealbreaker || '',
              region: e.region || '',
              workplace: e.workplace || '',
              editChanges: Array.isArray(e.editChanges) ? e.editChanges : []
            };
          });
        })).then(function (editItems) {
          var statsSummary = {
            pin_resets: ((st.pinResetReqs || []).filter(function (r) { return r.status === 'pending'; })).length,
            reported_chats: (typeof _reportedChats !== 'undefined' && _reportedChats) ? Object.keys(_reportedChats).length : 0,
            stale_requests: ((st.dateRequests || []).filter(function (r) { return !r.approved && !r.rejected && !r.held; })).length
          };
          return { pending_items: pendingItems, edit_items: editItems, stats_summary: statsSummary };
        });
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

    /* AI에게 보내는 단기 대화 맥락(현재 진행 중인 용건만 유지, 창을 닫거나 전달 완료 시 초기화하여 불필요한 이력 전송/토큰 낭비 방지) */
    var _activeTurnHistory = [];
    var CHAT_LOG_STORAGE_PREFIX = 'bb_bai_chat_v1:';

    function getChatStorageKey() {
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      if (isAdm) return CHAT_LOG_STORAGE_PREFIX + 'admin';
      var uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : 'guest';
      return CHAT_LOG_STORAGE_PREFIX + uid;
    }

    function loadScreenChatLog() {
      try {
        var raw = localStorage.getItem(getChatStorageKey());
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.slice(-24) : [];
      } catch (e) {
        return [];
      }
    }

    function saveScreenChatLog(arr) {
      try {
        localStorage.setItem(getChatStorageKey(), JSON.stringify((arr || []).slice(-24)));
      } catch (e) {}
    }

    function pushScreenChatLog(role, text, meta) {
      var arr = loadScreenChatLog();
      arr.push({ role: role, text: String(text || ''), meta: meta || null, at: new Date().toISOString() });
      saveScreenChatLog(arr);
    }

    function openSelfHealModal(initialTab) {
      /* 새 창을 열 때는 이전 대화 기록을 화면에는 보여주되, AI에게 보낼 단기 문맥은 새로 시작 */
      _activeTurnHistory = [];
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
        '💌 주변 친구에게 이 사이트 소개해줄래요',
        '💬 매칭된 분께 첫인사 뭐라고 보낼까요?',
        '화면이 불편하거나 관리자님께 문의할래요'
      ];

      /* 로그인 회원이거나 승인 대기 본인이면 읽음 처리 + 실제 관리자가 직접 답장한 메시지만 말풍선으로 표시
         (자동 시스템 알림 '[베니브릿지] 확인 대기 중인 요청...' 및 내가 보낸 문의 중복 박스는 제외해 화면을 깔끔하게 유지) */
      var realAdminReplies = [];
      if (!isAdm && hasUser && typeof threadFor === 'function' && typeof currentState !== 'undefined' && currentState) {
        try {
          var rawThread = threadFor(currentState, currentUser.id, 'user') || [];
          localStorage.setItem('bb-admsg-seen:' + currentUser.id, new Date().toISOString());
          realAdminReplies = rawThread.filter(function (m) {
            if (!m || m.from !== 'admin' || m.auto) return false;
            var txt = String(m.text || '').trim();
            if (!txt || txt.indexOf('[베니브릿지]') === 0) return false;
            return true;
          }).slice(-3);
        } catch (e) {}
      }
      var adminRepliesHtml = realAdminReplies.map(function (m) {
        var dt = (typeof fmtDate === 'function' && m.at) ? fmtDate(m.at) : '';
        return '<div class="bai-msg-row ai">' +
          '<div class="bai-av" style="background:var(--gold, #f59e0b);color:#fff;">👑</div>' +
          '<div class="bai-bubble" style="border-color:var(--gold, #d97706);background:var(--gold-soft, #fffbeb);">' +
            '<div style="font-size:0.7rem;font-weight:700;color:var(--accent);margin-bottom:3px;">👑 관리자 답장' + (dt ? ' · <span style="font-weight:400;color:var(--muted);">' + escapeHtml(dt) + '</span>' : '') + '</div>' +
            '<div style="white-space:pre-wrap;word-break:break-word;">' + escapeHtml(m.text || '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      var savedLog = loadScreenChatLog();
      var exHtml = '<div class="bai-ex-list" id="bai-ex-box"' + (savedLog.length ? ' style="display:none;"' : '') + '>' +
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
            '<h3 style="margin:0;font-size:1.05rem;">' + (isAdm ? '👑 AI 부관리자' : '✨ AI 도우미 · 관리자 문의') + '</h3>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<button type="button" id="bai-clear-chat" style="border:1px solid var(--line);background:var(--paper);border-radius:6px;padding:2px 7px;font-size:0.72rem;color:var(--muted);cursor:pointer;' + (savedLog.length ? '' : 'display:none;') + '">기록 지우기</button>' +
              '<button type="button" id="bai-heal-close" style="border:0;background:none;font-size:1.3rem;color:var(--muted);cursor:pointer;line-height:1;">×</button>' +
            '</div>' +
          '</div>' +
          (isAdm ? (
            '<div style="display:flex;gap:4px;margin-bottom:10px;">' +
              '<button type="button" class="card-btn primary" id="bai-tab-coadmin" style="flex:1.05;padding:6px 3px;font-size:0.75rem;">👑 부관리자</button>' +
              '<button type="button" class="card-btn" id="bai-tab-broadcast" style="flex:1.05;padding:6px 3px;font-size:0.75rem;">📣 공지·케어</button>' +
              '<button type="button" class="card-btn" id="bai-tab-submit" style="flex:1;padding:6px 3px;font-size:0.75rem;">💬 대화·수리</button>' +
              '<button type="button" class="card-btn" id="bai-tab-list" style="flex:0.95;padding:6px 3px;font-size:0.75rem;">📋 대기함</button>' +
            '</div>'
          ) : '') +
          '<div id="bai-pane-coadmin" style="display:' + (isAdm ? 'block' : 'none') + ';"></div>' +
          '<div id="bai-pane-broadcast" style="display:none;"></div>' +
          '<div id="bai-pane-submit" style="display:' + (isAdm ? 'none' : 'block') + ';">' +
            '<div class="bai-chat-log" id="bai-chat-log">' +
              '<div class="bai-msg-row ai">' +
                '<div class="bai-av">✨</div>' +
                '<div class="bai-bubble">' + escapeHtml(greetingText) + '</div>' +
              '</div>' +
              adminRepliesHtml +
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

      /* 말풍선 안의 원클릭 기능 칩 생성 (회원이 물어봤을 때만 노출 — 카카오톡 문의 완전 제거) */
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
        if (chipType === 'share_invite') {
          var shareUrl = 'https://benny3s.github.io/bridge/';
          var tpl1 = '야 내가 요즘 지인 소개로만 조용히 운영하는 소개팅 페이지(베니브릿지) 하나 알게 됐는데, 신원 확실한 분들만 있어서 분위기 깔끔하더라! 너도 가볍게 프로필 구경해봐 😊\n👉 ' + shareUrl;
          var tpl2 = '혹시 요즘 좋은 분 만날 기회 찾으셨나요? 지인 기반으로 운영자가 한 분씩 직접 확인해서 안전하게 연결해 주는 \'베니브릿지\'라는 곳인데 깔끔해서 추천드려요 ✨\n👉 ' + shareUrl;
          return '<div style="margin-top:8px;display:flex;flex-direction:column;gap:7px;">' +
            '<div style="background:var(--paper);border:1px solid var(--gold, #C08A34);border-radius:10px;padding:8px 10px;">' +
              '<div style="font-size:0.73rem;font-weight:700;color:var(--accent);margin-bottom:3px;">💬 ① 찐친에게 편하게 보내는 카톡 문구</div>' +
              '<div style="font-size:0.78rem;color:var(--ink);white-space:pre-wrap;margin-bottom:6px;">' + escapeHtml(tpl1) + '</div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="card-btn primary" data-copy-txt="' + escapeHtml(tpl1) + '" style="padding:4px 10px;font-size:0.73rem;">📋 문구 복사</button>' +
                '<button type="button" class="card-btn" data-share-txt="' + escapeHtml(tpl1) + '" style="padding:4px 10px;font-size:0.73rem;">🔗 바로 공유</button>' +
              '</div>' +
            '</div>' +
            '<div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 10px;">' +
              '<div style="font-size:0.73rem;font-weight:700;color:var(--ink);margin-bottom:3px;">✨ ② 직장 동료·지인에게 정중하게 추천하는 문구</div>' +
              '<div style="font-size:0.78rem;color:var(--ink);white-space:pre-wrap;margin-bottom:6px;">' + escapeHtml(tpl2) + '</div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="card-btn primary" data-copy-txt="' + escapeHtml(tpl2) + '" style="padding:4px 10px;font-size:0.73rem;">📋 문구 복사</button>' +
                '<button type="button" class="card-btn" data-share-txt="' + escapeHtml(tpl2) + '" style="padding:4px 10px;font-size:0.73rem;">🔗 바로 공유</button>' +
              '</div>' +
            '</div>' +
            '<div style="background:var(--gold-soft, #fffbeb);border:1px dashed var(--gold, #C08A34);border-radius:10px;padding:7px 10px;font-size:0.76rem;color:var(--ink);">' +
              '🤝 <b>친구가 직접 가입하기 쑥스러워하나요?</b><br>내가 주선자(매니저)가 되어 친구 프로필을 대신 등록해주고 좋은 인연을 찾아줄 수도 있어요!' +
              (hasUser ? '<div style="margin-top:5px;"><button type="button" class="bai-inline-act" data-goto-tab="my" style="margin-top:0;">👉 내 공간 탭에서 확인하기</button></div>' : '') +
            '</div>' +
          '</div>';
        }
        if (chipType === 'icebreaker') {
          var partner = null;
          if (me && typeof currentState !== 'undefined' && currentState && typeof canViewContactOf === 'function') {
            var matchedList = (currentState.entries || []).filter(function (x) {
              return x.id !== me.id && !x.isMatchmaker && canViewContactOf(currentState, me.id, x.id);
            });
            if (matchedList.length) partner = matchedList[matchedList.length - 1];
          }
          var pName = partner && partner.nickname ? (partner.nickname + '님') : '상대방분';
          var pHint = partner && partner.region ? ('(' + partner.region + ')') : '';
          var ib1 = '안녕하세요 ' + pName + '! 프로필에서 분위기랑 소개글이 참 따뜻해 보여서 반가운 마음에 먼저 인사드려요 😊 오늘 하루 어떻게 보내셨나요?';
          var ib2 = (partner && partner.intro)
            ? ('안녕하세요 ' + pName + '! 소개글을 읽다 보니 취향이나 결이 비슷한 부분이 많아서 꼭 한 번 대화 나눠보고 싶었어요 😊 주말엔 주로 어떻게 시간 보내시나요?')
            : '안녕하세요! 매칭되어 정말 반가워요 😊 맛집이나 분위기 좋은 카페 탐방 좋아하시는지 궁금해요. 편하게 대화 나눠요!';
          var ib3 = '반갑습니다 ' + pName + ' 😊 서로 부담 없이 일상 이야기부터 천천히 알아가면 좋겠어요! 평일 퇴근 후엔 주로 뭐 하시면서 쉬시나요?';
          return '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">' +
            '<div style="font-size:0.74rem;font-weight:700;color:var(--accent);">💡 ' + escapeHtml(pName + pHint) + '께 보내기 좋은 맞춤 첫인사 3선</div>' +
            [ib1, ib2, ib3].map(function (line, i) {
              return '<div style="background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:0.78rem;">' +
                '<div style="margin-bottom:5px;color:var(--ink);">' + escapeHtml(line) + '</div>' +
                '<button type="button" class="card-btn primary" data-copy-txt="' + escapeHtml(line) + '" style="padding:3px 9px;font-size:0.72rem;">📋 첫인사 ' + (i + 1) + ' 복사</button>' +
              '</div>';
            }).join('') +
            (myId ? (
              '<div style="margin-top:2px;padding:6px 9px;background:var(--gold-soft, #fffbeb);border-radius:9px;font-size:0.74rem;display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
                '<span>💕 혹시 좋은 만남을 시작하셨나요?</span>' +
                '<button type="button" class="bai-inline-act" data-action="deactivate" data-id="' + myId + '" style="margin-top:0;padding:3px 8px;">💤 잠시 쉬기 전환</button>' +
              '</div>'
            ) : '') +
          '</div>';
        }
        return '';
      }

      var clearChatBtn = ov.querySelector('#bai-clear-chat');

      /* 기존 대화 내역 화면 복원 (AI API로는 이전 세션 이력을 보내지 않고 화면 표시만 유지) */
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

      function renderStoredItem(it) {
        if (!it || !it.text) return;
        if (it.role === 'user') {
          appendBubble('mine', escapeHtml(it.text));
          return;
        }
        var m = it.meta || {};
        var extra = '';
        if (m.badgeText) {
          extra = '<div style="margin-top:6px;"><span class="bai-tier-badge ' + escapeHtml(m.badgeClass || 'bai-tier-0') + '">' + escapeHtml(m.badgeText) + '</span></div>';
        }
        appendBubble('ai', '<div style="white-space:pre-wrap;">' + escapeHtml(it.text) + '</div>' + buildActionChipHtml(m.action_chip || '') + extra);
      }

      if (savedLog.length) {
        savedLog.forEach(renderStoredItem);
      }
      setTimeout(scrollBottom, 20);

      if (clearChatBtn) {
        clearChatBtn.onclick = function () {
          saveScreenChatLog([]);
          _activeTurnHistory = [];
          chatLog.innerHTML =
            '<div class="bai-msg-row ai">' +
              '<div class="bai-av">✨</div>' +
              '<div class="bai-bubble">' + escapeHtml(greetingText) + '</div>' +
            '</div>' +
            exHtml;
          clearChatBtn.style.display = 'none';
        };
      }

      chatLog.addEventListener('click', function (e) {
        var exBtn = e.target.closest ? e.target.closest('.bai-ex-chip') : null;
        if (exBtn) {
          var q = exBtn.getAttribute('data-ex') || '';
          if (q) sendChatMessage(q);
          return;
        }
        var copyBtn = e.target.closest ? e.target.closest('[data-copy-txt]') : null;
        if (copyBtn) {
          var txt = copyBtn.getAttribute('data-copy-txt') || '';
          if (txt && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(function () {
              var orig = copyBtn.textContent;
              copyBtn.textContent = '✅ 복사 완료!';
              setTimeout(function () { copyBtn.textContent = orig; }, 1800);
            });
          } else if (txt) {
            var ta = document.createElement('textarea');
            ta.value = txt;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (err) {}
            ta.remove();
            var orig2 = copyBtn.textContent;
            copyBtn.textContent = '✅ 복사 완료!';
            setTimeout(function () { copyBtn.textContent = orig2; }, 1800);
          }
          return;
        }
        var shareBtn = e.target.closest ? e.target.closest('[data-share-txt]') : null;
        if (shareBtn) {
          var stxt = shareBtn.getAttribute('data-share-txt') || '';
          if (navigator.share) {
            navigator.share({ title: '베니브릿지 초대', text: stxt, url: 'https://benny3s.github.io/bridge/' }).catch(function () {});
          } else if (typeof handleShare === 'function') {
            handleShare();
          }
          return;
        }
        var gotoBtn = e.target.closest ? e.target.closest('[data-goto-tab]') : null;
        if (gotoBtn) {
          var tab = gotoBtn.getAttribute('data-goto-tab');
          closeFn();
          var tabBtn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
          if (tabBtn) tabBtn.click();
          return;
        }
        var actBtn = e.target.closest ? e.target.closest('.bai-inline-act') : null;
        if (actBtn) {
          setTimeout(closeFn, 60);
        }
      });

      function sendChatMessage(rawText) {
        var msg = String(rawText != null ? rawText : (inputEl.value || '')).trim();
        if (!msg) return;
        inputEl.value = '';
        var exBox = ov.querySelector('#bai-ex-box');
        if (exBox) exBox.style.display = 'none';
        if (clearChatBtn) clearChatBtn.style.display = '';

        appendBubble('mine', escapeHtml(msg));
        pushScreenChatLog('user', msg);
        _activeTurnHistory.push({ role: 'user', text: msg });

        sendBtn.disabled = true;
        var loadingRow = appendBubble('ai', '<span style="color:var(--muted);">생각 중…</span>');
        var bubbleEl = loadingRow.querySelector('.bai-bubble');

        callHealBackend({
          op: 'submit',
          message: msg,
          history: _activeTurnHistory.slice(-4),
          is_admin: isAdm,
          author: authorLabel,
          screen_context: sctx
        }).then(function (r) {
          sendBtn.disabled = false;
          var tk = r.ticket || {};
          /* 1차 대화 모델은 화면을 직접 건드리지 않고, PC 관제탑(Argon/Opus)이 검증 후 패치함 */
          var replyText = tk.user_reply || '조금만 더 자세히 말씀해 주시면 바로 도와드릴게요 😊';
          _activeTurnHistory.push({ role: 'ai', text: replyText });

          var extraHtml = '';
          var savedMeta = { action_chip: tk.action_chip || '' };
          if (tk.decision === 'AUTO_FIX') {
            var prob1 = tk.problem_summary || tk.title || msg;
            extraHtml =
              '<div style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);font-size:0.76rem;color:var(--muted);">' +
                '🔍 <b>파악된 문제</b>: ' + escapeHtml(prob1) + '<br>' +
                '<span class="bai-tier-badge bai-tier-1" style="margin-top:4px;">🛠️ 자율 수리 착수 · 관리자에게 요약 보고됨</span>' +
              '</div>';
            savedMeta.badgeClass = 'bai-tier-1';
            savedMeta.badgeText = '🛠️ 자율 수리 착수 · 관리자에게 요약 보고됨';
            _activeTurnHistory = [];
          } else if (tk.decision === 'BETA_AND_ASK') {
            var prob2 = tk.problem_summary || tk.title || msg;
            extraHtml =
              '<div style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);font-size:0.76rem;color:var(--muted);">' +
                '🔍 <b>파악된 내용</b>: ' + escapeHtml(prob2) + '<br>' +
                '<span class="bai-tier-badge bai-tier-2" style="margin-top:4px;">🛠️ 베타 선반영 · 관리자 확인 요청 보고됨</span>' +
              '</div>';
            savedMeta.badgeClass = 'bai-tier-2';
            savedMeta.badgeText = '🛠️ 베타 선반영 · 관리자 확인 요청 보고됨';
            _activeTurnHistory = [];
          } else if (tk.decision === 'ASK_FORWARD_ADMIN' && !isAdm) {
            var summaryText = tk.admin_summary || tk.title || msg;
            if (hasUser) {
              extraHtml =
                '<div class="bai-fwd-box" style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);font-size:0.77rem;">' +
                  '<div style="color:var(--muted);margin-bottom:6px;">📝 <b>전달 요약</b>: ' + escapeHtml(summaryText) + '</div>' +
                  '<button type="button" class="card-btn primary bai-confirm-fwd" style="padding:6px 12px;font-size:0.76rem;border-radius:8px;">📨 네, 관리자에게 전달하기</button>' +
                '</div>';
            } else {
              extraHtml =
                '<div class="bai-fwd-box" style="margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);font-size:0.76rem;">' +
                  '<div style="color:var(--muted);margin-bottom:4px;">📝 <b>전달 요약</b>: ' + escapeHtml(summaryText) + '</div>' +
                  '<div style="color:var(--muted);margin-bottom:4px;">답변 받으실 이름과 연락처를 적고 전달을 눌러주세요:</div>' +
                  '<div style="display:flex;gap:4px;">' +
                    '<input type="text" class="modal-input bai-gm-name" placeholder="이름" style="width:70px;margin:0;padding:5px 7px;font-size:0.75rem;" />' +
                    '<input type="tel" class="modal-input bai-gm-phone" placeholder="01012345678" style="flex:1;margin:0;padding:5px 7px;font-size:0.75rem;" />' +
                    '<button type="button" class="card-btn primary bai-confirm-fwd" style="padding:5px 10px;font-size:0.75rem;">📨 전달</button>' +
                  '</div>' +
                '</div>';
            }
          }

          pushScreenChatLog('ai', replyText, savedMeta);

          bubbleEl.innerHTML =
            '<div style="white-space:pre-wrap;">' + escapeHtml(replyText) + '</div>' +
            buildActionChipHtml(tk.action_chip) +
            extraHtml;

          var fwdBtn = bubbleEl.querySelector('.bai-confirm-fwd');
          if (fwdBtn) {
            fwdBtn.onclick = function () {
              var summaryText = tk.admin_summary || tk.title || msg;
              var gnEl = bubbleEl.querySelector('.bai-gm-name');
              var gpEl = bubbleEl.querySelector('.bai-gm-phone');
              var gn = gnEl ? (gnEl.value || '').trim() : '';
              var gp = gpEl ? (gpEl.value || '').trim() : '';
              if (!hasUser && (!gn || !/^01[0-9]{8,9}$/.test(gp.replace(/[^0-9]/g, '')))) {
                alert('답변을 받으실 이름과 정확한 연락처(01012345678)를 입력해 주세요.');
                return;
              }
              fwdBtn.disabled = true;
              fwdBtn.textContent = '전달 중…';
              var formattedQna = '[AI 요약] ' + summaryText + '\n(내용: ' + msg + ')';
              Promise.all([
                forwardToAdminQnaInbox(formattedQna, gn, gp),
                callHealBackend({
                  op: 'confirm_forward',
                  author: gn ? (gn + ' (비로그인)') : authorLabel,
                  summary: summaryText,
                  message: msg
                }).catch(function () { return {}; })
              ]).then(function () {
                _activeTurnHistory = [];
                var logs = loadScreenChatLog();
                if (logs.length && logs[logs.length - 1].role === 'ai') {
                  logs[logs.length - 1].meta = {
                    action_chip: tk.action_chip || '',
                    badgeClass: 'bai-tier-0',
                    badgeText: '✅ 관리자에게 요약 전달 완료! 확인 후 답장해 드릴게요 😊'
                  };
                  saveScreenChatLog(logs);
                }
                var box = bubbleEl.querySelector('.bai-fwd-box');
                if (box) {
                  box.innerHTML = '<span class="bai-tier-badge bai-tier-0">✅ 관리자에게 요약 전달 완료! 확인 후 답장해 드릴게요 😊</span>';
                }
              });
            };
          }
          scrollBottom();
          inputEl.focus();
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
        var btnBroadcast = ov.querySelector('#bai-tab-broadcast');
        var btnSubmit = ov.querySelector('#bai-tab-submit');
        var btnList = ov.querySelector('#bai-tab-list');
        var paneCoAdmin = ov.querySelector('#bai-pane-coadmin');
        var paneBroadcast = ov.querySelector('#bai-pane-broadcast');
        var paneSubmit = ov.querySelector('#bai-pane-submit');
        var paneList = ov.querySelector('#bai-pane-list');

        function renderCoAdminPane() {
          var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
          var pendCount = ((st.pendingEntries || []).filter(function (p) { return !p.heldReason && !p.rejectedAt; })).length;
          var editCount = ((st.entries || []).filter(function (e) { return e.editReviewAt && !e.deactivated; })).length;
          var autoOn = true;
          try { autoOn = localStorage.getItem(AUTO_COADMIN_KEY) !== '0'; } catch (e) {}

          paneCoAdmin.innerHTML =
            '<div class="bai-ctx-box" style="margin-bottom:10px;">' +
              '👑 <b>AI 부관리자 심사 기준</b><br>' +
              '1. <b>신규 신청서 (대기 ' + pendCount + '건)</b>: ① 정면 얼굴 사진(Vision 판독) · ② <code>010-XXXX-XXXX</code> 정상 번호 · ③ 자기소개 적절성 확인 → <b>정상 시 승인 / 미달 시 사유 안내 후 보류</b><br>' +
              '2. <b>프로필 변경 (미검토 ' + editCount + '건)</b>: 기존 승인 내용 대비 이상 변경(내용 삭제·욕설·비정상 번호) 없으면 <b>자동 확인 완료</b>, 이상 시 베니 비서로 경고 보고' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;padding:8px 11px;background:var(--paper);border:1px solid var(--gold);border-radius:10px;margin-bottom:10px;cursor:pointer;">' +
              '<input type="checkbox" id="bai-auto-coadmin-chk" ' + (autoOn ? 'checked' : '') + ' />' +
              '<span><b>자동 부관리자 모드 켜기 (기본 ON)</b> (새 신청·이상 변경 감지 시 자동 심사·승인·📱 베니 비서 보고)</span>' +
            '</label>' +
            '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
              '<button type="button" class="card-btn primary" id="bai-run-audit" style="flex:1;padding:9px;">🔍 지금 심사 + 📱 베니 비서 보고</button>' +
              '<button type="button" class="card-btn approve" id="bai-run-auto-exec" style="flex:1;padding:9px;">⚡ 심사 후 승인·확인 즉시 집행</button>' +
            '</div>' +
            '<div id="bai-coadmin-out"></div>';

          paneCoAdmin.querySelector('#bai-auto-coadmin-chk').onchange = function (e) {
            try {
              localStorage.setItem(AUTO_COADMIN_KEY, e.target.checked ? '1' : '0');
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
                force_report: true
              });
            }).then(function (res) {
              var pList = res.pending_results || [];
              var eList = res.edit_results || [];

              function renderResults(execSummary) {
                var html = '';
                if (execSummary) {
                  html += '<div class="bai-step-card" style="border-color:#137333;background:#e6f4ea;color:#137333;font-weight:700;margin-bottom:8px;">' +
                    '✅ AI 부관리자 집행 완료: 신청 자동 승인 ' + execSummary.approved + '건 · 보완 보류 ' + execSummary.held + '건 · 프로필 변경 확인 ' + execSummary.confirmed + '건 (📱 핸드폰 베니 비서 브리핑 완료)' +
                  '</div>';
                } else {
                  html += '<div style="font-size:0.78rem;color:var(--gold);font-weight:700;margin-bottom:6px;">📱 핸드폰 베니 비서 알림함으로 점검 브리핑 보고서를 전송했습니다.</div>';
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

        function renderBroadcastPane() {
          var st = (typeof currentState !== 'undefined' && currentState) ? currentState : {};
          var liveEntries = (st.entries || []).filter(function (e) { return !e.managedBy && !e.deactivated; });
          var maleEntries = liveEntries.filter(function (e) { return !e.isMatchmaker && (e.gender === 'male' || e.gender === 'M'); });
          var femaleEntries = liveEntries.filter(function (e) { return !e.isMatchmaker && (e.gender === 'female' || e.gender === 'F'); });
          var mmEntries = liveEntries.filter(function (e) { return !!e.isMatchmaker; });

          var nowMs = Date.now();
          var staleIdMap = {};
          ((st.dateRequests || []).concat(st.photoRequests || []).concat(st.talkRequests || [])).forEach(function (r) {
            var isPend = r && (!r.approved && !r.rejected && (!r.status || r.status === 'pending'));
            var dtStr = r && (r.submittedAt || r.createdAt);
            if (isPend && r.toId && dtStr && (nowMs - new Date(dtStr).getTime() > 48 * 3600 * 1000)) {
              staleIdMap[r.toId] = true;
            }
          });
          var staleEntries = liveEntries.filter(function (e) { return !!staleIdMap[e.id]; });

          var matchedIdMap = {};
          ((st.dateRequests || []).concat(st.talkRequests || [])).forEach(function (r) {
            if (r && (r.approved || r.status === 'approved') && (!r.type || r.type === 'contact')) {
              if (r.fromId) matchedIdMap[r.fromId] = true;
              if (r.toId) matchedIdMap[r.toId] = true;
            }
          });
          (st.connections || []).forEach(function (c) {
            if (c && c.a) matchedIdMap[c.a] = true;
            if (c && c.b) matchedIdMap[c.b] = true;
          });
          var matchedEntries = liveEntries.filter(function (e) { return !!matchedIdMap[e.id]; });

          var genderHint = maleEntries.length > femaleEntries.length
            ? '여성 싱글 지인'
            : (femaleEntries.length > maleEntries.length ? '남성 싱글 지인' : '괜찮은 싱글 친구');

          var presets = {
            referral: {
              target: 'all',
              title: '💌 주변의 좋은 친구에게 베니브릿지를 소개해 주세요!',
              text: '안녕하세요! 현재 베니브릿지에는 총 ' + (maleEntries.length + femaleEntries.length) + '명의 회원분들과 ' + mmEntries.length + '분의 주선자님이 함께하고 있어요 😊\n지인 소개로 조용하고 안전하게 운영되는 공간인 만큼, 주변에 ' + genderHint + '이 계시다면 베니브릿지를 살짝 소개해 주시거나 주선자로 등록해 주시면 매칭 풀이 더욱 풍성해집니다 💕\n(AI 도우미 창에서 카톡 초대 문구도 바로 복사하실 수 있어요!)'
            },
            weekend: {
              target: 'all',
              title: '✨ 이번 주 새로 합류한 분들을 명단에서 만나보세요!',
              text: '안녕하세요! 이번 주에도 매력적이고 진지한 새 멤버분들이 베니브릿지에 합류했어요 😊\n명단 탭을 가볍게 둘러보시고, 대화 나눠보고 싶은 분께 오늘의 사진·대화 신청(하루 각 3건)을 보내 보세요!'
            },
            stale: {
              target: 'stale',
              title: '⏰ 도착한 신청이 답변을 기다리고 있어요 😊',
              text: '안녕하세요! 회원님께 도착한 사진/대화 신청이 애타게 확인을 기다리고 있어요 😊\n바쁘시더라도 잠시 [내 공간] 또는 [요청] 탭에 들러 승인·보류·거절 여부를 편하게 선택해 주시면 상대방분께 큰 배려가 됩니다 🙏'
            },
            matched: {
              target: 'matched',
              title: '💕 연결된 분과 좋은 대화 나누고 계신가요?',
              text: '안녕하세요! 베니브릿지를 통해 연결되신 분과 기분 좋은 대화 이어가고 계신지 안부 인사드려요 😊\n혹시 첫인사가 고민되시면 [✨ AI 도우미]에서 맞춤 첫인사 추천을 받아보실 수 있고, 좋은 만남을 시작하셨다면 [잠시 쉬기]로 언제든 편하게 전환하실 수 있어요 💕'
            }
          };

          paneBroadcast.innerHTML =
            '<div class="bai-ctx-box" style="margin-bottom:8px;">' +
              '📊 <b>현재 발송 가능 대상 현황</b><br>' +
              '• 전체 활동 계정 <b>' + liveEntries.length + '명</b> (남성 <b>' + maleEntries.length + '명</b> · 여성 <b>' + femaleEntries.length + '명</b> · 주선자 <b>' + mmEntries.length + '명</b>)<br>' +
              '• ⏰ 48시간+ 미응답 요청 보유: <b>' + staleEntries.length + '명</b> · 💌 연결(매칭) 성사 회원: <b>' + matchedEntries.length + '명</b>' +
            '</div>' +
            '<div style="font-size:0.76rem;font-weight:700;color:var(--ink);margin-bottom:5px;">✨ 원클릭 AI 메시지 테마 선택 (누르면 자동 입력)</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">' +
              '<button type="button" class="bai-ex-chip" data-bc-preset="referral">💌 주변 친구 소개 부탁 (성비 맞춤)</button>' +
              '<button type="button" class="bai-ex-chip" data-bc-preset="weekend">🎉 신규 합류 & 주말 명단 안내</button>' +
              '<button type="button" class="bai-ex-chip" data-bc-preset="stale">⏰ 미응답 요청 다정한 케어 (' + staleEntries.length + '명)</button>' +
              '<button type="button" class="bai-ex-chip" data-bc-preset="matched">💕 매칭 회원 안부·성사 체크 (' + matchedEntries.length + '명)</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">' +
              '<span style="font-size:0.78rem;font-weight:700;flex-shrink:0;">🎯 발송 대상:</span>' +
              '<select id="bai-bc-target" style="flex:1;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font-size:0.8rem;background:var(--paper);color:var(--ink);">' +
                '<option value="all">전체 활동 회원 (' + liveEntries.length + '명)</option>' +
                '<option value="M">남성 회원만 (' + maleEntries.length + '명)</option>' +
                '<option value="F">여성 회원만 (' + femaleEntries.length + '명)</option>' +
                '<option value="mm">주선자만 (' + mmEntries.length + '명)</option>' +
                '<option value="stale">⏰ 48시간+ 미응답 요청 회원만 (' + staleEntries.length + '명)</option>' +
                '<option value="matched">💌 연결(매칭) 성사 회원만 (' + matchedEntries.length + '명)</option>' +
              '</select>' +
              '<button type="button" class="card-btn" id="bai-bc-ai-polish" style="flex:none;padding:6px 10px;font-size:0.75rem;">✨ AI 문구 생성</button>' +
            '</div>' +
            '<input type="text" class="modal-input" id="bai-bc-title" maxlength="60" value="' + escapeHtml(presets.referral.title) + '" placeholder="공지 제목 또는 AI에게 시킬 주제 입력" style="margin-bottom:6px;font-weight:700;font-size:0.84rem;" />' +
            '<textarea class="modal-input" id="bai-bc-text" rows="4" maxlength="900" placeholder="메시지 본문 (비워두고 [✨ AI 문구 생성]을 누르면 제목/주제로 자동 작성해요)" style="font-size:0.82rem;line-height:1.5;margin-bottom:8px;">' + escapeHtml(presets.referral.text) + '</textarea>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
              '<button type="button" class="card-btn primary" id="bai-bc-send-msg" style="width:100%;padding:9px;font-size:0.82rem;">💬 선택 대상 대화창(👑 관리자 답장 말풍선)으로 발송</button>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="card-btn" id="bai-bc-send-popup" style="flex:1;padding:8px;font-size:0.76rem;">📢 전체 1회성 팝업 띄우기</button>' +
                '<button type="button" class="card-btn approve" id="bai-bc-send-checkin" style="flex:1.15;padding:8px;font-size:0.76rem;">📅 친구공유 팝업(🔗 공유버튼 포함) 발송</button>' +
              '</div>' +
            '</div>' +
            '<div id="bai-bc-status" style="margin-top:8px;font-size:0.78rem;"></div>';

          var targetSel = paneBroadcast.querySelector('#bai-bc-target');
          var titleInp = paneBroadcast.querySelector('#bai-bc-title');
          var textInp = paneBroadcast.querySelector('#bai-bc-text');
          var statusEl = paneBroadcast.querySelector('#bai-bc-status');

          Array.prototype.forEach.call(paneBroadcast.querySelectorAll('[data-bc-preset]'), function (btn) {
            btn.onclick = function () {
              var k = btn.getAttribute('data-bc-preset');
              var p = presets[k];
              if (!p) return;
              targetSel.value = p.target;
              titleInp.value = p.title;
              textInp.value = p.text;
              statusEl.innerHTML = '<span style="color:var(--gold);font-weight:700;">✨ 테마 문구가 입력되었어요. 내용 확인 후 아래 발송 버튼을 눌러주세요!</span>';
            };
          });

          var aiPolishBtn = paneBroadcast.querySelector('#bai-bc-ai-polish');
          if (aiPolishBtn) {
            aiPolishBtn.onclick = function () {
              var topic = (titleInp.value || textInp.value || '주변 싱글 친구 소개 독려').trim();
              aiPolishBtn.disabled = true;
              aiPolishBtn.textContent = '작성 중…';
              statusEl.innerHTML = '<span style="color:var(--muted);">⏳ AI가 현재 회원 현황에 맞춰 다정한 문구를 작성하고 있어요…</span>';
              callHealBackend({
                op: 'draft_broadcast',
                topic: topic,
                stats: {
                  total_active: liveEntries.length,
                  male: maleEntries.length,
                  female: femaleEntries.length,
                  matchmakers: mmEntries.length,
                  stale_requests: staleEntries.length,
                  matched_members: matchedEntries.length,
                  target_group: targetSel.value
                }
              }).then(function (r) {
                aiPolishBtn.disabled = false;
                aiPolishBtn.textContent = '✨ AI 문구 생성';
                if (r && r.title) titleInp.value = r.title;
                if (r && r.text) textInp.value = r.text;
                statusEl.innerHTML = '<span style="color:#137333;font-weight:700;">✅ AI가 맞춤 문구를 완성했어요!</span>';
              }).catch(function () {
                aiPolishBtn.disabled = false;
                aiPolishBtn.textContent = '✨ AI 문구 생성';
                statusEl.innerHTML = '<span style="color:var(--accent);">문구 생성 중 지연이 발생했어요. 왼쪽 테마 칩을 눌러 바로 사용하실 수 있어요.</span>';
              });
            };
          }

          function getTargetEntries(targetKey) {
            if (targetKey === 'M') return maleEntries;
            if (targetKey === 'F') return femaleEntries;
            if (targetKey === 'mm') return mmEntries;
            if (targetKey === 'stale') return staleEntries;
            if (targetKey === 'matched') return matchedEntries;
            return liveEntries;
          }

          paneBroadcast.querySelector('#bai-bc-send-msg').onclick = function () {
            var tKey = targetSel.value;
            var targets = getTargetEntries(tKey);
            var title = (titleInp.value || '').trim();
            var body = (textInp.value || '').trim();
            if (!body) {
              statusEl.innerHTML = '<span style="color:var(--accent);font-weight:700;">메시지 본문을 입력해 주세요.</span>';
              return;
            }
            if (!targets.length) {
              statusEl.innerHTML = '<span style="color:var(--accent);font-weight:700;">선택한 대상 그룹에 해당하는 회원이 현재 0명입니다.</span>';
              return;
            }
            var fullMsg = title ? ('[' + title + ']\n' + body) : body;
            var sendBtnEl = paneBroadcast.querySelector('#bai-bc-send-msg');
            sendBtnEl.disabled = true;
            sendBtnEl.textContent = '발송 중…';
            db.runTransaction(function (tx) {
              return tx.get(stateRef).then(function (doc) {
                var s = doc.data() || {};
                var now = Date.now();
                var targetIds = {};
                targets.forEach(function (x) { targetIds[x.id] = true; });
                var newMsgs = Object.keys(targetIds).map(function (eid, i) {
                  return {
                    id: (typeof genId === 'function') ? genId() : ('adm-' + now + '-' + i),
                    entryId: eid,
                    from: 'admin',
                    text: fullMsg,
                    at: new Date(now + i).toISOString(),
                    broadcast: tKey === 'all'
                  };
                });
                var msgs = (s.messages || []).concat(newMsgs);
                if (msgs.length > 5000) msgs = msgs.slice(msgs.length - 5000);
                tx.update(stateRef, { messages: msgs });
              });
            }).then(function () {
              if (typeof appendLog === 'function') appendLog('admin', 'AI 부관리자', '맞춤 메시지 발송(' + tKey + ') · ' + targets.length + '명');
              if (typeof refreshNow === 'function') return refreshNow();
            }).then(function () {
              sendBtnEl.disabled = false;
              sendBtnEl.textContent = '💬 선택 대상 대화창(👑 관리자 답장 말풍선)으로 발송';
              statusEl.innerHTML = '<span style="color:#137333;font-weight:700;">✅ 총 ' + targets.length + '명의 대화창(👑 관리자 답장 말풍선)으로 발송 완료!</span>';
            }).catch(function (err) {
              sendBtnEl.disabled = false;
              sendBtnEl.textContent = '💬 선택 대상 대화창(👑 관리자 답장 말풍선)으로 발송';
              statusEl.innerHTML = '<span style="color:var(--accent);">발송 실패: ' + escapeHtml(err.message || String(err)) + '</span>';
            });
          };

          paneBroadcast.querySelector('#bai-bc-send-popup').onclick = function () {
            var title = (titleInp.value || '📢 공지').trim();
            var body = (textInp.value || '').trim();
            if (!body || typeof setOneOffPopup !== 'function') return;
            setOneOffPopup(title, body).then(function () {
              statusEl.innerHTML = '<span style="color:#137333;font-weight:700;">✅ 전체 회원에게 다음 접속 시 1회성 팝업으로 뜨도록 예약되었어요!</span>';
            });
          };

          paneBroadcast.querySelector('#bai-bc-send-checkin').onclick = function () {
            var title = (titleInp.value || '💌 베니브릿지 소식 & 친구 공유').trim();
            var body = (textInp.value || '').trim();
            if (!body || typeof saveCheckinCfg !== 'function') return;
            saveCheckinCfg({
              title: title,
              text: body,
              enabled: true,
              since: Date.now(),
              forceVer: String(Date.now())
            }).then(function () {
              statusEl.innerHTML = '<span style="color:#137333;font-weight:700;">✅ [🔗 친구에게 공유] 버튼이 포함된 팝업 문구를 갱신하고 전 회원에게 즉시 발송했어요!</span>';
            });
          };
        }

        function loadTicketList() {
          paneList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:0.85rem;">티켓 목록을 불러오는 중…</div>';
          callHealBackend({ op: 'list' }).then(function (r) {
            var list = r.tickets || [];
            var tcfg = r.tower_config || { judge_model: 'auto', worker_model: 'auto' };
            var towerBar =
              '<div class="bai-ctx-box" style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:0.75rem;">' +
                  '🗼 <b>PC 관제탑 모델</b>: ' +
                  '<select id="bai-tower-judge" style="font-size:0.74rem;padding:2px 5px;border-radius:6px;border:1px solid var(--line);">' +
                    '<option value="auto"' + (tcfg.judge_model === 'auto' ? ' selected' : '') + '>자동 (Argon 우선·Claude 백업)</option>' +
                    '<option value="argon"' + (tcfg.judge_model === 'argon' ? ' selected' : '') + '>Argon (Gemini 4)</option>' +
                    '<option value="claude-sonnet"' + (tcfg.judge_model === 'claude-sonnet' ? ' selected' : '') + '>Claude Sonnet 5.5</option>' +
                    '<option value="claude-opus"' + (tcfg.judge_model === 'claude-opus' ? ' selected' : '') + '>Claude Opus 5.5</option>' +
                  '</select>' +
                '</div>' +
                '<button type="button" class="card-btn" id="bai-sync-cloud-btn" style="padding:3px 9px;font-size:0.73rem;">☁️ 밀린 안건 수거</button>' +
              '</div>';
            var listHtml = !list.length
              ? '<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.85rem;">아직 접수된 자율 수리 티켓이 없어요.</div>'
              : list.map(function (t) {
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
            paneList.innerHTML = towerBar + listHtml;

            var selJudge = paneList.querySelector('#bai-tower-judge');
            if (selJudge) {
              selJudge.onchange = function () {
                callHealBackend({ op: 'set_tower', judge_model: selJudge.value }).catch(function () {});
              };
            }
            var syncBtn = paneList.querySelector('#bai-sync-cloud-btn');
            if (syncBtn) {
              syncBtn.onclick = function () {
                syncBtn.disabled = true;
                syncBtn.textContent = '수거 중…';
                callHealBackend({ op: 'sync_cloud' }).then(function () {
                  setTimeout(loadTicketList, 800);
                }).catch(function () {
                  syncBtn.disabled = false;
                  syncBtn.textContent = '☁️ 밀린 안건 수거';
                });
              };
            }

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
          [btnCoAdmin, btnBroadcast, btnSubmit, btnList].forEach(function (b) { if (b) b.classList.remove('primary'); });
          paneCoAdmin.style.display = 'none';
          if (paneBroadcast) paneBroadcast.style.display = 'none';
          paneSubmit.style.display = 'none';
          paneList.style.display = 'none';
          if (which === 'coadmin') {
            btnCoAdmin.classList.add('primary');
            paneCoAdmin.style.display = 'block';
            renderCoAdminPane();
          } else if (which === 'broadcast') {
            if (btnBroadcast) btnBroadcast.classList.add('primary');
            if (paneBroadcast) paneBroadcast.style.display = 'block';
            renderBroadcastPane();
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
        if (btnBroadcast) btnBroadcast.onclick = function () { switchAdminModalTab('broadcast'); };
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
      var autoOn = true;
      try { autoOn = localStorage.getItem(AUTO_COADMIN_KEY) !== '0'; } catch (e) {}
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

    /* 상단 #feedback-btn 뿐 아니라 대화 탭의 [👑 베니브릿지 관리자], 내 현황의 [✍️ 관리자에게 메시지],
       승인 대기 화면의 [💬 관리자에게 문의 남기기], 체크인 팝업의 [💬 의견 남기기] 모두 AI 도우미 창으로 완전 통합 */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest
        ? e.target.closest('#feedback-btn, #member-msg-open, [data-action="applicant-inquiry"], #ci-feedback')
        : null;
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var isAdm = (typeof isAdminUnlocked !== 'undefined' && isAdminUnlocked);
      openSelfHealModal((isAdm && t.id === 'feedback-btn') ? 'coadmin' : 'submit');
    }, true);

    if (typeof openMemberMsgCenter === 'function') {
      openMemberMsgCenter = function () { openSelfHealModal('submit'); };
    }
    if (typeof openGuestMsgModal === 'function') {
      openGuestMsgModal = function () { openSelfHealModal('submit'); };
    }
    if (typeof adminUnreadFor === 'function') {
      adminUnreadFor = function (state, me) {
        if (typeof adminRoomVisible === 'function' && !adminRoomVisible(me)) return 0;
        if (typeof currentUser === 'undefined' || !currentUser || !currentUser.id) return 0;
        var seen = '';
        try { seen = localStorage.getItem('bb-admsg-seen:' + currentUser.id) || ''; } catch (e) {}
        var _srv = ((typeof myAuthEntry === 'function' ? myAuthEntry(state) : null) || {}).mineSeenAt || '';
        if (_srv > seen) seen = _srv;
        return (typeof threadFor === 'function' ? threadFor(state, currentUser.id, 'user') : []).filter(function (m) {
          if (!m || m.from !== 'admin' || m.auto) return false;
          var txt = String(m.text || '').trim();
          if (!txt || txt.indexOf('[베니브릿지]') === 0) return false;
          return (m.at || '') > seen;
        }).length;
      };
    }
    if (typeof adminRoomHtml === 'function') {
      adminRoomHtml = function (state, me) {
        if (typeof adminRoomVisible === 'function' && !adminRoomVisible(me)) return '';
        var un = typeof adminUnreadFor === 'function' ? adminUnreadFor(state, me) : 0;
        var realAdm = (typeof threadFor === 'function' && currentUser && currentUser.id ? threadFor(state, currentUser.id, 'user') : []).filter(function (m) {
          if (!m || m.from !== 'admin' || m.auto) return false;
          var txt = String(m.text || '').trim();
          return txt && txt.indexOf('[베니브릿지]') !== 0;
        });
        var saved = loadScreenChatLog();
        var lastChat = saved.length ? saved[saved.length - 1] : null;
        var lastAdm = realAdm.length ? realAdm[realAdm.length - 1] : null;
        var prevText = '궁금한 점·불편한 화면·건의·탈퇴 문의를 편하게 남겨 주세요';
        var lastTime = '';
        if (lastAdm && (!lastChat || (lastAdm.at || '') > (lastChat.at || ''))) {
          prevText = '👑 관리자: ' + (lastAdm.text || '');
          lastTime = lastAdm.at || '';
        } else if (lastChat) {
          prevText = (lastChat.role === 'user' ? '나: ' : '✨ ') + (lastChat.text || '');
          lastTime = lastChat.at || '';
        }
        return '<div class="chat-list admin-room-wrap"><button type="button" class="chat-item admin-room" id="member-msg-open">' +
          '<div class="chat-av md" style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #f59e0b;font-size:1.1rem;">✨</div>' +
          '<div class="chat-item-mid"><div class="chat-item-name">✨ AI 도우미 · 관리자 문의 <span class="admin-room-tag">24시간 안내</span></div>' +
            '<div class="chat-item-prev">' + escapeHtml(prevText) + '</div></div>' +
          '<div class="chat-item-right">' + (lastTime && typeof chatListTime === 'function' ? '<div class="chat-item-time">' + escapeHtml(chatListTime(lastTime)) + '</div>' : '') + (un ? '<div class="chat-item-badge">' + un + '</div>' : '') + '</div>' +
        '</button></div>';
      };
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
