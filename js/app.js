(function () {
  'use strict';

  const STORAGE_KEY = 'practicum-journal-v1';
  const TIMER_SECONDS = 15 * 60;

  const FIELDS = {
    date: 'f-date',
    place: 'f-place',
    keywords: 'f-keywords',
    content: 'f-content',
    observation: 'f-observation',
    what: 'f-what',
    soWhat: 'f-sowhat',
    nowWhat: 'f-nowwhat',
    questions: 'f-questions'
  };
  const WRITING_KEYS = ['content', 'observation', 'what', 'soWhat', 'nowWhat', 'questions'];

  const THEORIES = [
    ['강점관점', '클라이언트의 문제보다 이미 가진 능력·자원·가능성에 주목하는 관점.'],
    ['생태체계', '개인을 가족·이웃·기관·제도 등 환경과의 상호작용 속에서 이해하는 관점.'],
    ['자기결정권', '클라이언트가 스스로 선택하고 결정할 권리를 존중하는 원칙.'],
    ['윤리강령', '사회복지사 윤리강령의 가치(인간존엄성, 사회정의)와 클라이언트에 대한 윤리기준.'],
    ['임파워먼트', '클라이언트가 자기 삶에 대한 힘과 통제감을 갖도록 돕는 접근.'],
    ['비심판적 태도', '클라이언트의 행동이나 상황을 평가·비난하지 않고 받아들이는 태도.'],
    ['개별화', '같은 프로그램 안에서도 각자의 고유한 상황과 특성을 인정하는 원칙.'],
    ['수용', '클라이언트를 있는 그대로 받아들이는 태도. 행동을 승인한다는 뜻은 아님.'],
    ['비밀보장', '클라이언트 정보를 보호할 의무. 일지에도 똑같이 적용됨.'],
    ['집단 상호작용', '집단 구성원끼리 주고받는 영향이 참여와 변화의 계기가 된다는 관점.'],
    ['사회적 지지', '가족·이웃·동료에게서 받는 정서적·정보적·실질적 도움.'],
    ['라포', '클라이언트와의 신뢰 관계. 개입의 출발점.']
  ];

  // ---------- 저장소 ----------

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch (e) {
      return [];
    }
  }

  let storageOk = true;
  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      storageOk = true;
    } catch (e) {
      if (storageOk) toast('이 브라우저에서는 저장할 수 없어요. 내용을 복사해 두세요.');
      storageOk = false;
    }
  }

  function isEntry(e) {
    return e && typeof e === 'object' && typeof e.id === 'string';
  }

  // ---------- 유틸 ----------

  const $ = function (id) { return document.getElementById(id); };

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDate(str) {
    if (!str) return '날짜 없음';
    const d = new Date(str + 'T00:00:00');
    if (isNaN(d)) return str;
    const w = '일월화수목금토'[d.getDay()];
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '. (' + w + ')';
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function charCount(s) {
    return (s || '').replace(/\s/g, '').length;
  }

  function isBlank(entry) {
    return WRITING_KEYS.concat(['keywords']).every(function (k) { return !(entry[k] || '').trim(); });
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function debounce(fn, ms) {
    let h = null;
    return function () {
      clearTimeout(h);
      h = setTimeout(fn, ms);
    };
  }

  // ---------- 상태 ----------

  let entries = loadEntries();
  let current = null; // 편집 중인 일지

  function findEntry(id) {
    return entries.find(function (e) { return e.id === id; }) || null;
  }

  function createEntry(date) {
    const entry = {
      id: newId(),
      date: date || todayStr(),
      place: lastPlace(),
      keywords: '', content: '', observation: '', what: '', soWhat: '', nowWhat: '', questions: '',
      manual: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    entries.push(entry);
    saveEntries();
    return entry;
  }

  function lastPlace() {
    const sorted = sortedEntries();
    for (let i = 0; i < sorted.length; i++) if (sorted[i].place) return sorted[i].place;
    return '';
  }

  function sortedEntries() {
    return entries.slice().sort(function (a, b) {
      if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function othersOf(entry) {
    return entries.filter(function (e) { return e.id !== entry.id; });
  }

  // ---------- 라우팅 ----------

  function route() {
    const hash = location.hash.replace(/^#/, '');
    const parts = hash.split('/');
    let view = parts[0] || 'list';

    // 비어 있는 일지는 떠날 때 정리
    if (current && !(view === 'edit' && parts[1] === current.id)) {
      if (isBlank(current)) {
        entries = entries.filter(function (e) { return e.id !== current.id; });
        saveEntries();
      }
      current = null;
    }

    if (view === 'edit') {
      const entry = findEntry(parts[1]);
      if (!entry) { location.replace('#list'); return; }
      openEditor(entry);
    } else if (view === 'guide') {
      // 정적 내용
    } else {
      view = 'list';
      renderList();
    }

    ['list', 'edit', 'guide'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === view || (view === 'edit' && a.dataset.nav === 'list'));
    });
    window.scrollTo(0, 0);
  }

  // ---------- 목록 ----------

  function renderList() {
    const list = $('entry-list');
    const items = sortedEntries();
    list.replaceChildren();

    items.forEach(function (entry) {
      const result = Checks.run(entry, othersOf(entry));
      const ok = result.checklist.filter(function (c) { return c.status === 'ok'; }).length;
      const total = result.checklist.length;

      const li = el('li');
      const a = el('a', 'entry-card');
      a.href = '#edit/' + entry.id;

      a.appendChild(el('span', 'entry-date', formatDate(entry.date)));

      const body = el('div', 'entry-body');
      if (entry.place) body.appendChild(el('div', 'entry-place', entry.place));
      const snippetSrc = (entry.content || entry.what || entry.keywords || '').replace(/\s+/g, ' ').trim();
      body.appendChild(el('p', 'entry-snippet' + (snippetSrc ? '' : ' muted'), snippetSrc || '아직 내용이 없어요'));
      a.appendChild(body);

      a.appendChild(el('span', 'entry-score' + (ok === total ? ' full' : ''), '점검 ' + ok + '/' + total));

      li.appendChild(a);
      list.appendChild(li);
    });

    $('list-empty').hidden = items.length > 0;
    $('list-count').textContent = items.length ? items.length + '개' : '';
  }

  // ---------- 편집 ----------

  function openEditor(entry) {
    current = entry;
    Object.keys(FIELDS).forEach(function (key) { $(FIELDS[key]).value = entry[key] || ''; });
    $('save-state').textContent = entry.updatedAt && !isBlank(entry) ? '마지막 저장 ' + timeStr(entry.updatedAt) : '';
    updateCounts();
    renderChecks();
  }

  function timeStr(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  const persist = debounce(function () {
    if (!current) return;
    current.updatedAt = Date.now();
    saveEntries();
    $('save-state').textContent = storageOk ? '저장됨 ' + timeStr(current.updatedAt) : '저장 안 됨';
  }, 400);

  const recheck = debounce(renderChecks, 250);

  function onFieldInput(key, value) {
    if (!current) return;
    current[key] = value;
    $('save-state').textContent = '입력 중…';
    persist();
    updateCounts();
    recheck();
  }

  function updateCounts() {
    document.querySelectorAll('[data-count-for]').forEach(function (span) {
      const ids = span.dataset.countFor.split(' ');
      const n = ids.reduce(function (sum, id) { return sum + charCount($(id).value); }, 0);
      span.textContent = n ? n + '자' : '';
    });
  }

  const STATUS_TEXT = { ok: '통과', warn: '확인 필요', empty: '미작성' };

  function renderChecks() {
    if (!current) return;
    const result = Checks.run(current, othersOf(current));
    const list = $('check-list');
    list.replaceChildren();
    current.manual = current.manual || {};

    let okCount = 0;
    let manualCount = 0;

    result.checklist.forEach(function (c) {
      if (c.status === 'ok') okCount++;
      if (current.manual[c.id]) manualCount++;

      const li = el('li', 'check-item ' + c.status);
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !!current.manual[c.id];
      box.setAttribute('aria-label', '직접 확인함: ' + c.label);
      box.addEventListener('change', function () {
        current.manual[c.id] = box.checked;
        persist();
        renderChecks();
      });
      label.appendChild(box);
      label.appendChild(el('span', '', c.label));
      label.appendChild(el('span', 'check-status', STATUS_TEXT[c.status]));
      li.appendChild(label);

      if (c.message) li.appendChild(el('p', 'check-msg', c.message));
      if (c.items && c.items.length) {
        const ul = el('ul', 'check-items');
        c.items.forEach(function (it) { ul.appendChild(el('li', '', it)); });
        li.appendChild(ul);
      }
      list.appendChild(li);
    });

    const total = result.checklist.length;
    $('check-score').textContent = '자동 ' + okCount + '/' + total + ' · 직접 ' + manualCount + '/' + total;
    $('check-fab').textContent = '점검 ' + okCount + '/' + total;

    const extra = $('extra-check');
    extra.replaceChildren();
    if (result.extra.status === 'warn') {
      extra.appendChild(el('strong', '', '반복 문장 주의'));
      extra.appendChild(el('p', '', result.extra.message));
      const ul = el('ul');
      result.extra.items.forEach(function (s) { ul.appendChild(el('li', '', s)); });
      extra.appendChild(ul);
      extra.hidden = false;
    } else {
      extra.hidden = true;
    }
  }

  // ---------- 내보내기 ----------

  function entryText(entry) {
    const lines = [];
    lines.push('[실습일지] ' + formatDate(entry.date) + (entry.place ? ' · ' + entry.place : ''));
    lines.push('');
    lines.push('■ 실습 내용');
    lines.push((entry.content || '').trim());
    lines.push('');
    lines.push('■ 관찰·분석');
    lines.push((entry.observation || '').trim());
    lines.push('');
    lines.push('■ 소감·성찰');
    lines.push('- 무엇을: ' + (entry.what || '').trim());
    lines.push('- 그래서: ' + (entry.soWhat || '').trim());
    lines.push('- 앞으로: ' + (entry.nowWhat || '').trim());
    lines.push('');
    lines.push('■ 질문·향후 계획');
    lines.push((entry.questions || '').trim());
    return lines.join('\n') + '\n';
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function fillPrintArea(entry) {
    const area = $('print-area');
    area.replaceChildren();
    area.appendChild(el('h1', '', '실습일지'));
    area.appendChild(el('p', 'print-meta', formatDate(entry.date) + (entry.place ? ' · ' + entry.place : '')));
    const sec = function (title, body) {
      area.appendChild(el('h2', '', title));
      area.appendChild(el('p', '', (body || '').trim()));
    };
    sec('1. 실습 내용', entry.content);
    sec('2. 관찰·분석', entry.observation);
    area.appendChild(el('h2', '', '3. 소감·성찰'));
    [['무엇을', entry.what], ['그래서', entry.soWhat], ['앞으로', entry.nowWhat]].forEach(function (s) {
      area.appendChild(el('h3', '', s[0]));
      area.appendChild(el('p', '', (s[1] || '').trim()));
    });
    sec('4. 질문·향후 계획', entry.questions);
  }

  // ---------- 타이머 ----------

  let remaining = TIMER_SECONDS;
  let timerHandle = null;

  function renderTimer() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    $('timer-clock').textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    $('timer-progress').style.width = ((TIMER_SECONDS - remaining) / TIMER_SECONDS * 100) + '%';
    $('timer').classList.toggle('done', remaining === 0);
    $('timer-toggle').textContent = timerHandle ? '일시정지' : remaining === TIMER_SECONDS ? '시작' : remaining === 0 ? '다시 시작' : '계속';
  }

  function toggleTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    } else {
      if (remaining === 0) remaining = TIMER_SECONDS;
      const endAt = Date.now() + remaining * 1000;
      timerHandle = setInterval(function () {
        remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        if (remaining === 0) {
          clearInterval(timerHandle);
          timerHandle = null;
          toast('15분이 지났어요. 핵심 장면 1~2개면 충분해요. 점검 목록을 확인하고 마무리하세요.');
        }
        renderTimer();
      }, 500);
    }
    renderTimer();
  }

  function resetTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    remaining = TIMER_SECONDS;
    renderTimer();
  }

  // ---------- 백업 ----------

  function backup() {
    const data = JSON.stringify({ app: 'practicum-journal', version: 1, exportedAt: new Date().toISOString(), entries: entries }, null, 2);
    download('practicum-journal-backup_' + todayStr() + '.json', data, 'application/json');
  }

  function restore(file) {
    const reader = new FileReader();
    reader.onload = function () {
      let incoming;
      try {
        const parsed = JSON.parse(reader.result);
        incoming = Array.isArray(parsed) ? parsed : parsed.entries;
        if (!Array.isArray(incoming)) throw new Error('형식 오류');
      } catch (e) {
        toast('백업 파일을 읽을 수 없어요.');
        return;
      }
      let added = 0;
      let updated = 0;
      incoming.filter(isEntry).forEach(function (inc) {
        const existing = findEntry(inc.id);
        if (!existing) { entries.push(inc); added++; }
        else if ((inc.updatedAt || 0) > (existing.updatedAt || 0)) { Object.assign(existing, inc); updated++; }
      });
      saveEntries();
      renderList();
      toast('불러오기 완료: 새 일지 ' + added + '개, 갱신 ' + updated + '개');
    };
    reader.readAsText(file);
  }

  // ---------- 이벤트 연결 ----------

  Object.keys(FIELDS).forEach(function (key) {
    $(FIELDS[key]).addEventListener('input', function (e) { onFieldInput(key, e.target.value); });
  });

  $('btn-today').addEventListener('click', function () {
    const today = todayStr();
    const existing = sortedEntries().find(function (e) { return e.date === today; });
    const entry = existing || createEntry(today);
    location.hash = '#edit/' + entry.id;
    setTimeout(function () { $(existing ? 'f-content' : 'f-keywords').focus(); }, 0);
  });

  $('btn-new').addEventListener('click', function () {
    const entry = createEntry(todayStr());
    location.hash = '#edit/' + entry.id;
    setTimeout(function () {
      const d = $('f-date');
      d.focus();
      if (typeof d.showPicker === 'function') { try { d.showPicker(); } catch (e) { /* 지원 안 함 */ } }
    }, 0);
  });

  $('btn-copy').addEventListener('click', function () {
    if (!current) return;
    copyText(entryText(current)).then(function (ok) {
      toast(ok ? '일지를 복사했어요. 제출 양식에 붙여 넣으세요.' : '복사하지 못했어요. 직접 선택해서 복사해 주세요.');
    });
  });

  $('btn-download').addEventListener('click', function () {
    if (!current) return;
    download('practicum-journal_' + (current.date || todayStr()) + '.txt', entryText(current));
  });

  $('btn-print').addEventListener('click', function () {
    if (!current) return;
    fillPrintArea(current);
    window.print();
  });

  $('btn-delete').addEventListener('click', function () {
    if (!current) return;
    if (!confirm(formatDate(current.date) + ' 일지를 삭제할까요? 되돌릴 수 없어요.')) return;
    const id = current.id;
    entries = entries.filter(function (e) { return e.id !== id; });
    current = null;
    saveEntries();
    location.hash = '#list';
    toast('삭제했어요.');
  });

  $('timer-toggle').addEventListener('click', toggleTimer);
  $('timer-reset').addEventListener('click', resetTimer);

  $('btn-backup').addEventListener('click', backup);
  $('input-restore').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) restore(e.target.files[0]);
    e.target.value = '';
  });

  // 이론·가치 설명 칩
  const chips = $('theory-chips');
  THEORIES.forEach(function (t) {
    const b = el('button', 'chip', t[0]);
    b.type = 'button';
    b.addEventListener('click', function () {
      chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === b); });
      $('theory-desc').textContent = t[0] + ': ' + t[1] + ' 오늘 장면과 어떻게 이어지는지는 직접 써 보세요.';
    });
    chips.appendChild(b);
  });

  // 다른 탭에서 바뀐 내용 반영
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY) return;
    entries = loadEntries();
    if (current) {
      const fresh = findEntry(current.id);
      if (fresh) openEditor(fresh);
      else location.hash = '#list';
    } else {
      renderList();
    }
  });

  window.addEventListener('hashchange', route);
  renderTimer();
  route();
})();
