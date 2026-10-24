  /* ════ 🌉 귀여운 베니 AI 말풍선 & 내 화면 꾸미기 · AI 코치 · 공유/피드백 도우미 (베타 전용) ════
     - 전체 화면을 가리는 만족도/공유 팝업 대신 화면 오른쪽 아래에 귀여운 (베니)AI 캐릭터가 말풍선으로 말을 건넵니다.
     - 4가지 도우미:
       1) 🎨 내 화면 꾸미기 (프리셋 5종 + 글자 크기 + AI 분위기 커스텀 → CSS 변수만 안전하게 변경, localStorage 저장)
       2) ✨ AI 코치 (내 키워드로 자기소개글 2가지 초안 생성 & 신청서 자동 입력 / 상대에게 보낼 첫 인사말 추천)
       3) 💌 친구 추천·공유 (카카오/링크 공유 & 초대 문구 복사)
       4) 📬 피드백·의견 남기기 (+ 관리자일 때 AI 도우미 스위치) */
  (function bennyAiAssistant() {
    var TOWER_URLS = [
      'https://desktop-ijcbddr.tail4df4c9.ts.net:8443/api/ai/assist',
      'http://127.0.0.1:8999/api/ai/assist'
    ];
    var STORAGE_THEME_KEY = 'bennyAiTheme';
    var STORAGE_FONT_KEY = 'bennyAiFont';
    var STORAGE_HIDE_BUBBLE = 'bennyAiBubbleMuted';

    var PRESETS = {
      default: { name: '🌸 기본 로즈', paper: '#FBF3EE', card: '#FFFDFB', accent: '#B23A48', soft: '#F4DADC', ink: '#2A1F26', line: '#E8DAD2', dark: false },
      latte:   { name: '☕ 따뜻한 라떼', paper: '#F7F1E8', card: '#FFFDF9', accent: '#8C5A3C', soft: '#EFE2D3', ink: '#2C221E', line: '#E2D5C6', dark: false },
      peach:   { name: '🍑 포근한 피치', paper: '#FFF5F0', card: '#FFFFFF', accent: '#D96B52', soft: '#FDE2DA', ink: '#2E211E', line: '#F0D8D0', dark: false },
      mint:    { name: '🌿 산뜻한 민트', paper: '#F1F8F6', card: '#FFFFFF', accent: '#2E7D6B', soft: '#D7EFE9', ink: '#1E2B28', line: '#CFE3DE', dark: false },
      dark:    { name: '🌙 눈 편한 밤', paper: '#1C1519', card: '#291F25', accent: '#E58C96', soft: '#45262B', ink: '#F4EAE6', line: '#3E313A', dark: true }
    };

    var HEX_RE = /^#[0-9a-fA-F]{6}$/;
    function safeHex(v, fallback) { return (typeof v === 'string' && HEX_RE.test(v.trim())) ? v.trim() : fallback; }

    function applyCustomTheme(cfg) {
      var root = document.documentElement;
      if (!cfg || cfg.id === 'default') {
        ['--paper', '--card', '--accent', '--accent-deep', '--accent-soft', '--ink', '--line'].forEach(function (k) { root.style.removeProperty(k); });
        root.removeAttribute('data-theme');
        try { localStorage.removeItem(STORAGE_THEME_KEY); } catch (e) {}
        return;
      }
      var p = PRESETS[cfg.id] || cfg;
      root.setAttribute('data-theme', p.dark ? 'dark' : 'light');
      root.style.setProperty('--paper', safeHex(p.paper, '#FBF3EE'));
      root.style.setProperty('--card', safeHex(p.card, '#FFFDFB'));
      root.style.setProperty('--accent', safeHex(p.accent, '#B23A48'));
      root.style.setProperty('--accent-deep', safeHex(p.accent, '#B23A48'));
      root.style.setProperty('--accent-soft', safeHex(p.soft, '#F4DADC'));
      root.style.setProperty('--ink', safeHex(p.ink, '#2A1F26'));
      root.style.setProperty('--line', safeHex(p.line, '#E8DAD2'));
      try { localStorage.setItem(STORAGE_THEME_KEY, JSON.stringify(cfg)); } catch (e) {}
    }

    function applyCustomFont(sz) {
      var root = document.documentElement;
      if (sz === 'large') {
        root.style.fontSize = '17.5px';
        try { localStorage.setItem(STORAGE_FONT_KEY, 'large'); } catch (e) {}
      } else {
        root.style.removeProperty('font-size');
        try { localStorage.removeItem(STORAGE_FONT_KEY); } catch (e) {}
      }
    }

    /* 저장된 내 화면 테마·글자 크기 복원 */
    try {
      var savedT = JSON.parse(localStorage.getItem(STORAGE_THEME_KEY) || 'null');
      if (savedT) applyCustomTheme(savedT);
      var savedF = localStorage.getItem(STORAGE_FONT_KEY);
      if (savedF) applyCustomFont(savedF);
    } catch (e) {}

    /* llm-bridge 호출 (연결 안 될 때는 즉시 스마트 로컬 생성으로 안전 폴백) */
    function callBennyAi(task, prompt, context) {
      function tryUrl(idx) {
        if (idx >= TOWER_URLS.length) return Promise.resolve(null);
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var tm = ctl ? setTimeout(function () { ctl.abort(); }, 4500) : null;
        return fetch(TOWER_URLS[idx], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: task, prompt: prompt, context: context || {} }),
          signal: ctl ? ctl.signal : undefined
        }).then(function (r) {
          if (tm) clearTimeout(tm);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (j) {
          if (j && j.ok && j.reply) return j;
          throw new Error('empty');
        }).catch(function () {
          if (tm) clearTimeout(tm);
          return tryUrl(idx + 1);
        });
      }
      return tryUrl(0);
    }

    function localSmartFallback(task, kw) {
      var clean = (kw || '산책, 맛집 탐방, 대화').trim();
      if (task === 'bridge_intro') {
        return '① [따뜻하고 진솔한 버전]\n' +
          '안녕하세요 😊 일상 속 소소한 대화를 소중하게 생각하는 사람입니다. 평소에는 ' + clean + ' 등을 즐기며 에너지를 얻고 있어요. 서로의 하루를 따뜻하게 나누며 편안하게 알아갈 수 있는 좋은 분을 만나고 싶습니다.\n\n' +
          '② [담백하고 센스 있는 버전]\n' +
          '반갑습니다! ' + clean + ' 좋아하는 긍정적인 사람이에요. 거창한 것보다 함께 맛있는 것 먹고 산책하며 자연스럽게 웃을 수 있는 인연이면 좋겠습니다. 편하게 신청해 주세요 ✨';
      }
      if (task === 'bridge_greeting') {
        return '① "안녕하세요 😊 프로필을 보니 ' + clean + ' 이야기가 반가워서 용기 내어 인사드려요! 주말엔 주로 어떻게 시간 보내시는지 궁금합니다."\n\n' +
          '② "반갑습니다! 소개글에서 따뜻한 분위기가 느껴져 대화 나누어 보고 싶었어요. 괜찮으시다면 편하게 이야기 나누어요 😊"';
      }
      return '';
    }

    /* 상황별 귀여운 베니 말풍선 문구 */
    var TIPS = [
      { text: '주변에 진지하게 좋은 인연을 찾는 친구가 있다면 베니브릿지를 추천해 주세요 💌', tab: 'share' },
      { text: '눈이 편안한 다크 모드나 따뜻한 라떼 톤으로 내 화면을 꾸며볼까요? 🎨', tab: 'theme' },
      { text: '자기소개나 첫 인사말이 고민될 땐 저에게 키워드만 알려주세요 ✨', tab: 'coach' },
      { text: '쓰시면서 좋았던 점이나 바라는 점이 있다면 언제든 속삭여 주세요 📬', tab: 'feedback' }
    ];
    var tipIdx = 0;
    var activeSheetTab = 'coach';
    var bubbleVisible = true;

    /* 기존 전체화면 만족도/공유 팝업(showCheckinModal)을 베니 AI 말풍선으로 부드럽게 대체 */
    if (typeof showCheckinModal === 'function') {
      var _origCheckinModal = showCheckinModal;
      showCheckinModal = function (overrideTitle, overrideText) {
        if (overrideTitle != null || overrideText != null) {
          /* 관리자가 미리보기로 직접 호출한 경우엔 원래 모달도 볼 수 있게 함 */
          return _origCheckinModal(overrideTitle, overrideText);
        }
        showSpeech('베니브릿지 요즘 어떠세요? 😊 불편한 점이나 의견, 친구 추천·공유는 저를 눌러 편하게 해보세요!', 'share', 11000);
      };
    }

    var wrap = document.createElement('div');
    wrap.id = 'benny-ai-dock';
    wrap.style.cssText = 'position:fixed;right:14px;bottom:16px;z-index:99990;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:inherit;pointer-events:none;';

    var speech = document.createElement('div');
    speech.id = 'benny-ai-speech';
    speech.style.cssText = 'pointer-events:auto;max-width:255px;background:var(--card,#fff);color:var(--ink,#2A1F26);border:1.5px solid var(--accent,#B23A48);border-radius:16px 16px 4px 16px;padding:10px 12px;font-size:12.5px;line-height:1.45;box-shadow:0 6px 20px rgba(0,0,0,.16);cursor:pointer;display:none;position:relative;transition:transform .2s ease;';

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'benny-ai-fab';
    fab.setAttribute('aria-label', '베니 AI 도우미 열기');
    fab.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:6px;background:linear-gradient(135deg, var(--accent,#B23A48), var(--accent-deep,#7A222E));color:#fff;border:0;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.22);cursor:pointer;';
    fab.innerHTML = '<span style="font-size:16px;">🐻‍❄️</span><span>베니 AI</span>';

    wrap.appendChild(speech);
    wrap.appendChild(fab);
    document.body.appendChild(wrap);

    var speechTimer = null;
    function showSpeech(msg, targetTab, durationMs) {
      try { if (localStorage.getItem(STORAGE_HIDE_BUBBLE) === '1') return; } catch (e) {}
      if (document.querySelector('.modal-overlay, .chat-screen')) return;
      speech.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">' +
          '<span style="font-weight:700;color:var(--accent,#B23A48);font-size:11.5px;">🐻‍❄️ 베니 AI의 한마디</span>' +
          '<button type="button" data-close-speech="1" style="border:0;background:none;color:var(--muted,#888);font-size:14px;line-height:1;padding:0 2px;cursor:pointer;" title="말풍선 닫기">×</button>' +
        '</div>' +
        '<div style="margin-top:4px;">' + escapeHtml(msg) + '</div>';
      speech.setAttribute('data-tab', targetTab || 'coach');
      speech.style.display = 'block';
      if (speechTimer) clearTimeout(speechTimer);
      speechTimer = setTimeout(function () { speech.style.display = 'none'; }, durationMs || 8500);
    }

    speech.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-close-speech')) {
        e.stopPropagation();
        speech.style.display = 'none';
        return;
      }
      var t = speech.getAttribute('data-tab') || 'coach';
      speech.style.display = 'none';
      openBennySheet(t);
    });

    fab.addEventListener('click', function () {
      speech.style.display = 'none';
      openBennySheet(activeSheetTab);
    });

    /* 처음 들어온 뒤 4초 후 첫 인사 말풍선, 이후 45초마다 은은하게 팁 교체 */
    setTimeout(function () {
      var cur = TIPS[tipIdx % TIPS.length];
      tipIdx++;
      showSpeech(cur.text, cur.tab, 8000);
    }, 4000);
    setInterval(function () {
      if (speech.style.display === 'none') {
        var cur = TIPS[tipIdx % TIPS.length];
        tipIdx++;
        showSpeech(cur.text, cur.tab, 7500);
      }
    }, 45000);

    function openBennySheet(initialTab) {
      activeSheetTab = initialTab || 'coach';
      var overlay = openModal(
        '<div id="benny-ai-modal" style="text-align:left;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<div style="display:flex;align-items:center;gap:7px;">' +
              '<span style="font-size:22px;">🐻‍❄️</span>' +
              '<div>' +
                '<div style="font-weight:800;font-size:1rem;">베니 AI 도우미 <span style="font-size:11px;padding:2px 6px;border-radius:99px;background:var(--accent-soft,#F4DADC);color:var(--accent,#B23A48);">BETA</span></div>' +
                '<div style="font-size:11.5px;color:var(--muted,#8A7370);">내 화면 꾸미기 · 소개글/첫인사 코치 · 친구 추천 · 의견 남기기</div>' +
              '</div>' +
            '</div>' +
            '<button type="button" id="bai-close" style="border:0;background:none;font-size:20px;color:var(--muted);cursor:pointer;">×</button>' +
          '</div>' +
          '<div id="bai-tabs" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:12px;">' +
            '<button type="button" data-btab="coach" class="card-btn" style="padding:7px 4px;font-size:12px;">✨ AI 코치</button>' +
            '<button type="button" data-btab="theme" class="card-btn" style="padding:7px 4px;font-size:12px;">🎨 화면꾸미기</button>' +
            '<button type="button" data-btab="share" class="card-btn" style="padding:7px 4px;font-size:12px;">💌 친구추천</button>' +
            '<button type="button" data-btab="feedback" class="card-btn" style="padding:7px 4px;font-size:12px;">📬 의견·설정</button>' +
          '</div>' +
          '<div id="bai-body" style="min-height:210px;font-size:13px;line-height:1.55;"></div>' +
        '</div>'
      );

      var bodyEl = overlay.querySelector('#bai-body');
      var tabBtns = overlay.querySelectorAll('[data-btab]');

      function renderTab(t) {
        activeSheetTab = t;
        Array.prototype.forEach.call(tabBtns, function (b) {
          var on = b.getAttribute('data-btab') === t;
          b.style.background = on ? 'var(--accent,#B23A48)' : 'var(--card,#fff)';
          b.style.color = on ? '#fff' : 'var(--ink,#2A1F26)';
          b.style.borderColor = on ? 'var(--accent,#B23A48)' : 'var(--line,#E8DAD2)';
          b.style.fontWeight = on ? '700' : '500';
        });

        if (t === 'coach') {
          bodyEl.innerHTML =
            '<div style="display:grid;gap:8px;">' +
              '<div style="font-size:12.5px;color:var(--muted);">키워드 몇 개만 적어주시면 자연스럽고 호감 가는 <b>자기소개글</b>이나 <b>첫 인사말</b>을 만들어 드려요. (개인정보·실명·연락처는 적지 마세요 🔒)</div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" id="bai-mode-intro" class="card-btn" style="flex:1;background:var(--accent-soft);color:var(--accent);font-weight:700;">📝 내 자기소개 다듬기</button>' +
                '<button type="button" id="bai-mode-greet" class="card-btn" style="flex:1;">👋 상대에게 첫 인사말</button>' +
              '</div>' +
              '<input type="text" id="bai-kw" placeholder="예: 주말 산책, 커피, 진솔한 대화, 유머러스" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit;" />' +
              '<button type="button" id="bai-run" class="card-btn" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700;padding:9px;">✨ 베니 AI에게 문구 추천받기</button>' +
              '<div id="bai-out" style="white-space:pre-wrap;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:12.5px;display:none;"></div>' +
              '<div id="bai-apply-row" style="display:none;gap:6px;">' +
                '<button type="button" id="bai-copy" class="card-btn" style="flex:1;">📋 문구 복사하기</button>' +
                '<button type="button" id="bai-fill-intro" class="card-btn" style="flex:1;background:var(--accent-soft);color:var(--accent);font-weight:700;">✍️ 신청서 자기소개칸에 넣기</button>' +
              '</div>' +
            '</div>';
          var mode = 'bridge_intro';
          var bIntro = bodyEl.querySelector('#bai-mode-intro');
          var bGreet = bodyEl.querySelector('#bai-mode-greet');
          var kwIn = bodyEl.querySelector('#bai-kw');
          var outEl = bodyEl.querySelector('#bai-out');
          var applyRow = bodyEl.querySelector('#bai-apply-row');
          var fillBtn = bodyEl.querySelector('#bai-fill-intro');

          bIntro.onclick = function () {
            mode = 'bridge_intro';
            bIntro.style.background = 'var(--accent-soft)'; bIntro.style.color = 'var(--accent)'; bIntro.style.fontWeight = '700';
            bGreet.style.background = ''; bGreet.style.color = ''; bGreet.style.fontWeight = '';
            kwIn.placeholder = '내 키워드 (예: 주말 산책, 맛집 탐방, 다정한 성격)';
            fillBtn.style.display = '';
          };
          bGreet.onclick = function () {
            mode = 'bridge_greeting';
            bGreet.style.background = 'var(--accent-soft)'; bGreet.style.color = 'var(--accent)'; bGreet.style.fontWeight = '700';
            bIntro.style.background = ''; bIntro.style.color = ''; bIntro.style.fontWeight = '';
            kwIn.placeholder = '상대 프로필 특징 (예: 강아지 산책, 전시회 관람, 웃음이 많음)';
            fillBtn.style.display = 'none';
          };
          bodyEl.querySelector('#bai-run').onclick = function () {
            var kw = kwIn.value.trim() || '산책, 맛집 탐방, 진솔한 대화';
            outEl.style.display = 'block';
            outEl.textContent = '🐻‍❄️ 베니 AI가 문구를 다듬고 있어요…';
            callBennyAi(mode, kw, { mode: mode }).then(function (res) {
              var txt = (res && res.reply) ? res.reply : localSmartFallback(mode, kw);
              outEl.textContent = txt;
              applyRow.style.display = 'flex';
            });
          };
          bodyEl.querySelector('#bai-copy').onclick = function () {
            var txt = outEl.textContent || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(txt).then(function () { modalNotice('복사 완료', '추천 문구를 클립보드에 복사했어요 😊'); });
            }
          };
          fillBtn.onclick = function () {
            var txt = (outEl.textContent || '').split('②')[0].replace(/^①\s*\[[^\]]*\]\s*/, '').trim();
            var introField = document.querySelector('textarea[name="intro"], #f-intro');
            if (introField) {
              introField.value = txt;
              introField.dispatchEvent(new Event('input', { bubbles: true }));
              closeModal(overlay);
              modalNotice('적용 완료', '자기소개 입력칸에 초안을 채워 넣었어요! 내 말투에 맞게 자유롭게 다듬어 보세요.');
            } else {
              if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
              modalNotice('안내', '추천 문구를 복사했어요! 내 계정 → 프로필 수정이나 가입 신청서의 자기소개 칸에 붙여넣기 해보세요.');
            }
          };
          return;
        }

        if (t === 'theme') {
          var presetBtns = Object.keys(PRESETS).map(function (k) {
            var p = PRESETS[k];
            return '<button type="button" data-preset="' + k + '" class="card-btn" style="display:flex;align-items:center;justify-content:space-between;padding:9px 11px;">' +
              '<span>' + escapeHtml(p.name) + '</span>' +
              '<span style="display:inline-flex;gap:4px;">' +
                '<i style="width:14px;height:14px;border-radius:50%;background:' + p.paper + ';border:1px solid #ccc;display:inline-block;"></i>' +
                '<i style="width:14px;height:14px;border-radius:50%;background:' + p.accent + ';display:inline-block;"></i>' +
              '</span>' +
            '</button>';
          }).join('');
          bodyEl.innerHTML =
            '<div style="display:grid;gap:8px;">' +
              '<div style="font-size:12.5px;color:var(--muted);">내 기기에서 보이는 베니브릿지 색상과 글자 크기를 내 취향대로 바꿔보세요. (언제든 기본값으로 되돌릴 수 있어요)</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' + presetBtns + '</div>' +
              '<div style="display:flex;gap:6px;align-items:center;margin-top:4px;">' +
                '<span style="font-size:12.5px;font-weight:700;">글자 크기:</span>' +
                '<button type="button" data-fsz="normal" class="card-btn" style="flex:1;padding:6px;">보통 (기본)</button>' +
                '<button type="button" data-fsz="large" class="card-btn" style="flex:1;padding:6px;">크게 보기 🔍</button>' +
              '</div>' +
              '<div style="display:flex;gap:6px;margin-top:4px;">' +
                '<input type="text" id="bai-theme-prompt" placeholder="원하는 분위기 입력 (예: 차분한 숲속, 봄날 벚꽃)" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit;font-size:12.5px;" />' +
                '<button type="button" id="bai-theme-ai" class="card-btn" style="background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700;">🎨 AI 배색</button>' +
              '</div>' +
              '<div id="bai-theme-msg" style="font-size:12px;color:var(--muted);"></div>' +
            '</div>';
          Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-preset]'), function (b) {
            b.onclick = function () {
              var k = b.getAttribute('data-preset');
              var p = PRESETS[k];
              applyCustomTheme(k === 'default' ? { id: 'default' } : Object.assign({ id: k }, p));
              bodyEl.querySelector('#bai-theme-msg').textContent = '✨ ' + p.name + ' 테마를 적용했어요!';
            };
          });
          Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-fsz]'), function (b) {
            b.onclick = function () {
              var sz = b.getAttribute('data-fsz');
              applyCustomFont(sz);
              bodyEl.querySelector('#bai-theme-msg').textContent = sz === 'large' ? '🔍 글자 크기를 큼직하게 키웠어요.' : '글자 크기를 기본으로 되돌렸어요.';
            };
          });
          bodyEl.querySelector('#bai-theme-ai').onclick = function () {
            var q = (bodyEl.querySelector('#bai-theme-prompt').value || '').trim();
            if (!q) return;
            var msgEl = bodyEl.querySelector('#bai-theme-msg');
            msgEl.textContent = '🐻‍❄️ 어울리는 색상 조합을 고르는 중…';
            callBennyAi('bridge_theme', q, { mood: q }).then(function (res) {
              var picked = null;
              if (res && res.reply) {
                try {
                  var m = res.reply.match(/\{[\s\S]*\}/);
                  if (m) picked = JSON.parse(m[0]);
                } catch (e) {}
              }
              if (!picked || !HEX_RE.test(picked.paper || '')) {
                if (/밤|다크|어두|차분/.test(q)) picked = PRESETS.dark;
                else if (/민트|숲|초록|바다|시원/.test(q)) picked = PRESETS.mint;
                else if (/라떼|커피|가을|베이지/.test(q)) picked = PRESETS.latte;
                else picked = PRESETS.peach;
              }
              applyCustomTheme(Object.assign({ id: 'custom' }, picked));
              msgEl.textContent = '🎨 "' + q + '" 분위기에 맞춰 화면 색상을 바꿨어요!';
            });
          };
          return;
        }

        if (t === 'share') {
          bodyEl.innerHTML =
            '<div style="display:grid;gap:10px;">' +
              '<div style="background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px;">' +
                '<div style="font-weight:700;margin-bottom:4px;">🐻‍❄️ 화면을 가리는 팝업 대신 제가 옆에서 도와드려요!</div>' +
                '<div style="font-size:12.5px;color:var(--muted);">주변에 진지하게 좋은 인연을 찾는 친구나 동료가 있다면 베니브릿지를 소개해 주세요. 믿을 수 있는 지인 풀이 넓어질수록 매칭 확률도 올라가요 🙏</div>' +
              '</div>' +
              '<button type="button" id="bai-do-share" class="card-btn" style="background:#1a73e8;border-color:#1a73e8;color:#fff;font-weight:700;padding:10px;">🔗 친구에게 베니브릿지 공유하기</button>' +
              '<button type="button" id="bai-copy-invite" class="card-btn" style="padding:10px;">💌 센스 있는 초대 문구 + 링크 복사</button>' +
            '</div>';
          bodyEl.querySelector('#bai-do-share').onclick = function () {
            closeModal(overlay);
            if (typeof handleShare === 'function') handleShare();
          };
          bodyEl.querySelector('#bai-copy-invite').onclick = function () {
            var invite = '주변 지인들 중심으로 믿고 소개받는 [베니브릿지]야 😊 부담 없이 구경해 봐! https://benny3s.github.io/bridge/';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(invite).then(function () { modalNotice('복사 완료', '초대 문구와 링크를 복사했어요! 카카오톡이나 문자로 친구에게 바로 붙여넣어 보세요 💌'); });
            }
          };
          return;
        }

        if (t === 'feedback') {
          var mutedNow = false;
          try { mutedNow = localStorage.getItem(STORAGE_HIDE_BUBBLE) === '1'; } catch (e) {}
          bodyEl.innerHTML =
            '<div style="display:grid;gap:10px;">' +
              '<div style="font-size:12.5px;color:var(--muted);">베니브릿지를 쓰면서 좋았던 점이나 "이런 기능도 있으면 좋겠다!" 싶은 의견을 편하게 남겨주세요.</div>' +
              '<button type="button" id="bai-open-msg" class="card-btn" style="background:#FEE500;border-color:#FEE500;color:#3C1E1E;font-weight:700;padding:10px;">💬 관리자에게 의견·피드백 남기기</button>' +
              '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:8px 10px;background:var(--paper);border-radius:10px;border:1px solid var(--line);cursor:pointer;">' +
                '<input type="checkbox" id="bai-mute-chk" ' + (mutedNow ? 'checked' : '') + ' />' +
                '<span>자동 말풍선 알림 잠시 끄기 (아이콘만 남기기)</span>' +
              '</label>' +
              (isAdminUnlocked ? (
                '<div style="border-top:1px dashed var(--line);padding-top:8px;margin-top:2px;">' +
                  '<div style="font-weight:700;font-size:12px;color:var(--accent);margin-bottom:6px;">🛡 관리자 전용 (베타 검증)</div>' +
                  '<button type="button" id="bai-test-speech" class="card-btn" style="width:100%;font-size:12px;">🐻‍❄️ 친구추천 말풍선 지금 띄워보기</button>' +
                '</div>'
              ) : '') +
            '</div>';
          bodyEl.querySelector('#bai-open-msg').onclick = function () {
            closeModal(overlay);
            if (typeof openMemberMsgCenter === 'function') openMemberMsgCenter();
            else modalNotice('안내', '로그인 후 메시지함(💬 관리자 대화방)에서 의견을 남기실 수 있어요!');
          };
          bodyEl.querySelector('#bai-mute-chk').onchange = function (e) {
            try {
              if (e.target.checked) localStorage.setItem(STORAGE_HIDE_BUBBLE, '1');
              else localStorage.removeItem(STORAGE_HIDE_BUBBLE);
            } catch (err) {}
          };
          var testBtn = bodyEl.querySelector('#bai-test-speech');
          if (testBtn) {
            testBtn.onclick = function () {
              closeModal(overlay);
              showSpeech('베니브릿지 요즘 어떠세요? 😊 팝업 대신 제가 옆에서 친구 추천과 화면 꾸미기를 도와드려요!', 'share', 10000);
            };
          }
        }
      }

      Array.prototype.forEach.call(tabBtns, function (b) {
        b.addEventListener('click', function () { renderTab(b.getAttribute('data-btab')); });
      });
      overlay.querySelector('#bai-close').addEventListener('click', function () { closeModal(overlay); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(overlay); });
      renderTab(activeSheetTab);
    }
  })();
