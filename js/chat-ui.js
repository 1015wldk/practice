/* 질문하기(챗봇)와 설정 화면. 순수 로직은 js/chat.js 에 있습니다. */
(function () {
  'use strict';

  const C = window.Chat;
  if (!C) return;

  // API 키와 설정은 일지 데이터(practicum-journal-v1)와 따로 저장합니다.
  // 그래서 백업 파일(.json)에는 키가 들어가지 않습니다.
  const SETTINGS_KEY = 'practicum-chat-settings-v1';
  const KEY_STORE = 'practicum-chat-apikey-v1';

  const SUGGESTIONS = [
    '사실과 해석은 어떻게 구분해서 쓰나요?',
    '소감·성찰은 어떻게 써야 해요?',
    '클라이언트 이름은 어떻게 적나요?',
    '15분 안에 쓰는 요령이 있을까요?'
  ];
  const GREETING = '안녕하세요! 실습일지 쓰는 방법을 물어보세요. 일지를 대신 써 드리지는 않지만, 어떻게 쓰면 좋을지 같이 생각해 드릴게요.';

  const $ = function (id) { return document.getElementById(id); };

  class UserError extends Error {}

  // ---------- 브라우저 저장소 (막혀 있어도 앱은 동작) ----------

  function getStore(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function readRaw(kind, key) {
    try { const s = getStore(kind); return s ? s.getItem(key) : null; } catch (e) { return null; }
  }
  function writeRaw(kind, key, value) {
    try { const s = getStore(kind); if (!s) return false; s.setItem(key, value); return true; } catch (e) { return false; }
  }
  function removeRaw(kind, key) {
    try { const s = getStore(kind); if (s) s.removeItem(key); } catch (e) { /* 무시 */ }
  }

  // ---------- 상태 ----------

  let settings = loadSettings();
  let apiKey = '';
  let keyWhere = ''; // 'local' | 'session' | 'memory' | ''
  loadKey();

  let history = [];       // 서버로 보내는 대화 [{role, content}]
  let busy = false;
  let controller = null;
  let lastQuestion = '';
  let lastUserEl = null;
  let warnedText = '';    // 개인정보 경고를 이미 보여 준 질문

  function loadSettings() {
    const base = {
      model: C.DEFAULT_MODEL,
      models: C.FALLBACK_MODELS.slice(),
      loadedAt: null,
      persistKey: true
    };
    try {
      const saved = JSON.parse(readRaw('localStorage', SETTINGS_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        if (typeof saved.model === 'string' && saved.model) base.model = saved.model;
        if (Array.isArray(saved.models) && saved.models.length) {
          const ok = saved.models.filter(function (m) { return m && typeof m.id === 'string'; })
            .map(function (m) { return { id: m.id, name: typeof m.name === 'string' ? m.name : m.id }; });
          if (ok.length) base.models = ok;
        }
        if (typeof saved.loadedAt === 'number') base.loadedAt = saved.loadedAt;
        if (typeof saved.persistKey === 'boolean') base.persistKey = saved.persistKey;
      }
    } catch (e) { /* 깨진 설정은 무시 */ }
    return base;
  }

  function saveSettings() {
    writeRaw('localStorage', SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadKey() {
    const local = readRaw('localStorage', KEY_STORE);
    const session = readRaw('sessionStorage', KEY_STORE);
    if (local) { apiKey = local; keyWhere = 'local'; }
    else if (session) { apiKey = session; keyWhere = 'session'; }
    else { apiKey = ''; keyWhere = ''; }
  }

  function modelName(id) {
    const m = settings.models.filter(function (x) { return x.id === id; })[0];
    return m ? m.name : id;
  }

  // ---------- 설정 화면 ----------

  function setStatus(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = 'small status' + (kind ? ' ' + kind : '');
  }

  function timeLabel(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function renderModelSelect() {
    const sel = $('set-model');
    sel.textContent = '';
    const list = settings.models.slice();
    if (!list.some(function (m) { return m.id === settings.model; })) {
      list.unshift({ id: settings.model, name: settings.model + ' (목록에 없음)' });
    }
    list.forEach(function (m) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name === m.id ? m.id : m.name + ' · ' + m.id;
      if (m.id === settings.model) o.selected = true;
      sel.appendChild(o);
    });
  }

  function renderSettings() {
    $('set-persist').checked = settings.persistKey;
    if (apiKey) {
      const where = keyWhere === 'local' ? '이 기기에 저장됨'
        : keyWhere === 'session' ? '이 탭에서만 사용(탭을 닫으면 삭제)'
        : '이 화면을 닫으면 사라짐(브라우저가 저장을 막고 있어요)';
      setStatus('set-key-status', '저장된 키: ' + C.maskKey(apiKey) + ' · ' + where, 'ok');
    } else {
      setStatus('set-key-status', '아직 저장된 키가 없어요.', '');
    }
    renderModelSelect();
    if (settings.loadedAt) {
      setStatus('set-models-status', '모델 ' + settings.models.length + '개 · ' + timeLabel(settings.loadedAt) + '에 불러옴', '');
    } else {
      setStatus('set-models-status', '기본 목록을 쓰고 있어요. 키를 저장한 뒤 ‘최신 모델 불러오기’를 눌러 갱신하세요.', '');
    }
  }

  function saveKeyFromInput() {
    const input = $('set-key');
    const res = C.checkKey(input.value);
    if (!res.ok) { setStatus('set-key-status', res.message, 'err'); input.focus(); return; }

    settings.persistKey = $('set-persist').checked;
    removeRaw('localStorage', KEY_STORE);
    removeRaw('sessionStorage', KEY_STORE);
    const where = settings.persistKey ? 'localStorage' : 'sessionStorage';
    const stored = writeRaw(where, KEY_STORE, res.key);
    apiKey = res.key;
    keyWhere = stored ? (settings.persistKey ? 'local' : 'session') : 'memory';
    saveSettings();

    input.value = '';
    input.type = 'password';
    $('set-key-toggle').textContent = '보기';
    $('set-key-toggle').setAttribute('aria-pressed', 'false');
    renderSettings();
    if (res.warn) setStatus('set-key-status', $('set-key-status').textContent + ' — ' + res.warn, 'warn');
    renderChatState();
  }

  function clearKey() {
    removeRaw('localStorage', KEY_STORE);
    removeRaw('sessionStorage', KEY_STORE);
    apiKey = '';
    keyWhere = '';
    $('set-key').value = '';
    renderSettings();
    renderChatState();
    setStatus('set-key-status', '키를 삭제했어요.', '');
  }

  function fetchWithTimeout(url, options, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, Object.assign({}, options, { signal: ctl.signal })).finally(function () { clearTimeout(timer); });
  }

  async function loadModels() {
    if (!apiKey) { setStatus('set-models-status', '먼저 API 키를 저장해 주세요.', 'warn'); return; }
    const btn = $('btn-models-load');
    btn.disabled = true;
    setStatus('set-models-status', '최신 모델 목록을 불러오는 중…', '');
    try {
      let res;
      try {
        res = await fetchWithTimeout(C.API_BASE + '/v1/models?limit=100', { headers: C.headers(apiKey, false) }, 20000);
      } catch (e) {
        throw new UserError(e && e.name === 'AbortError' ? '시간이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.' : C.NETWORK_ERROR);
      }
      const text = await res.text();
      if (!res.ok) throw new UserError(C.friendlyError(res.status, text));
      let list;
      try { list = C.normalizeModels(JSON.parse(text)); } catch (e) { list = []; }
      if (!list.length) throw new UserError('쓸 수 있는 Claude 모델을 찾지 못했어요.');

      const previous = settings.model;
      settings.models = list;
      settings.loadedAt = Date.now();
      if (!list.some(function (m) { return m.id === settings.model; })) settings.model = C.suggestModel(list);
      saveSettings();
      renderSettings();
      const changed = previous !== settings.model ? ' 선택한 모델이 목록에 없어서 ' + modelName(settings.model) + '(으)로 바꿨어요.' : '';
      setStatus('set-models-status', '최신 모델 ' + list.length + '개를 불러왔어요.' + changed, 'ok');
      renderChatState();
    } catch (err) {
      setStatus('set-models-status', err instanceof UserError ? err.message : '모델 목록을 불러오지 못했어요.', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 질문하기 화면 ----------

  function appendInline(parent, text) {
    C.parseInline(text).forEach(function (s) {
      if (s.t === 'text') { parent.appendChild(document.createTextNode(s.v)); return; }
      const n = document.createElement(s.t === 'b' ? 'strong' : 'code');
      n.textContent = s.v;
      parent.appendChild(n);
    });
  }

  // 답변 글자를 DOM 으로 바꿈. innerHTML 을 쓰지 않아서 답변 속 태그는 글자로만 보입니다.
  function renderInto(el, text) {
    el.textContent = '';
    C.parseBlocks(text).forEach(function (b) {
      if (b.type === 'p') {
        const p = document.createElement('p');
        appendInline(p, b.text);
        el.appendChild(p);
      } else {
        const list = document.createElement(b.type);
        b.items.forEach(function (item) {
          const li = document.createElement('li');
          appendInline(li, item);
          list.appendChild(li);
        });
        el.appendChild(list);
      }
    });
  }

  function nearBottom(log) {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  }

  function addMessage(role, text) {
    const log = $('chat-log');
    const stick = nearBottom(log);
    const el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
    if (role === 'user') {
      const p = document.createElement('p');
      p.textContent = text;
      el.appendChild(p);
    } else if (text) {
      renderInto(el, text);
    }
    log.appendChild(el);
    if (stick || role === 'user') log.scrollTop = log.scrollHeight;
    return el;
  }

  function showTyping(el) {
    el.classList.add('pending');
    el.textContent = '';
    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-label', '답변을 쓰는 중');
    dots.textContent = '···';
    el.appendChild(dots);
  }

  function showError(el, message, canRetry) {
    el.classList.remove('pending');
    el.classList.add('error');
    el.textContent = '';
    const p = document.createElement('p');
    p.textContent = message;
    el.appendChild(p);
    if (canRetry) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.textContent = '다시 시도';
      b.addEventListener('click', function () {
        if (busy) return;
        if (lastUserEl && lastUserEl.parentNode) lastUserEl.parentNode.removeChild(lastUserEl);
        if (el.parentNode) el.parentNode.removeChild(el);
        send(lastQuestion, true);
      });
      el.appendChild(b);
    }
  }

  function addNote(el, text) {
    const n = document.createElement('p');
    n.className = 'msg-note';
    n.textContent = text;
    el.appendChild(n);
  }

  function resetLog() {
    $('chat-log').textContent = '';
    addMessage('bot', GREETING);
    $('chat-suggest').hidden = false;
  }

  function renderSuggestions() {
    const box = $('chat-suggest');
    box.textContent = '';
    SUGGESTIONS.forEach(function (q) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = q;
      b.addEventListener('click', function () { send(q); });
      box.appendChild(b);
    });
  }

  function setBusy(on) {
    busy = on;
    $('btn-chat-send').hidden = on;
    $('btn-chat-stop').hidden = !on;
    $('chat-input').readOnly = on;
    document.querySelectorAll('#chat-suggest .chip').forEach(function (c) { c.disabled = on || !apiKey; });
  }

  function renderChatState() {
    const hasKey = !!apiKey;
    $('chat-banner').hidden = hasKey;
    $('chat-input').disabled = !hasKey;
    $('btn-chat-send').disabled = !hasKey;
    $('chat-input').placeholder = hasKey
      ? '예) 사실과 해석은 어떻게 구분해서 쓰나요?'
      : '설정에서 API 키를 입력하면 질문할 수 있어요.';
    $('chat-model-label').textContent = hasKey ? '모델: ' + modelName(settings.model) + ' · 바꾸기' : '';
    document.querySelectorAll('#chat-suggest .chip').forEach(function (c) { c.disabled = busy || !hasKey; });
  }

  function privacyHits(text) {
    if (!window.Checks || !window.Checks.findPrivateInfo) return [];
    try { return window.Checks.findPrivateInfo(text) || []; } catch (e) { return []; }
  }

  async function send(raw, isRetry) {
    const text = (raw || '').trim();
    if (busy || !text || !apiKey) return;

    // 전화번호·실명처럼 보이는 표현이 있으면 한 번 알려 줌 (같은 내용을 다시 보내면 그대로 전송)
    const warn = $('chat-warn');
    if (!isRetry && warnedText !== text) {
      const hits = privacyHits(text);
      if (hits.length) {
        const kinds = hits.map(function (h) { return h.type; }).filter(function (t, i, a) { return a.indexOf(t) === i; }).join(', ');
        warn.textContent = '개인정보로 보이는 표현이 있어요(' + kinds + '). 이니셜이나 가명(A씨)으로 바꿔 주세요. 그대로 보내려면 한 번 더 누르세요.';
        warn.hidden = false;
        warnedText = text;
        $('chat-input').value = text;
        return;
      }
    }
    warn.hidden = true;
    warnedText = '';

    lastQuestion = text;
    $('chat-suggest').hidden = true;
    $('chat-input').value = '';
    lastUserEl = addMessage('user', text);
    const bubble = addMessage('bot', '');
    showTyping(bubble);

    const lengthBefore = history.length;
    history.push({ role: 'user', content: text });
    setBusy(true);
    controller = new AbortController();
    let answer = '';
    let stop = null;

    function handleText(chunkText) {
      const parsed = C.parseSSE(chunkText);
      let changed = false;
      parsed.events.forEach(function (ev) {
        const d = C.describeEvent(ev);
        if (d.error) throw new UserError(d.error);
        if (d.text) { answer += d.text; changed = true; }
        if (d.stop) stop = d.stop;
      });
      if (changed) {
        const log = $('chat-log');
        const stick = nearBottom(log);
        bubble.classList.remove('pending');
        renderInto(bubble, answer);
        if (stick) log.scrollTop = log.scrollHeight;
      }
      return parsed.rest;
    }

    try {
      let res;
      try {
        res = await fetch(C.API_BASE + '/v1/messages', {
          method: 'POST',
          headers: C.headers(apiKey, true),
          body: JSON.stringify(C.buildRequest(settings.model, history)),
          signal: controller.signal
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        throw new UserError(C.NETWORK_ERROR);
      }
      if (!res.ok) {
        const body = await res.text().catch(function () { return ''; });
        throw new UserError(C.friendlyError(res.status, body));
      }

      if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          buf = handleText(buf + decoder.decode(r.value, { stream: true }));
        }
        handleText(buf + '\n\n'); // 마지막 이벤트 뒤에 빈 줄이 없는 경우
      } else {
        handleText((await res.text()) + '\n\n');
      }

      if (!answer) {
        history.length = lengthBefore;
        showError(bubble, stop === 'refusal'
          ? '이 질문에는 답하기 어려워요. 다른 방식으로 물어봐 주세요.'
          : '답변을 받지 못했어요. 다시 시도해 주세요.', stop !== 'refusal');
      } else {
        history.push({ role: 'assistant', content: answer });
        if (stop === 'max_tokens') addNote(bubble, '답변이 길어서 여기서 멈췄어요. ‘계속해 줘’라고 보내 보세요.');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (answer) {
          history.push({ role: 'assistant', content: answer });
          addNote(bubble, '답변을 멈췄어요.');
        } else {
          history.length = lengthBefore;
          bubble.parentNode && bubble.parentNode.removeChild(bubble);
          lastUserEl && lastUserEl.parentNode && lastUserEl.parentNode.removeChild(lastUserEl);
          $('chat-input').value = text;
        }
      } else {
        history.length = lengthBefore;
        // 이미 일부 받은 답변이 있으면 그대로 두고 오류만 덧붙임
        if (answer) {
          bubble.classList.remove('pending');
          addNote(bubble, (err instanceof UserError ? err.message : '답변을 받는 중 문제가 생겨 여기서 멈췄어요.'));
        } else {
          showError(bubble, err instanceof UserError ? err.message : '답변을 받지 못했어요. 다시 시도해 주세요.', true);
        }
      }
    } finally {
      controller = null;
      setBusy(false);
      renderChatState();
      const log = $('chat-log');
      if (nearBottom(log)) log.scrollTop = log.scrollHeight;
    }
  }

  function clearChat() {
    if (controller) controller.abort();
    history = [];
    lastQuestion = '';
    lastUserEl = null;
    warnedText = '';
    $('chat-warn').hidden = true;
    resetLog();
  }

  // ---------- 이벤트 연결 ----------

  $('btn-key-save').addEventListener('click', saveKeyFromInput);
  $('set-key').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); saveKeyFromInput(); }
  });
  $('btn-key-clear').addEventListener('click', clearKey);
  $('set-key-toggle').addEventListener('click', function () {
    const input = $('set-key');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    this.textContent = show ? '숨기기' : '보기';
    this.setAttribute('aria-pressed', show ? 'true' : 'false');
  });
  $('set-persist').addEventListener('change', function () {
    settings.persistKey = this.checked;
    saveSettings();
    if (apiKey && keyWhere !== 'memory') { // 이미 저장된 키를 새 선택에 맞는 곳으로 옮김
      removeRaw('localStorage', KEY_STORE);
      removeRaw('sessionStorage', KEY_STORE);
      const ok = writeRaw(settings.persistKey ? 'localStorage' : 'sessionStorage', KEY_STORE, apiKey);
      keyWhere = ok ? (settings.persistKey ? 'local' : 'session') : 'memory';
      renderSettings();
    }
  });
  $('set-model').addEventListener('change', function () {
    settings.model = this.value;
    saveSettings();
    renderChatState();
  });
  $('btn-models-load').addEventListener('click', loadModels);

  $('chat-form').addEventListener('submit', function (e) {
    e.preventDefault();
    send($('chat-input').value);
  });
  $('chat-input').addEventListener('keydown', function (e) {
    // 컴퓨터에서는 Enter 로 보내고 Shift+Enter 로 줄바꿈. 한글 입력 중(조합 중)에는 보내지 않음.
    // 휴대폰(터치 화면)에서는 Enter 가 줄바꿈이고, 보내기 버튼으로 보냄.
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !touch) {
      e.preventDefault();
      send(this.value);
    }
  });
  $('chat-input').addEventListener('input', function () {
    if (warnedText && this.value.trim() !== warnedText) { warnedText = ''; $('chat-warn').hidden = true; }
  });
  $('btn-chat-stop').addEventListener('click', function () { if (controller) controller.abort(); });
  $('btn-chat-clear').addEventListener('click', clearChat);

  function onRoute() {
    const view = location.hash.replace(/^#/, '').split('/')[0];
    if (view === 'settings') renderSettings();
    if (view === 'chat') {
      renderChatState();
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (apiKey && !touch) setTimeout(function () { $('chat-input').focus(); }, 0);
    }
  }
  window.addEventListener('hashchange', onRoute);

  renderSuggestions();
  resetLog();
  renderSettings();
  renderChatState();
  onRoute();
})();
