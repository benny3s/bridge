  /* ════ ✦ 베니 AI 살롱 컨시어지 (Benny AI Salon Concierge — 베타 전용) ════
     - 우측 하단 둥둥 떠다니는 챗봇 버튼(FAB)과 무작위 말풍선을 완전히 제거하고,
       베니브릿지 고유의 편지지·세리프(Gowun Batang)·빈티지 골드 감성에 맞춘 인컨텍스트(In-Context) AI 컨시어지로 재설계했습니다.
     - 4대 인컨텍스트 터치포인트:
       1) [신청서·프로필 수정] ✦ AI 프로필 아틀리에 (자기소개 키워드/톤별 생성·윤문, 이상형·비선호 조건 다듬기)
       2) [명단 프로필 카드]   ✦ AI 주선자 케미 리포트 (내 프로필 × 상대 프로필 실제 대조 분석 & 원클릭 대화 신청 연동)
       3) [사진·대화 신청 모달] ✦ 상대 맞춤 첫 인사말 컨시어지 (상대 소개글 속 구체적 포인트를 짚어주는 신청 메시지 3선)
       4) [1:1 채팅방]         ✦ AI 아이스브레이커 & 스몰토크 위스퍼 (두 분 프로필 + 직전 대화 맥락 기반 질문 추천)
     - 화면 테마·글자 크기 설정은 '⚙️ 내 계정' 안(비로그인 시 상단 바 '🎨 테마')으로 단정하게 통합했습니다.
     - 백엔드: Firebase Cloud Function `aiConcierge` (Groq Qwen3.8-27B / GPT-OSS-120B) + llm-bridge(:8443/:8999) 이중 실시간 연동. */
  (function bennyAiConcierge() {
    var TOWER_URLS = [
      'https://desktop-ijcbddr.tail4df4c9.ts.net:8443/api/ai/assist',
      'http://127.0.0.1:8999/api/ai/assist'
    ];
    var STORAGE_THEME_KEY = 'bennyAiTheme';
    var STORAGE_FONT_KEY = 'bennyAiFont';

    var PRESETS = {
      default: { name: '🌸 기본 로즈', desc: '베니브릿지 시그니처 웜 아이보리 & 로즈', paper: '#FBF3EE', card: '#FFFDFB', accent: '#B23A48', soft: '#F4DADC', ink: '#2A1F26', line: '#E8DAD2', dark: false },
      latte:   { name: '☕ 따뜻한 라떼', desc: '차분한 에스프레소 브라운 & 크림 베이지', paper: '#F7F1E8', card: '#FFFDF9', accent: '#8C5A3C', soft: '#EFE2D3', ink: '#2C221E', line: '#E2D5C6', dark: false },
      peach:   { name: '🍑 포근한 피치', desc: '화사하고 설레는 코랄 피치 톤', paper: '#FFF5F0', card: '#FFFFFF', accent: '#D96B52', soft: '#FDE2DA', ink: '#2E211E', line: '#F0D8D0', dark: false },
      mint:    { name: '🌿 산뜻한 포레스트', desc: '눈이 시원한 세이지 민트 & 화이트', paper: '#F1F8F6', card: '#FFFFFF', accent: '#2E7D6B', soft: '#D7EFE9', ink: '#1E2B28', line: '#CFE3DE', dark: false },
      dark:    { name: '🌙 나이트 살롱', desc: '밤에 눈이 편안한 딥 벨벳 다크 모드', paper: '#1C1519', card: '#291F25', accent: '#E58C96', soft: '#45262B', ink: '#F4EAE6', line: '#3E313A', dark: true }
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

    try {
      var savedT = JSON.parse(localStorage.getItem(STORAGE_THEME_KEY) || 'null');
      if (savedT) applyCustomTheme(savedT);
      var savedF = localStorage.getItem(STORAGE_FONT_KEY);
      if (savedF) applyCustomFont(savedF);
    } catch (e) {}

    /* ── 1. 에디토리얼 골드 & 로즈 쉬머(Shimmer) 스타일 시트 주입 ── */
    var styleEl = document.createElement('style');
    styleEl.id = 'benny-ai-concierge-style';
    styleEl.textContent = [
      '@keyframes bai-shimmer {',
      '  0% { background-position: -200% 0; }',
      '  100% { background-position: 200% 0; }',
      '}',
      '@keyframes bai-fade-up {',
      '  from { opacity: 0; transform: translateY(6px); }',
      '  to { opacity: 1; transform: translateY(0); }',
      '}',
      '@keyframes bai-sparkle-pulse {',
      '  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.92; }',
      '  50% { transform: scale(1.18) rotate(12deg); opacity: 1; }',
      '}',
      '.bai-sparkle { display: inline-block; color: var(--gold, #C08A34); font-style: normal; animation: bai-sparkle-pulse 2.4s ease-in-out infinite; }',
      '.bai-trigger-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; margin: 2px 0 6px; }',
      '.bai-pill-btn {',
      '  display: inline-flex; align-items: center; gap: 5px; font-family: inherit; font-size: 0.8rem; font-weight: 700;',
      '  padding: 5px 12px; border-radius: 999px; cursor: pointer;',
      '  color: var(--ink, #2A1F26); background: linear-gradient(135deg, var(--card, #FFFDFB) 0%, var(--gold-soft, #F1E2C4) 100%);',
      '  border: 1px solid var(--gold, #C08A34); box-shadow: 0 2px 8px rgba(192, 138, 52, 0.14);',
      '  transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;',
      '}',
      '.bai-pill-btn:hover { border-color: var(--accent, #B23A48); box-shadow: 0 4px 12px rgba(178, 58, 72, 0.18); transform: translateY(-1px); }',
      '.bai-pill-btn:active { transform: scale(0.97); }',
      '.bai-pill-btn.active { background: linear-gradient(135deg, var(--accent, #B23A48), var(--accent-deep, #7A222E)); color: #fff; border-color: var(--accent, #B23A48); }',
      '.bai-pill-btn.active .bai-sparkle { color: #FFE3A8; }',
      '.bai-salon-box {',
      '  position: relative; margin: 6px 0 12px; padding: 15px 16px; border-radius: 14px;',
      '  background: linear-gradient(160deg, var(--card, #FFFDFB) 0%, var(--paper, #FBF3EE) 65%, var(--gold-soft, #F1E2C4) 160%);',
      '  border: 1px solid var(--gold, #C08A34); box-shadow: 0 8px 26px rgba(42, 31, 38, 0.10);',
      '  animation: bai-fade-up 0.22s ease-out; text-align: left;',
      '}',
      '.bai-salon-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }',
      '.bai-salon-title { font-family: "Gowun Batang", Georgia, serif; font-weight: 700; font-size: 0.96rem; color: var(--ink, #2A1F26); display: flex; align-items: center; gap: 6px; }',
      '.bai-salon-badge { font-family: "Gowun Dodum", sans-serif; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px; background: var(--gold-soft, #F1E2C4); color: var(--gold, #C08A34); border: 1px solid rgba(192,138,52,0.35); }',
      '.bai-salon-close { border: 0; background: none; color: var(--muted, #8A7370); font-size: 1.15rem; line-height: 1; padding: 0 4px; cursor: pointer; }',
      '.bai-context-strip {',
      '  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;',
      '  font-size: 0.76rem; color: var(--muted, #8A7370); background: rgba(192, 138, 52, 0.09);',
      '  border-left: 3px solid var(--gold, #C08A34); border-radius: 4px 8px 8px 4px; padding: 5px 10px; margin-bottom: 10px;',
      '}',
      '.bai-context-strip b { color: var(--ink, #2A1F26); }',
      '.bai-chip-group { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }',
      '.bai-kw-chip {',
      '  font-family: inherit; font-size: 0.78rem; padding: 5px 11px; border-radius: 999px;',
      '  border: 1px solid var(--line, #E8DAD2); background: var(--card, #FFFDFB); color: var(--ink, #2A1F26);',
      '  cursor: pointer; transition: all 0.12s ease; user-select: none;',
      '}',
      '.bai-kw-chip:hover { border-color: var(--gold, #C08A34); }',
      '.bai-kw-chip.on { background: var(--accent-soft, #F4DADC); border-color: var(--accent, #B23A48); color: var(--accent-deep, #7A222E); font-weight: 700; }',
      '.bai-tone-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }',
      '.bai-tone-btn {',
      '  flex: 1 1 auto; font-family: inherit; font-size: 0.78rem; font-weight: 600; padding: 6px 10px;',
      '  border-radius: 9px; border: 1px solid var(--line, #E8DAD2); background: var(--paper, #FBF3EE); color: var(--ink, #2A1F26); cursor: pointer; text-align: center;',
      '}',
      '.bai-tone-btn:hover { border-color: var(--gold, #C08A34); background: var(--gold-soft, #F1E2C4); }',
      '.bai-tone-btn.on { background: var(--accent, #B23A48); color: #fff; border-color: var(--accent, #B23A48); font-weight: 700; }',
      '.bai-shimmer-loading {',
      '  padding: 14px 12px; border-radius: 10px; font-size: 0.84rem; color: var(--ink, #2A1F26);',
      '  background: linear-gradient(90deg, var(--paper, #FBF3EE) 0%, var(--gold-soft, #F1E2C4) 50%, var(--paper, #FBF3EE) 100%);',
      '  background-size: 200% 100%; animation: bai-shimmer 1.6s infinite linear; border: 1px dashed var(--gold, #C08A34);',
      '  display: flex; align-items: center; gap: 8px;',
      '}',
      '.bai-option-list { display: grid; gap: 8px; margin-top: 8px; }',
      '.bai-option-card {',
      '  background: var(--card, #FFFDFB); border: 1px solid var(--line, #E8DAD2); border-radius: 11px; padding: 11px 13px;',
      '  transition: border-color 0.15s ease, box-shadow 0.15s ease; animation: bai-fade-up 0.2s ease-out;',
      '}',
      '.bai-option-card:hover { border-color: var(--gold, #C08A34); box-shadow: 0 4px 14px rgba(192, 138, 52, 0.12); }',
      '.bai-option-tag { display: inline-block; font-size: 0.72rem; font-weight: 700; color: var(--accent, #B23A48); background: var(--accent-soft, #F4DADC); padding: 1px 8px; border-radius: 999px; margin-bottom: 5px; }',
      '.bai-option-text { font-size: 0.88rem; line-height: 1.58; color: var(--ink, #2A1F26); white-space: pre-wrap; word-break: keep-all; }',
      '.bai-option-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }',
      '.bai-use-btn {',
      '  font-family: inherit; font-size: 0.76rem; font-weight: 700; padding: 4px 12px; border-radius: 999px;',
      '  border: 1px solid var(--accent, #B23A48); background: var(--accent, #B23A48); color: #fff; cursor: pointer;',
      '}',
      '.bai-use-btn:hover { background: var(--accent-deep, #7A222E); }',
      '.bai-chem-wrap { margin: 10px 0 4px; }',
      '.bai-chem-btn {',
      '  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;',
      '  font-family: inherit; font-size: 0.82rem; font-weight: 700; padding: 8px 12px; border-radius: 11px; cursor: pointer;',
      '  color: var(--ink, #2A1F26); background: linear-gradient(90deg, var(--paper, #FBF3EE), var(--gold-soft, #F1E2C4), var(--paper, #FBF3EE));',
      '  border: 1px dashed var(--gold, #C08A34); transition: all 0.15s ease;',
      '}',
      '.bai-chem-btn:hover { border-style: solid; border-color: var(--accent, #B23A48); box-shadow: 0 3px 12px rgba(192,138,52,0.18); }',
      '.bai-chem-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }',
      '.bai-chem-tag { font-size: 0.74rem; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--gold-soft, #F1E2C4); color: var(--ink, #2A1F26); border: 1px solid var(--gold, #C08A34); }',
      '.bai-chat-bar {',
      '  display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none;',
      '  padding: 6px 10px; background: linear-gradient(90deg, var(--paper, #FBF3EE), var(--gold-soft, #F1E2C4));',
      '  border-top: 1px dashed var(--gold, #C08A34); font-size: 0.78rem;',
      '}',
      '.bai-chat-bar::-webkit-scrollbar { display: none; }',
      '.bai-chat-chip {',
      '  flex: 0 0 auto; font-family: inherit; font-size: 0.76rem; font-weight: 600; padding: 4px 10px;',
      '  border-radius: 999px; border: 1px solid var(--gold, #C08A34); background: var(--card, #FFFDFB); color: var(--ink, #2A1F26); cursor: pointer;',
      '}',
      '.bai-chat-chip:hover { border-color: var(--accent, #B23A48); background: var(--accent-soft, #F4DADC); color: var(--accent-deep, #7A222E); }',
      '.bai-chat-drawer {',
      '  padding: 10px 12px; background: var(--card, #FFFDFB); border-top: 1px solid var(--gold, #C08A34);',
      '  box-shadow: 0 -6px 20px rgba(0,0,0,0.08); max-height: 220px; overflow-y: auto;',
      '}'
    ].join('\n');
    document.head.appendChild(styleEl);

    /* ── 2. 실제 LLM 호출 엔진 (1순위: Firebase CF `aiConcierge`, 2순위: llm-bridge `:8443/:8999`, 3순위: 프로필 기반 지능형 합성) ── */
    function callConciergeLLM(mode, systemPrompt, userPrompt, fallbackFn) {
      var t0 = Date.now();
      /* 1) Firebase Cloud Function `aiConcierge` 호출 (모바일·외부망·인앱 브라우저 100% 지원) */
      var cfPromise = (typeof callFn === 'function')
        ? callFn('aiConcierge', { mode: mode, system: systemPrompt, prompt: userPrompt }).then(function (r) {
            var d = (r && r.data) ? r.data : r;
            if (d && d.ok && d.reply) {
              return { ok: true, reply: String(d.reply).trim(), model: d.model || 'qwen3.8-27b', latencyMs: d.latencyMs || (Date.now() - t0), via: 'cloud' };
            }
            throw new Error('empty cf reply');
          })
        : Promise.reject(new Error('no callFn'));

      return cfPromise.catch(function () {
        /* 2) 로컬/Tailscale 관제판 `llm-bridge` 호출 */
        function tryTower(idx) {
          if (idx >= TOWER_URLS.length) {
            var fbText = typeof fallbackFn === 'function' ? fallbackFn() : '';
            return Promise.resolve({ ok: true, reply: fbText, model: 'context-synth', latencyMs: Date.now() - t0, via: 'synth' });
          }
          var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var tm = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
          return fetch(TOWER_URLS[idx], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'groq', model: 'qwen/qwen3.8-27b', task: 'bridge-' + mode, system: systemPrompt, prompt: userPrompt }),
            signal: ctl ? ctl.signal : undefined
          }).then(function (r) {
            if (tm) clearTimeout(tm);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          }).then(function (j) {
            if (j && j.ok && j.reply) {
              var cleaned = String(j.reply).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
              return { ok: true, reply: cleaned, model: j.model || 'qwen3.8-27b', latencyMs: Date.now() - t0, via: 'bridge' };
            }
            throw new Error('empty tower');
          }).catch(function () {
            if (tm) clearTimeout(tm);
            return tryTower(idx + 1);
          });
        }
        return tryTower(0);
      });
    }

    /* ── 유틸: 프로필 요약 문자열 및 키워드 추출 ── */
    function ageOf(entry) {
      if (!entry || !entry.birthYear) return '';
      var y = parseInt(entry.birthYear, 10);
      if (!y) return '';
      return String(y).slice(-2) + '년생(' + (new Date().getFullYear() - y) + '세)';
    }

    function profileSummary(entry, label) {
      if (!entry) return label + ': (아직 로그인/등록된 프로필 없음)';
      var parts = [];
      if (entry.nickname) parts.push('닉네임: ' + entry.nickname);
      if (entry.gender) parts.push('성별: ' + (entry.gender === 'F' ? '여성' : '남성'));
      if (entry.birthYear) parts.push('나이: ' + ageOf(entry));
      if (entry.region) parts.push('지역: ' + entry.region);
      if (entry.workplace) parts.push('하는 일: ' + entry.workplace);
      if (entry.height) parts.push('키: ' + entry.height + 'cm');
      if (entry.intro) parts.push('자기소개: ' + entry.intro);
      if (entry.idealType) parts.push('원하는 이상형: ' + entry.idealType);
      if (entry.dealbreaker) parts.push('피하고 싶은 조건: ' + entry.dealbreaker);
      return '[' + label + ']\n' + parts.join('\n');
    }

    function shortContextLabel(me, target) {
      var mBits = [];
      if (me) {
        if (me.birthYear) mBits.push(String(me.birthYear).slice(-2) + '년생');
        if (me.region) mBits.push(me.region.split(/\s+/)[0]);
        if (me.workplace) mBits.push(me.workplace.slice(0, 8));
      }
      var tBits = [];
      if (target) {
        if (target.birthYear) tBits.push(String(target.birthYear).slice(-2) + '년생');
        if (target.region) tBits.push(target.region.split(/\s+/)[0]);
        if (target.workplace) tBits.push(target.workplace.slice(0, 8));
      }
      if (me && target) {
        return '<b>' + escapeHtml(me.nickname || '나') + '</b>(' + escapeHtml(mBits.join('·') || '내 프로필') + ') × <b>' +
               escapeHtml(target.nickname || '상대방') + '</b>(' + escapeHtml(tBits.join('·') || '상대 프로필') + ') 실제 프로필 대조 분석';
      }
      if (target) {
        return '<b>' + escapeHtml(target.nickname || '상대방') + '</b>님의 소개글·선호 조건 맥락 반영';
      }
      return '내가 입력한 프로필 정보와 선택한 키워드 맥락 반영';
    }

    /* 타이핑 스트리밍 애니메이션 */
    function streamText(el, fullText, speedMs) {
      if (!el) return;
      var step = Math.max(2, Math.ceil((fullText || '').length / 45));
      var i = 0;
      el.textContent = '';
      var iv = setInterval(function () {
        i += step;
        if (i >= fullText.length) {
          el.textContent = fullText;
          clearInterval(iv);
        } else {
          el.textContent = fullText.slice(0, i);
        }
      }, speedMs || 16);
    }

    function parseNumberedBlocks(raw) {
      var cleaned = String(raw || '').replace(/\*\*/g, '').trim();
      var blocks = cleaned.split(/(?=(?:①|②|③|1[\.\)]|2[\.\)]|3[\.\)]|\[버전\s*\d|\[추천\s*\d))/g)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 8; });
      if (blocks.length >= 2) {
        return blocks.slice(0, 3).map(function (b, idx) {
          var firstLineEnd = b.indexOf('\n');
          var title = '추천 ' + (idx + 1);
          var body = b;
          if (firstLineEnd > 0 && firstLineEnd < 38) {
            title = b.slice(0, firstLineEnd).replace(/^[①②③123\.\)\-\s\[]+|[\]]+$/g, '').trim() || title;
            body = b.slice(firstLineEnd + 1).trim();
          } else {
            body = b.replace(/^[①②③123\.\)\-\s]+/, '').trim();
          }
          body = body.replace(/^["'“”]+|["'“”]+$/g, '').trim();
          return { title: title, text: body };
        });
      }
      var paras = cleaned.split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (paras.length >= 2) {
        return paras.slice(0, 3).map(function (p, i) {
          return { title: '추천 문구 ' + (i + 1), text: p.replace(/^["'“”]+|["'“”]+$/g, '').trim() };
        });
      }
      return [{ title: 'AI 컨시어지 추천 문구', text: cleaned.replace(/^["'“”]+|["'“”]+$/g, '').trim() }];
    }

    /* ── 3. 터치포인트 ①: 신청서 작성 & 프로필 수정 (#entry-form) ── */
    var INTRO_KEYWORDS = [
      '☕ 카페·드립커피', '🌿 주말 산책·피크닉', '🎨 전시회·문화생활', '🏋️ 운동·자기관리',
      '🍳 요리·맛집탐방', '✈️ 여행·드라이브', '💬 다정하고 깊은 대화', '🐶 유머·웃음이 많음',
      '📚 독서·차분한 일상', '🍷 분위기 좋은 반주', '🎬 영화·OTT 정주행', '🏡 집순이·집돌이 힐링'
    ];
    var _selectedIntroKws = ['☕ 카페·드립커피', '🌿 주말 산책·피크닉', '💬 다정하고 깊은 대화'];
    var _selectedIntroTone = '다정하고 따뜻한 톤';
    var _introAtelierOpen = false;

    function readCurrentFormContext() {
      var form = document.getElementById('entry-form');
      if (!form) return {};
      var gEl = form.querySelector('[name="gender"]:checked');
      return {
        nickname: ((form.querySelector('[name="nickname"]') || {}).value || '').trim(),
        gender: gEl ? gEl.value : '',
        birthYear: ((form.querySelector('[name="birthYear"]') || {}).value || '').trim(),
        region: ((form.querySelector('[name="region"]') || {}).value || '').trim(),
        workplace: ((form.querySelector('[name="workplace"]') || {}).value || '').trim(),
        height: ((form.querySelector('[name="height"]') || {}).value || '').trim(),
        intro: ((form.querySelector('[name="intro"]') || {}).value || '').trim(),
        idealType: ((form.querySelector('[name="idealType"]') || {}).value || '').trim(),
        dealbreaker: ((form.querySelector('[name="dealbreaker"]') || {}).value || '').trim()
      };
    }

    function enhanceEntryForm() {
      var form = document.getElementById('entry-form');
      if (!form) return;
      var introTa = form.querySelector('#f-intro');
      if (introTa && !form.querySelector('#bai-intro-bar')) {
        var fieldEl = introTa.closest('.field');
        var bar = document.createElement('div');
        bar.id = 'bai-intro-bar';
        bar.className = 'bai-trigger-bar';
        bar.innerHTML =
          '<span style="font-size:0.78rem;color:var(--muted);">막막할 땐 키워드만 고르거나 초안을 다듬어 보세요</span>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button type="button" class="bai-pill-btn" id="bai-open-intro-atelier"><i class="bai-sparkle">✦</i> AI 자기소개 아틀리에</button>' +
            '<button type="button" class="bai-pill-btn" id="bai-polish-intro"><i class="bai-sparkle">✦</i> 쓴 글 호감 가게 다듬기</button>' +
          '</div>';
        var panel = document.createElement('div');
        panel.id = 'bai-intro-atelier-panel';
        panel.style.display = _introAtelierOpen ? 'block' : 'none';

        fieldEl.insertBefore(bar, introTa);
        fieldEl.insertBefore(panel, introTa);

        function renderIntroAtelier() {
          var fctx = readCurrentFormContext();
          var ctxSummary = [
            fctx.birthYear ? fctx.birthYear.slice(-2) + '년생' : '',
            fctx.region || '',
            fctx.workplace || ''
          ].filter(Boolean).join(' · ') || '입력 중인 내 프로필';

          var kwHtml = INTRO_KEYWORDS.map(function (kw) {
            var on = _selectedIntroKws.indexOf(kw) >= 0;
            return '<button type="button" class="bai-kw-chip' + (on ? ' on' : '') + '" data-kw="' + escapeHtml(kw) + '">' + escapeHtml(kw) + '</button>';
          }).join('');

          var tones = ['다정하고 따뜻한 톤', '담백하고 진솔한 톤', '센스 있고 유쾌한 톤', '주선자가 친구 칭찬하는 톤'];
          var toneHtml = tones.map(function (t) {
            var on = _selectedIntroTone === t;
            return '<button type="button" class="bai-tone-btn' + (on ? ' on' : '') + '" data-tone="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>';
          }).join('');

          panel.innerHTML =
            '<div class="bai-salon-box">' +
              '<div class="bai-salon-head">' +
                '<div class="bai-salon-title"><i class="bai-sparkle">✦</i> 베니 AI 프로필 아틀리에 <span class="bai-salon-badge">SALON CONCIERGE</span></div>' +
                '<button type="button" class="bai-salon-close" id="bai-intro-close" title="닫기">×</button>' +
              '</div>' +
              '<div class="bai-context-strip">✦ 반영할 내 정보: <b>' + escapeHtml(ctxSummary) + '</b> (실명·연락처는 절대 포함되지 않아요)</div>' +
              '<div style="font-size:0.78rem;font-weight:700;color:var(--ink);margin-bottom:5px;">1. 나의 매력·일상 키워드 선택 (여러 개 가능)</div>' +
              '<div class="bai-chip-group" id="bai-intro-kws">' + kwHtml + '</div>' +
              '<input type="text" id="bai-intro-extra" placeholder="추가하고 싶은 특징 (예: 비흡연, ENFP, 테니스, 강아지 키움)" style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);font:inherit;font-size:0.82rem;margin-bottom:8px;" />' +
              '<div style="font-size:0.78rem;font-weight:700;color:var(--ink);margin-bottom:4px;">2. 원하는 문체(분위기) 선택</div>' +
              '<div class="bai-tone-row" id="bai-intro-tones">' + toneHtml + '</div>' +
              '<button type="button" class="bai-pill-btn active" id="bai-intro-generate" style="width:100%;justify-content:center;padding:9px 14px;font-size:0.86rem;margin-top:4px;"><i class="bai-sparkle">✦</i> 내 맞춤 자기소개 3가지 버전 짓기</button>' +
              '<div id="bai-intro-results"></div>' +
            '</div>';

          Array.prototype.forEach.call(panel.querySelectorAll('[data-kw]'), function (btn) {
            btn.onclick = function () {
              var k = btn.getAttribute('data-kw');
              var idx = _selectedIntroKws.indexOf(k);
              if (idx >= 0) _selectedIntroKws.splice(idx, 1);
              else _selectedIntroKws.push(k);
              btn.classList.toggle('on', _selectedIntroKws.indexOf(k) >= 0);
            };
          });
          Array.prototype.forEach.call(panel.querySelectorAll('[data-tone]'), function (btn) {
            btn.onclick = function () {
              _selectedIntroTone = btn.getAttribute('data-tone');
              Array.prototype.forEach.call(panel.querySelectorAll('[data-tone]'), function (b) {
                b.classList.toggle('on', b.getAttribute('data-tone') === _selectedIntroTone);
              });
            };
          });
          panel.querySelector('#bai-intro-close').onclick = function () {
            _introAtelierOpen = false;
            panel.style.display = 'none';
          };
          panel.querySelector('#bai-intro-generate').onclick = function () {
            runIntroGeneration(false);
          };
        }

        function runIntroGeneration(isPolishOnly) {
          var fctx = readCurrentFormContext();
          if (!_introAtelierOpen) {
            _introAtelierOpen = true;
            panel.style.display = 'block';
            renderIntroAtelier();
          }
          var resBox = panel.querySelector('#bai-intro-results');
          if (!resBox) return;
          var extraKw = ((panel.querySelector('#bai-intro-extra') || {}).value || '').trim();
          var allKws = _selectedIntroKws.concat(extraKw ? [extraKw] : []).join(', ') || '주말 산책, 커피, 진솔한 대화';

          resBox.innerHTML =
            '<div class="bai-shimmer-loading" style="margin-top:10px;">' +
              '<i class="bai-sparkle">✦</i>' +
              '<span>베니 AI 컨시어지가 <b>' + escapeHtml(_selectedIntroTone) + '</b>으로 자기소개 문장을 세공하고 있어요…</span>' +
            '</div>';

          var sys = '당신은 프라이빗 지인 소개팅 살롱 [베니브릿지]의 수석 프로필 에디터입니다. ' +
                    '회원의 나이·지역·직업·키워드를 자연스럽게 녹여 상대방이 읽었을 때 꼭 만나보고 싶게 만드는 매력적인 한국어 자기소개글 3가지 버전을 작성하세요. ' +
                    '각 버전은 90~180자 내외로 작성하고, 반드시 ① [버전 제목]\\n본문\\n\\n② [버전 제목]\\n본문\\n\\n③ [버전 제목]\\n본문 형식으로만 출력하세요.';
          var uPrompt =
            '[회원 기본 정보]\n' +
            '- 성별: ' + (fctx.gender === 'F' ? '여성' : (fctx.gender === 'M' ? '남성' : '미정')) + '\n' +
            '- 출생연도: ' + (fctx.birthYear || '미입력') + '\n' +
            '- 거주/활동 지역: ' + (fctx.region || '미입력') + '\n' +
            '- 하는 일/직업: ' + (fctx.workplace || '미입력') + '\n' +
            '- 선택한 매력 키워드: ' + allKws + '\n' +
            '- 요청 문체: ' + _selectedIntroTone + '\n' +
            (fctx.intro ? ('- 현재 작성 중인 초안: ' + fctx.intro + '\n') : '') +
            (isPolishOnly && fctx.intro
              ? '\n위 [현재 작성 중인 초안]의 핵심 내용은 살리면서 더 호감 가고 세련된 3가지 버전(① 다정하고 따뜻한 버전, ② 담백하고 신뢰감 있는 버전, ③ 센스 있고 여운 남는 버전)으로 다듬어 주세요.'
              : '\n위 정보를 바탕으로 베니브릿지 자기소개 칸에 바로 넣을 수 있는 자연스러운 3가지 버전을 작성해 주세요.');

          callConciergeLLM('profile_atelier', sys, uPrompt, function () {
            var jobBit = fctx.workplace ? (fctx.workplace + ' 쪽에서 일하며 ') : '평일엔 맡은 일에 집중하며 ';
            var regBit = fctx.region ? (fctx.region + ' 인근에서 ') : '';
            return '① [따뜻하고 진솔한 감성]\n' +
              '안녕하세요 😊 ' + jobBit + '일상의 작은 여유를 소중히 가꾸고 있어요. 주말이면 ' + regBit + allKws + ' 등을 즐기며 에너지를 채우곤 합니다. 서로의 하루를 다정하게 나누며 편안하게 발맞추어 걸을 수 있는 분을 만나고 싶어요.\n\n' +
              '② [담백하고 신뢰감 있는 스타일]\n' +
              '반갑습니다! ' + jobBit + '꾸준히 자기관리를 이어가고 있는 사람입니다. 평소 ' + allKws + ' 시간을 좋아하고, 대화할 때 상대방의 이야기를 잘 들어주는 편이에요. 함께 맛있는 식사를 하고 산책하며 자연스럽게 웃을 수 있는 좋은 인연을 기대합니다.\n\n' +
              '③ [센스 있고 설레는 버전]\n' +
              '혼자 보내는 주말도 좋지만, 이제는 좋은 분과 ' + allKws + ' 취향을 함께 나누고 싶어 용기 내어 등록했어요 ✨ 거창한 특별함보다 사소한 일상에서도 대화가 잘 통하고 웃음 코드가 맞는 분이라면 언제든 편하게 말 걸어주세요!';
          }).then(function (res) {
            var items = parseNumberedBlocks(res.reply);
            resBox.innerHTML =
              '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px;font-size:0.74rem;color:var(--muted);">' +
                '<span>✦ 마음에 드는 문구를 골라 바로 채운 뒤 내 말투로 살짝 다듬어 보세요</span>' +
                '<span class="bai-salon-badge">' + escapeHtml(res.model || 'AI') + ' · ' + ((res.latencyMs || 400) / 1000).toFixed(1) + 's</span>' +
              '</div>' +
              '<div class="bai-option-list"></div>';
            var listEl = resBox.querySelector('.bai-option-list');
            items.forEach(function (it, idx) {
              var card = document.createElement('div');
              card.className = 'bai-option-card';
              card.innerHTML =
                '<div class="bai-option-tag">✦ ' + escapeHtml(it.title || ('추천 버전 ' + (idx + 1))) + '</div>' +
                '<div class="bai-option-text"></div>' +
                '<div class="bai-option-foot">' +
                  '<button type="button" class="bai-use-btn">✍️ 이 문구로 자기소개 채우기</button>' +
                '</div>';
              listEl.appendChild(card);
              streamText(card.querySelector('.bai-option-text'), it.text, 12);
              card.querySelector('.bai-use-btn').onclick = function () {
                introTa.value = it.text;
                introTa.dispatchEvent(new Event('input', { bubbles: true }));
                if (typeof updateCharCounts === 'function') updateCharCounts(form);
                introTa.focus();
                introTa.classList.add('notif-flash');
                setTimeout(function () { introTa.classList.remove('notif-flash'); }, 1800);
              };
            });
          });
        }

        if (_introAtelierOpen) renderIntroAtelier();

        bar.querySelector('#bai-open-intro-atelier').onclick = function () {
          _introAtelierOpen = !_introAtelierOpen;
          panel.style.display = _introAtelierOpen ? 'block' : 'none';
          if (_introAtelierOpen) renderIntroAtelier();
        };
        bar.querySelector('#bai-polish-intro').onclick = function () {
          runIntroGeneration(true);
        };
      }

      /* 이상형(#f-idealtype) 및 피하고 싶은 조건(#f-dealbreaker) 원클릭 다듬기 버튼 */
      ['f-idealtype', 'f-dealbreaker'].forEach(function (fid) {
        var ta = form.querySelector('#' + fid);
        if (!ta || form.querySelector('#bai-bar-' + fid)) return;
        var isIdeal = fid === 'f-idealtype';
        var fWrap = ta.closest('.field');
        var miniBar = document.createElement('div');
        miniBar.id = 'bai-bar-' + fid;
        miniBar.className = 'bai-trigger-bar';
        miniBar.innerHTML =
          '<span style="font-size:0.76rem;color:var(--muted);">' + (isIdeal ? '키워드만 적고 눌러도 호감 가는 문장으로 완성해 드려요' : '까칠해 보이지 않게 부드럽고 예의 바른 표현으로 다듬어 드려요') + '</span>' +
          '<button type="button" class="bai-pill-btn"><i class="bai-sparkle">✦</i> ' + (isIdeal ? 'AI 이상형 문장 다듬기' : 'AI 부드러운 표현으로 다듬기') + '</button>';
        var outBox = document.createElement('div');
        fWrap.insertBefore(miniBar, ta);
        fWrap.insertBefore(outBox, ta);

        miniBar.querySelector('button').onclick = function () {
          var curVal = (ta.value || '').trim();
          var fctx = readCurrentFormContext();
          outBox.innerHTML = '<div class="bai-shimmer-loading" style="margin-bottom:8px;"><i class="bai-sparkle">✦</i><span>베니 AI가 호감 가는 표현으로 정돈하고 있어요…</span></div>';
          var sys = '당신은 지인 소개팅 서비스 [베니브릿지]의 프로필 컨시어지입니다. 상대방이 읽었을 때 예의 바르고 호감이 느껴지도록 2가지 버전(① 부드러운 문장형, ② 깔끔한 포인트형)을 각각 40~110자 내외로 작성하세요. 형식: ① [부드러운 문장형]\\n본문\\n\\n② [깔끔한 포인트형]\\n본문';
          var prompt = isIdeal
            ? ('내 자기소개: ' + (fctx.intro || '비흡연, 다정한 일상 선호') + '\n현재 이상형 입력값: ' + (curVal || '다정하고 대화가 잘 통하는 분, 비흡연, 자기관리 잘하는 분') + '\n위 내용을 바탕으로 [원하는 이성 조건] 칸에 들어갈 자연스럽고 매력적인 문구 2가지를 추천해 주세요.')
            : ('현재 피하고 싶은 조건 입력값: ' + (curVal || '흡연, 연락 두절, 감정 기복 심한 분') + '\n프로필에서 너무 공격적이거나 까다로워 보이지 않으면서도 정중하고 명확하게 선호 기준을 전달하는 [피하고 싶은 조건] 문구 2가지를 추천해 주세요.');
          callConciergeLLM('profile_atelier', sys, prompt, function () {
            return isIdeal
              ? '① [부드러운 문장형]\n서로의 일상을 존중하며 다정하게 대화를 나눌 수 있는 분이면 좋겠습니다. 비흡연자이시고 함께 건강한 자기관리를 이어갈 수 있는 따뜻한 분을 기다려요.\n\n② [깔끔한 포인트형]\n비흡연 · 긍정적인 대화 결 · 약속과 연락에 성실하고 웃음 코드가 잘 맞는 분'
              : '① [정중하고 부드러운 표현]\n비흡연자분을 선호하며, 서로의 시간과 연락 템포를 배려해 주시는 분과 편안하게 만나고 싶어요 (종교 강요나 과음은 정중히 사양합니다).\n\n② [깔끔한 매너형]\n흡연 · 잦은 연락 두절 · 기본적인 예의나 감정 조절이 어려우신 분은 피하고 싶어요.';
          }).then(function (res) {
            var items = parseNumberedBlocks(res.reply);
            outBox.innerHTML = '<div class="bai-salon-box" style="margin-bottom:8px;"><div class="bai-salon-head"><div class="bai-salon-title"><i class="bai-sparkle">✦</i> 추천 표현 선택</div><button type="button" class="bai-salon-close">×</button></div><div class="bai-option-list"></div></div>';
            outBox.querySelector('.bai-salon-close').onclick = function () { outBox.innerHTML = ''; };
            var lEl = outBox.querySelector('.bai-option-list');
            items.forEach(function (it) {
              var c = document.createElement('div');
              c.className = 'bai-option-card';
              c.innerHTML = '<div class="bai-option-tag">✦ ' + escapeHtml(it.title) + '</div><div class="bai-option-text">' + escapeHtml(it.text) + '</div><div class="bai-option-foot"><button type="button" class="bai-use-btn">✍️ 적용하기</button></div>';
              c.querySelector('.bai-use-btn').onclick = function () {
                ta.value = it.text;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                if (typeof updateCharCounts === 'function') updateCharCounts(form);
                outBox.innerHTML = '';
              };
              lEl.appendChild(c);
            });
          });
        };
      });
    }

    /* ── 4. 터치포인트 ②: 명단 프로필 카드 ✦ AI 주선자 케미 리포트 ── */
    var _chemCache = {};       /* pairKey -> { tags, body, opener, model, latencyMs } */
    var _chemOpenMap = {};     /* targetId -> boolean */
    var _prefillReqNote = '';  /* 케미 카드에서 바로 대화 신청 누를 때 자동 전달할 인사말 */

    function parseChemistryReply(raw, me, target) {
      var text = String(raw || '').replace(/\*\*/g, '').trim();
      var tags = [];
      var tagMatch = text.match(/#[^\s#,\n]+/g);
      if (tagMatch && tagMatch.length) {
        tags = tagMatch.slice(0, 4);
      } else {
        tags = ['#일상공감', '#대화결_매칭', '#베니AI_추천'];
      }
      var lines = text.split(/\n+/).map(function (l) { return l.trim(); }).filter(function (l) {
        return l && !/^(\[?태그|\[?키워드|#[^\s]+(\s+#[^\s]+)*$)/.test(l);
      });
      var opener = '';
      var bodyLines = [];
      lines.forEach(function (l) {
        if (/^(추천\s*첫인사|첫인사\s*팁|대화\s*팁|💬|💌)/.test(l) || (!opener && l.indexOf('"') >= 0 && l.length < 130)) {
          opener = l.replace(/^(추천\s*첫인사|첫인사\s*팁|대화\s*팁|💬|💌)\s*[:：\-]?\s*/, '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
        } else {
          bodyLines.push(l.replace(/^(케미\s*분석|주선자\s*코멘트|분석)\s*[:：\-]?\s*/, ''));
        }
      });
      var body = bodyLines.join(' ').trim() || text;
      if (!opener) {
        opener = '안녕하세요 ' + (target && target.nickname ? target.nickname + '님! ' : '') + '프로필에서 따뜻한 일상과 가치관이 느껴져 반가운 마음에 대화 신청드려요 😊';
      }
      return { tags: tags, body: body, opener: opener };
    }

    function enhanceRosterCards() {
      var state = typeof currentState !== 'undefined' ? currentState : null;
      if (!state || !Array.isArray(state.entries)) return;
      var me = (typeof findMyEntry === 'function') ? findMyEntry(state) : null;
      var cards = document.querySelectorAll('article.pf-card[data-id]');

      Array.prototype.forEach.call(cards, function (card) {
        var tid = card.getAttribute('data-id');
        if (!tid || card.querySelector('.bai-chem-wrap')) return;
        if (me && me.id === tid) return; /* 내 카드에는 표시 안 함 */
        var target = state.entries.find(function (e) { return e.id === tid; });
        if (!target || target.deactivated) return;

        var actionsEl = card.querySelector('.pf-actions');
        var bodyEl = card.querySelector('.pf-body');
        if (!bodyEl) return;

        var wrap = document.createElement('div');
        wrap.className = 'bai-chem-wrap';
        wrap.innerHTML =
          '<button type="button" class="bai-chem-btn"><i class="bai-sparkle">✦</i> <span>나와 어떤 점이 잘 맞을까요? · <b>AI 주선자 케미 분석</b></span></button>' +
          '<div class="bai-chem-panel" style="display:none;"></div>';

        if (actionsEl && actionsEl.parentNode === card) {
          card.insertBefore(wrap, actionsEl);
        } else {
          bodyEl.appendChild(wrap);
        }

        var btn = wrap.querySelector('.bai-chem-btn');
        var panel = wrap.querySelector('.bai-chem-panel');
        var cacheKey = (me ? me.id : 'guest') + '__' + tid;

        function renderChemResult(data) {
          var tagsHtml = (data.tags || []).map(function (tg) {
            return '<span class="bai-chem-tag">✦ ' + escapeHtml(tg) + '</span>';
          }).join('');
          panel.innerHTML =
            '<div class="bai-salon-box" style="margin-top:8px;margin-bottom:4px;">' +
              '<div class="bai-salon-head">' +
                '<div class="bai-salon-title"><i class="bai-sparkle">✦</i> AI 주선자의 케미 귓속말 <span class="bai-salon-badge">' + escapeHtml(data.model || 'AI') + '</span></div>' +
                '<button type="button" class="bai-salon-close" title="접기">×</button>' +
              '</div>' +
              '<div class="bai-context-strip">✦ ' + shortContextLabel(me, target) + '</div>' +
              '<div class="bai-chem-tags">' + tagsHtml + '</div>' +
              '<div class="bai-option-text" style="margin-bottom:10px;">' + escapeHtml(data.body) + '</div>' +
              '<div style="background:var(--card);border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:0.82rem;">' +
                '<div style="font-weight:700;color:var(--accent);font-size:0.75rem;margin-bottom:3px;">💌 이 분께 추천하는 첫인사 오프너</div>' +
                '<div style="color:var(--ink);margin-bottom:7px;">“' + escapeHtml(data.opener) + '”</div>' +
                '<div style="display:flex;justify-content:flex-end;">' +
                  '<button type="button" class="bai-use-btn" data-chem-apply="1">💌 이 인사말로 대화 신청하기</button>' +
                '</div>' +
              '</div>' +
            '</div>';
          panel.querySelector('.bai-salon-close').onclick = function () {
            _chemOpenMap[tid] = false;
            panel.style.display = 'none';
            btn.style.display = 'flex';
          };
          var applyBtn = panel.querySelector('[data-chem-apply]');
          if (applyBtn) {
            applyBtn.onclick = function () {
              _prefillReqNote = data.opener;
              if (typeof handleRequest === 'function') {
                handleRequest(tid, 'contact');
              }
            };
          }
        }

        function triggerChem() {
          _chemOpenMap[tid] = true;
          btn.style.display = 'none';
          panel.style.display = 'block';
          if (_chemCache[cacheKey]) {
            renderChemResult(_chemCache[cacheKey]);
            return;
          }
          panel.innerHTML =
            '<div class="bai-shimmer-loading" style="margin-top:8px;">' +
              '<i class="bai-sparkle">✦</i>' +
              '<span>베니 AI가 <b>' + escapeHtml((me && me.nickname) || '회원') + '</b>님과 <b>' + escapeHtml(target.nickname || '상대') + '</b>님의 프로필 연결고리를 분석하고 있어요…</span>' +
            '</div>';

          var sys = '당신은 지인 기반 소개팅 살롱 [베니브릿지]의 다정하고 통찰력 있는 수석 매칭 주선자입니다. ' +
                    '두 사람의 프로필을 실제로 비교해 왜 잘 어울리는지 구체적인 취미·지역·가치관 구절을 짚어 설명하세요. ' +
                    '형식:\n#공통점태그1 #공통점태그2 #케미태그3\n주선자 코멘트: (2~3문장으로 두 사람의 잘 맞는 포인트를 따뜻하게 설명)\n추천 첫인사: (상대 프로필 내용을 자연스럽게 언급하는 45~90자 첫인사 문장)';
          var uPrompt = profileSummary(me, '내 프로필') + '\n\n' + profileSummary(target, '상대방 프로필') +
                        '\n\n두 사람의 프로필을 대조해 공통점/보완점 태그 3개, 주선자 코멘트 2~3문장, 그리고 상대방에게 보낼 자연스러운 추천 첫인사 1문장을 작성해 주세요.';

          callConciergeLLM('chemistry', sys, uPrompt, function () {
            var tIntro = (target.intro || '따뜻한 일상').slice(0, 28);
            return '#가치관_공명 #자연스러운_대화결 #주말일상_케미\n' +
              '주선자 코멘트: ' + (target.nickname || '상대') + '님이 소개글에 적어주신 "' + tIntro + '…" 부분과 안정적이고 다정한 만남을 추구하는 결이 무척 잘 맞닿아 있어요. 서로의 일상을 편안하게 공유하며 대화를 넓혀가기에 좋은 조합입니다.\n' +
              '추천 첫인사: 안녕하세요 ' + (target.nickname || '') + '님 😊 프로필에서 따뜻한 여유와 진솔한 분위기가 느껴져 반가운 마음에 대화 신청드립니다. 주말엔 주로 어떻게 시간 보내시는지 궁금해요!';
          }).then(function (res) {
            var parsed = parseChemistryReply(res.reply, me, target);
            parsed.model = res.model;
            parsed.latencyMs = res.latencyMs;
            _chemCache[cacheKey] = parsed;
            renderChemResult(parsed);
          });
        }

        btn.onclick = triggerChem;
        if (_chemOpenMap[tid] && _chemCache[cacheKey]) {
          btn.style.display = 'none';
          panel.style.display = 'block';
          renderChemResult(_chemCache[cacheKey]);
        }
      });
    }

    /* ── 5. 터치포인트 ③: 사진 보기 요청 / 대화 신청 모달 (#modal-note) ✦ 상대 맞춤 첫 인사말 컨시어지 ── */
    var _lastReqTargetId = null;
    var _lastReqType = 'contact';

    if (typeof handleRequest === 'function') {
      var _origHandleRequest = handleRequest;
      handleRequest = function (toId, type) {
        _lastReqTargetId = toId;
        _lastReqType = type || 'contact';
        return _origHandleRequest.apply(this, arguments);
      };
    }

    function enhanceRequestNoteModal(noteTa) {
      if (!noteTa || noteTa.getAttribute('data-bai-bound') === '1') return;
      noteTa.setAttribute('data-bai-bound', '1');
      var modalBox = noteTa.closest('.modal-box');
      if (modalBox) {
        var ov = modalBox.closest('.modal-overlay');
        if (ov) ov.classList.add('wide-modal');
      }

      var state = typeof currentState !== 'undefined' ? currentState : null;
      var me = (state && typeof findMyEntry === 'function') ? findMyEntry(state) : null;
      var target = (state && state.entries && _lastReqTargetId)
        ? state.entries.find(function (e) { return e.id === _lastReqTargetId; })
        : null;
      var isPhoto = _lastReqType === 'photo';

      /* 케미 리포트에서 [💌 이 인사말로 대화 신청하기]로 넘어온 경우 즉시 채워줌 */
      if (_prefillReqNote) {
        noteTa.value = _prefillReqNote;
        noteTa.dispatchEvent(new Event('input', { bubbles: true }));
        _prefillReqNote = '';
      }

      var box = document.createElement('div');
      box.className = 'bai-salon-box';
      box.style.marginBottom = '10px';
      box.style.padding = '12px 14px';

      var targetHint = target
        ? ('<b>' + escapeHtml(target.nickname || '상대') + '</b>님의 소개글(' + escapeHtml((target.intro || target.idealType || '프로필').slice(0, 32)) + '…) 맞춤')
        : '상대방 프로필 맞춤';

      box.innerHTML =
        '<div class="bai-salon-head" style="margin-bottom:6px;">' +
          '<div class="bai-salon-title" style="font-size:0.88rem;"><i class="bai-sparkle">✦</i> AI 상대 맞춤 ' + (isPhoto ? '사진 요청' : '대화 신청') + ' 인사말 짓기</div>' +
          '<span class="bai-salon-badge">맞춤 3선</span>' +
        '</div>' +
        '<div style="font-size:0.76rem;color:var(--muted);margin-bottom:8px;">✦ ' + targetHint + '으로 뻔하지 않고 수락률을 높이는 인사말을 추천해 드려요</div>' +
        '<div class="bai-tone-row" style="margin:0 0 6px;">' +
          '<button type="button" class="bai-tone-btn" data-req-tone="다정하고 호감 가는 공감형">😊 다정·공감형</button>' +
          '<button type="button" class="bai-tone-btn" data-req-tone="담백하고 예의 바른 매너형">🌿 담백·매너형</button>' +
          '<button type="button" class="bai-tone-btn" data-req-tone="공통점 언급 + 자연스러운 질문형">✨ 공통점·질문형</button>' +
        '</div>' +
        '<div id="bai-req-note-out"></div>';

      noteTa.parentNode.insertBefore(box, noteTa);

      var outEl = box.querySelector('#bai-req-note-out');
      function generateNotes(toneLabel) {
        outEl.innerHTML =
          '<div class="bai-shimmer-loading" style="margin-top:6px;padding:10px;">' +
            '<i class="bai-sparkle">✦</i>' +
            '<span><b>' + escapeHtml((target && target.nickname) || '상대방') + '</b>님의 소개글과 내 프로필 접점을 엮어 인사말을 짓고 있어요…</span>' +
          '</div>';

        var sys = '당신은 프라이빗 지인 소개팅 살롱 [베니브릿지]의 매칭 컨시어지입니다. ' +
                  '보내는 사람과 받는 사람의 실제 프로필(취미, 가치관, 직무, 지역 등)을 자연스럽게 연결하여, 받는 사람이 읽자마자 기분 좋게 수락하고 싶어지는 ' +
                  (isPhoto ? '사진 공개 요청' : '대화 신청') + ' 메시지 3가지를 작성하세요. ' +
                  '각 메시지는 45~115자 내외로 작성하고, 형식은 ① [다정한 공감]\\n메시지\\n\\n② [자연스러운 공통점]\\n메시지\\n\\n③ [센스 있는 질문]\\n메시지 로만 출력하세요.';
        var uPrompt =
          profileSummary(me, '보내는 사람(나)') + '\n\n' +
          profileSummary(target, '받는 사람(상대방)') + '\n\n' +
          '요청 유형: ' + (isPhoto ? '사진 보기 요청 (수락 시 서로 사진 공개)' : '대화 신청 (수락 시 1:1 채팅 시작)') + '\n' +
          '선호 톤: ' + toneLabel + '\n' +
          '상대방의 자기소개에 있는 구체적인 키워드를 자연스럽게 언급하면서 부담스럽지 않고 진심이 느껴지는 신청 메시지 3가지를 작성해 주세요.';

        callConciergeLLM('first_note', sys, uPrompt, function () {
          var nick = (target && target.nickname) ? (target.nickname + '님, ') : '';
          var snippet = (target && target.intro) ? target.intro.slice(0, 18) : '따뜻한 일상';
          return '① [다정한 공감형]\n안녕하세요 ' + nick + '프로필에서 "' + snippet + '…" 이야기가 참 따뜻하게 느껴져 반가운 마음에 ' + (isPhoto ? '사진 요청' : '대화 신청') + '드려요. 편하게 봐주시면 기쁠 것 같습니다 😊\n\n' +
                 '② [담백한 매너형]\n반갑습니다 ' + nick + '소개글에 담긴 차분하고 성실한 분위기가 인상 깊어 용기 내어 노크해 봅니다. 좋은 인연으로 도란도란 이야기 나누어 보고 싶어요!\n\n' +
                 '③ [공통점 & 질문형]\n안녕하세요! 프로필을 읽다 보니 주말을 보내는 결이 비슷해 꼭 한 번 대화 나누어 보고 싶었어요 ✨ 요즘 가장 즐겨 하시는 취미가 무엇인지 궁금합니다.';
        }).then(function (res) {
          var items = parseNumberedBlocks(res.reply);
          outEl.innerHTML = '<div class="bai-option-list" style="margin-top:6px;"></div>';
          var list = outEl.querySelector('.bai-option-list');
          items.forEach(function (it) {
            var card = document.createElement('div');
            card.className = 'bai-option-card';
            card.style.padding = '9px 11px';
            card.style.cursor = 'pointer';
            card.innerHTML =
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">' +
                '<span class="bai-option-tag">✦ ' + escapeHtml(it.title) + '</span>' +
                '<span style="font-size:0.72rem;font-weight:700;color:var(--accent);">눌러서 바로 넣기 ↵</span>' +
              '</div>' +
              '<div class="bai-option-text" style="font-size:0.83rem;">' + escapeHtml(it.text) + '</div>';
            card.onclick = function () {
              noteTa.value = it.text.slice(0, 200);
              noteTa.dispatchEvent(new Event('input', { bubbles: true }));
              noteTa.focus();
              noteTa.classList.add('notif-flash');
              setTimeout(function () { noteTa.classList.remove('notif-flash'); }, 1500);
            };
            list.appendChild(card);
          });
        });
      }

      Array.prototype.forEach.call(box.querySelectorAll('[data-req-tone]'), function (btn) {
        btn.onclick = function () {
          Array.prototype.forEach.call(box.querySelectorAll('[data-req-tone]'), function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
          generateNotes(btn.getAttribute('data-req-tone'));
        };
      });
    }

    /* ── 6. 터치포인트 ④: 1:1 채팅방 (.chat-screen) ✦ AI 아이스브레이커 & 대화 토픽 위스퍼 ── */
    var _currentChatOtherId = null;
    if (typeof openDmChat === 'function') {
      var _origOpenDmChat = openDmChat;
      openDmChat = function (otherId) {
        _currentChatOtherId = otherId;
        var r = _origOpenDmChat.apply(this, arguments);
        setTimeout(function () { enhanceChatScreen(otherId); }, 60);
        return r;
      };
    }

    function enhanceChatScreen(otherId) {
      var scr = document.querySelector('.chat-screen');
      if (!scr || scr.querySelector('.bai-chat-bar')) return;
      var inputWrap = scr.querySelector('.chat-input');
      var dmTa = scr.querySelector('#dm-text');
      if (!inputWrap || !dmTa || dmTa.disabled) return;

      var state = typeof currentState !== 'undefined' ? currentState : null;
      var me = (state && typeof findMyEntry === 'function') ? findMyEntry(state) : null;
      var other = (state && state.entries && otherId) ? state.entries.find(function (e) { return e.id === otherId; }) : null;

      var drawer = document.createElement('div');
      drawer.className = 'bai-chat-drawer';
      drawer.style.display = 'none';

      var bar = document.createElement('div');
      bar.className = 'bai-chat-bar';
      bar.innerHTML =
        '<span style="font-weight:700;color:var(--ink);white-space:nowrap;"><i class="bai-sparkle">✦</i> AI 대화 위스퍼</span>' +
        '<button type="button" class="bai-chat-chip" data-ctopic="profile">💬 두 분 프로필 공통점 질문</button>' +
        '<button type="button" class="bai-chat-chip" data-ctopic="daily">☕ 주말·일상 스몰토크</button>' +
        '<button type="button" class="bai-chat-chip" data-ctopic="balance">🎲 센스있는 밸런스 질문</button>';

      inputWrap.parentNode.insertBefore(drawer, inputWrap);
      inputWrap.parentNode.insertBefore(bar, inputWrap);

      Array.prototype.forEach.call(bar.querySelectorAll('[data-ctopic]'), function (btn) {
        btn.onclick = function () {
          var topic = btn.getAttribute('data-ctopic');
          drawer.style.display = 'block';
          drawer.innerHTML = '<div class="bai-shimmer-loading" style="padding:9px;"><i class="bai-sparkle">✦</i><span>두 분의 프로필과 대화 흐름에 맞는 자연스러운 질문 3가지를 고르고 있어요…</span></div>';

          var recentMsgs = [];
          try {
            if (me && otherId && typeof dmThread === 'function') {
              var th = dmThread(state, me.id, otherId) || [];
              recentMsgs = th.slice(-5).map(function (m) {
                return (m.fromId === me.id ? '나: ' : '상대: ') + (m.text || '');
              });
            }
          } catch (e) {}

          var topicDesc = topic === 'profile'
            ? '두 사람의 자기소개·취미·직무·지역을 연결한 자연스러운 질문'
            : (topic === 'daily' ? '오늘 하루 안부, 주말 계획, 좋아하는 맛집·카페를 묻는 다정한 일상 스몰토크' : '가볍게 웃으며 취향을 알아볼 수 있는 센스 있는 연애·일상 밸런스 질문');

          var sys = '당신은 소개팅 1:1 채팅방의 대화 코치입니다. 상대방에게 부담 없이 보낼 수 있는 자연스러운 한국어 채팅 메시지 3가지를 각각 30~80자 내외로 추천하세요. 형식: ① [포인트]\\n메시지\\n\\n② [포인트]\\n메시지\\n\\n③ [포인트]\\n메시지';
          var uPrompt =
            profileSummary(me, '나') + '\n\n' +
            profileSummary(other, '상대방') + '\n\n' +
            (recentMsgs.length ? ('[최근 대화 흐름]\n' + recentMsgs.join('\n') + '\n\n') : '[최근 대화 흐름]\n아직 첫 대화 시작 전\n\n') +
            '요청 테마: ' + topicDesc + '\n바로 채팅창에 입력해 보낼 수 있는 자연스러운 문장 3가지를 추천해 주세요.';

          callConciergeLLM('chat_icebreaker', sys, uPrompt, function () {
            var oNick = (other && other.nickname) ? (other.nickname + '님은 ') : '';
            return '① [다정한 안부 & 일상]\n오늘 하루도 고생 많으셨어요 😊 ' + oNick + '퇴근 후나 주말에 에너지 충전할 때 주로 어떤 걸 하시는 편인가요?\n\n' +
                   '② [취향 & 맛집 토크]\n프로필 보면서 대화 결이 참 따뜻하실 것 같았어요! 요즘 가장 맛있게 드셨던 음식이나 아끼는 카페가 있으신지 궁금해요 ☕\n\n' +
                   '③ [가벼운 밸런스 질문]\n갑자기 궁금해진 건데, 주말 데이트로 [조용한 골목 카페 산책 vs 탁 트인 근교 드라이브] 중 어느 쪽이 더 끌리세요? ✨';
          }).then(function (res) {
            var items = parseNumberedBlocks(res.reply);
            drawer.innerHTML =
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:0.75rem;color:var(--muted);">' +
                '<span>✦ 나에게만 보이는 AI 추천 메시지 (탭하면 입력창에 들어가요)</span>' +
                '<button type="button" class="bai-salon-close" id="bai-chat-drawer-close">×</button>' +
              '</div>' +
              '<div class="bai-option-list" style="margin-top:0;"></div>';
            drawer.querySelector('#bai-chat-drawer-close').onclick = function () { drawer.style.display = 'none'; };
            var lEl = drawer.querySelector('.bai-option-list');
            items.forEach(function (it) {
              var c = document.createElement('div');
              c.className = 'bai-option-card';
              c.style.padding = '8px 10px';
              c.style.cursor = 'pointer';
              c.innerHTML =
                '<div style="font-size:0.72rem;font-weight:700;color:var(--accent);margin-bottom:2px;">✦ ' + escapeHtml(it.title) + ' · <span style="text-decoration:underline;">입력창에 넣기</span></div>' +
                '<div style="font-size:0.84rem;color:var(--ink);">' + escapeHtml(it.text) + '</div>';
              c.onclick = function () {
                dmTa.value = it.text;
                dmTa.dispatchEvent(new Event('input', { bubbles: true }));
                dmTa.focus();
                drawer.style.display = 'none';
              };
              lEl.appendChild(c);
            });
          });
        };
      });
    }

    /* ── 7. 화면 테마 · 글자 크기 살롱 시트 ('⚙️ 내 계정' 및 상단 바에 단정하게 통합) ── */
    function openThemeSalonModal() {
      var presetCards = Object.keys(PRESETS).map(function (k) {
        var p = PRESETS[k];
        return '<button type="button" data-preset="' + k + '" class="bai-option-card" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;cursor:pointer;padding:10px 12px;">' +
          '<div><div style="font-weight:700;font-size:0.88rem;color:var(--ink);">' + escapeHtml(p.name) + '</div><div style="font-size:0.75rem;color:var(--muted);">' + escapeHtml(p.desc) + '</div></div>' +
          '<span style="display:inline-flex;gap:5px;flex-shrink:0;">' +
            '<i style="width:18px;height:18px;border-radius:50%;background:' + p.paper + ';border:1px solid #ccc;display:inline-block;"></i>' +
            '<i style="width:18px;height:18px;border-radius:50%;background:' + p.accent + ';display:inline-block;"></i>' +
          '</span>' +
        '</button>';
      }).join('');

      var ov = openModal(
        '<div style="text-align:left;">' +
          '<div class="bai-salon-head" style="margin-bottom:10px;">' +
            '<div class="bai-salon-title" style="font-size:1.05rem;"><i class="bai-sparkle">✦</i> 화면 분위기 & 글자 크기 설정</div>' +
            '<button type="button" class="bai-salon-close" id="bai-theme-close">×</button>' +
          '</div>' +
          '<div style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;">내 기기에서 보이는 베니브릿지 종이 질감과 포인트 색상을 취향에 맞게 골라보세요.</div>' +
          '<div style="display:grid;gap:6px;margin-bottom:12px;">' + presetCards + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:0.82rem;font-weight:700;min-width:64px;">글자 크기</span>' +
            '<button type="button" data-fsz="normal" class="card-btn" style="flex:1;padding:7px;">기본 크기</button>' +
            '<button type="button" data-fsz="large" class="card-btn" style="flex:1;padding:7px;">크게 보기 🔍</button>' +
          '</div>' +
          '<div id="bai-theme-toast" style="font-size:0.78rem;color:var(--accent);font-weight:700;min-height:18px;text-align:center;"></div>' +
        '</div>'
      );
      ov.querySelector('#bai-theme-close').onclick = function () { closeModal(ov); };
      ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(ov); });
      Array.prototype.forEach.call(ov.querySelectorAll('[data-preset]'), function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-preset');
          var p = PRESETS[k];
          applyCustomTheme(k === 'default' ? { id: 'default' } : Object.assign({ id: k }, p));
          ov.querySelector('#bai-theme-toast').textContent = '✦ ' + p.name + ' 테마를 적용했어요.';
        };
      });
      Array.prototype.forEach.call(ov.querySelectorAll('[data-fsz]'), function (b) {
        b.onclick = function () {
          var sz = b.getAttribute('data-fsz');
          applyCustomFont(sz);
          ov.querySelector('#bai-theme-toast').textContent = sz === 'large' ? '🔍 글자 크기를 큼직하게 키웠어요.' : '기본 글자 크기로 되돌렸어요.';
        };
      });
    }

    /* '⚙️ 내 계정' 모달이 열릴 때 '🎨 화면 테마 · 글자 크기' 항목 자동 추가 */
    function enhanceAccountSheet(acctList) {
      if (!acctList || acctList.getAttribute('data-bai-acct') === '1') return;
      acctList.setAttribute('data-bai-acct', '1');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'acct-row';
      btn.innerHTML = '<span class="acct-ic">🎨</span><span class="acct-tx"><b>화면 테마 · 글자 크기</b><small>기본 로즈 · 라떼 · 다크 모드 · 큰 글씨 설정</small></span><span class="acct-go">›</span>';
      btn.onclick = function () {
        setTimeout(openThemeSalonModal, 60);
      };
      acctList.appendChild(btn);
    }

    /* 상단 헤더(.admin-bar-row)에도 깔끔한 '🎨 테마' 미니 링크 제공 (손님도 다크모드/라떼 테마 쓸 수 있게) */
    function enhanceHeaderBar() {
      var row = document.querySelector('.admin-bar-row');
      if (!row || row.querySelector('#bai-header-theme-btn')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'bai-header-theme-btn';
      b.className = 'admin-link';
      b.innerHTML = '🎨 테마';
      b.title = '화면 색상 테마 및 글자 크기 설정';
      b.onclick = openThemeSalonModal;
      row.insertBefore(b, row.firstChild);
    }

    /* ── 8. paint() 및 모달 감지 훅 (앱의 화면 다시 그리기 원칙 100% 준수) ── */
    function syncAllEnhancements() {
      enhanceHeaderBar();
      enhanceEntryForm();
      enhanceRosterCards();
      var noteTa = document.getElementById('modal-note');
      if (noteTa) enhanceRequestNoteModal(noteTa);
      var acctList = document.querySelector('.modal-overlay .acct-list');
      if (acctList) enhanceAccountSheet(acctList);
      if (_currentChatOtherId && document.querySelector('.chat-screen')) {
        enhanceChatScreen(_currentChatOtherId);
      }
    }

    if (typeof paint === 'function') {
      var _origPaint = paint;
      paint = function () {
        var r = _origPaint.apply(this, arguments);
        try { syncAllEnhancements(); } catch (e) {}
        return r;
      };
    }

    var obs = new MutationObserver(function () {
      try { syncAllEnhancements(); } catch (e) {}
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(syncAllEnhancements, 200);
  })();
