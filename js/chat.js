/* 질문 챗봇의 순수 로직 (화면과 무관).
 * 브라우저에서는 window.Chat, Node(테스트)에서는 require 로 사용합니다. */
(function (root) {
  'use strict';

  const API_BASE = 'https://api.anthropic.com';
  const API_VERSION = '2023-06-01';
  const MAX_TOKENS = 1024;
  const MAX_HISTORY = 20; // 서버로 보내는 최근 메시지 수 (질문 + 답변)

  // 모델 목록을 불러오기 전에 쓰는 기본 목록
  const FALLBACK_MODELS = [
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1' }
  ];
  const DEFAULT_MODEL = 'claude-sonnet-5-5';

  const NETWORK_ERROR = '인터넷 연결을 확인해 주세요. (브라우저나 보안 프로그램이 요청을 막았을 수도 있어요.)';

  // 챗봇에게 주는 역할 설명. 「실습일지 작성 요령 안내문」의 내용을 담았습니다.
  const SYSTEM_PROMPT = [
    '당신은 사회복지 현장실습을 나가는 성인학습자 학생들의 ‘실습일지 작성’ 질문에 답하는 도우미입니다. 사회복지학과 교수님이 학생들에게 제공하는 「실습일지 도우미」 앱 안에서 대화합니다.',
    '',
    '[하는 일]',
    '- 실습일지 작성 요령, 일지의 구성, 성찰 쓰기, 비밀보장, 시간 관리, 슈퍼비전 준비에 관한 질문에 답합니다.',
    '- 아래 ‘안내문의 원칙’을 기준으로 답합니다. 학교·기관·슈퍼바이저가 따로 정한 기준이 있으면 그쪽이 우선이라고 알려 줍니다.',
    '- 안내문에 없는 내용(특정 학교의 제출 양식, 평가 기준, 실습 시간 인정 여부 등)은 아는 척하지 말고 담당 교수님이나 실습 슈퍼바이저께 확인하도록 안내합니다.',
    '',
    '[하지 않는 일]',
    '- 학생 대신 일지를 써 주지 않습니다. 실습 내용·관찰·분석·소감·성찰·질문·향후 계획의 본문을 대신 쓰거나, 키워드만 받아 일지 한 편으로 완성해 주는 것도 포함합니다. 생성형 AI로 대신 쓴 일지는 슈퍼비전의 의미가 사라지기 때문입니다. 대신 무엇을 어떤 순서로 쓰면 되는지 알려 주고, 학생이 스스로 떠올리도록 질문하고, 학생이 쓴 글을 원칙에 비추어 점검해 줍니다.',
    '- 고쳐 쓰기 예시가 필요하면 가상의 짧은 사례로 한두 문장만 보여 줍니다.',
    '- 학생이 일지나 메모를 붙여 넣으면 잘된 점과 고칠 점을 원칙에 비추어 짚고, 학생이 직접 고치도록 이끕니다. 문장을 통째로 새로 써 주지 않습니다.',
    '- 클라이언트의 실명·주소·연락처 같은 개인정보는 입력하지 않도록 안내합니다. 이미 들어 있으면 이니셜(A씨)이나 가명으로 바꾸도록 알려 주고, 그 정보를 답변에 되풀이하지 않습니다.',
    '- 진단, 법률·의료 판단, 클라이언트에 대한 평가는 하지 않습니다. 학대 의심이나 자해 위험처럼 급한 상황은 지체 없이 실습 슈퍼바이저와 기관의 절차에 따라 알리도록 안내합니다.',
    '',
    '[답하는 방식]',
    '- 한국어 존댓말로, 따뜻하되 군더더기 없이 답합니다. 휴대폰으로 읽으므로 짧게(대개 5~8문장, 필요하면 항목 3~5개) 씁니다.',
    '- 결론을 먼저 말하고, 이유와 짧은 예시를 덧붙이고, 마지막에 학생이 바로 해 볼 한 가지를 제안합니다.',
    '- 표, 제목, 긴 목록은 쓰지 않습니다. 목록은 ‘- ’로만 쓰고, 강조는 꼭 필요할 때만 **굵게** 씁니다.',
    '- 실습일지와 상관없는 질문에는 범위를 정중하고 짧게 밝히고, 실습일지 질문으로 돌아오도록 안내합니다.',
    '- 앱 기능(키워드 메모, 15분 타이머, 자가 점검 7항목, 백업)을 물으면 간단히 설명하되, 화면 사용법은 ‘사용 설명서’ 탭을 보라고 안내합니다.',
    '',
    '[안내문의 원칙]',
    '실습일지는 “무엇을 했는가”보다 “어떻게 생각했는가”를 쓰는 글입니다.',
    '',
    '먼저 알아둘 점',
    '- 경험은 강점이자 함정입니다. “내가 해보니 이게 맞다”로 끝내지 말고 이론·가치·윤리의 관점으로 다시 해석합니다.',
    '- 시간이 부족하면 당일 키워드 메모와 15분 작성을 권합니다. 몰아서 쓰면 성찰이 빠지고 나열만 남습니다.',
    '- 글쓰기가 부담되면 잘 쓰려 하지 말고 정해진 틀에 맞춰 씁니다. 하루 일을 다 쓰지 않아도 되고 핵심 장면 1~2개면 됩니다.',
    '- 일지는 슈퍼비전 자료이자 앞으로 실무 기록을 쓰는 능력의 기초입니다.',
    '',
    '일지의 구성 4항목',
    '1. 실습 내용: 언제, 어디서, 누구와, 무엇을 했는지 객관적 사실. 흔한 실수는 시간표 나열만 하는 것.',
    '2. 관찰·분석: 클라이언트·프로그램·기관에서 관찰한 점과 이론과의 연결. 흔한 실수는 주관적 평가(“고집이 셌다”).',
    '3. 소감·성찰: 배운 점, 어려웠던 점, 자신의 반응과 그 이유. 흔한 실수는 “보람찼다”, “뜻깊었다”로 끝나는 것.',
    '4. 질문·향후 계획: 슈퍼바이저에게 묻고 싶은 것, 다음에 시도할 것. 흔한 실수는 비워두거나 형식적으로 쓰는 것.',
    '',
    '작성 원칙 6가지',
    '1. 사실과 해석을 구분한다. “A씨가 화를 냈다”(해석) 대신 “A씨가 목소리를 높이며 서류를 책상에 내려놓았다”(사실)를 먼저 쓰고, 그다음에 해석을 쓴다.',
    '2. 구체적으로 쓴다. 육하원칙 기준. “프로그램 보조를 했다”보다 “어르신 12명 대상 인지향상 프로그램에서 도구 배부와 개별 보조를 맡았다”.',
    '3. 비밀보장을 지킨다. 실명, 주소, 연락처, 특정 가능한 정보는 쓰지 않고 이니셜이나 가명(A씨, 70대 여성)을 쓴다.',
    '4. 이론·가치와 연결한다. 강점관점, 생태체계, 자기결정권, 사회복지사 윤리강령 등과 한두 줄이라도 연결한다.',
    '5. 판단·낙인 표현을 피한다. “불쌍한”, “문제 가정”, “말을 안 듣는” 같은 표현은 관찰한 행동으로 바꿔 쓴다.',
    '6. 자기 성찰을 담는다. 내가 느낀 감정이 내 경험·가치관과 어떻게 이어지는지 돌아본다.',
    '',
    '성찰 쓰기 틀: 무엇을 → 그래서 → 앞으로',
    '- 무엇을(What?): 오늘 인상 깊었던 장면 한 가지.',
    '- 그래서(So what?): 왜 중요했는지, 무엇을 배웠는지, 이론과 어떻게 연결되는지, 내 경험·가치관과 어떻게 이어지는지.',
    '- 앞으로(Now what?): 다음에 비슷한 상황에서 어떻게 할지.',
    '',
    '제출 전 자가 점검 7항목',
    '비밀보장 / 육하원칙 / 사실과 해석 구분 / 이론·가치 연결 / 판단·낙인 표현 없음 / 성찰 3단계 / 슈퍼바이저 질문·향후 계획. 앱의 자동 점검은 단어 규칙에 따른 참고용이라 최종 확인은 직접 해야 합니다.',
    '',
    '매일 비슷한 문장을 복사해 붙이거나 생성형 AI로 대신 쓴 일지는 슈퍼비전의 의미가 사라집니다. 학교와 기관의 기준을 따릅니다.'
  ].join('\n');

  // ---------- 요청 만들기 ----------

  function headers(apiKey, withBody) {
    const h = {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      // 브라우저에서 직접 호출할 때 필요한 헤더
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (withBody) h['content-type'] = 'application/json';
    return h;
  }

  // 최근 대화만 남기고, 첫 메시지가 항상 질문(user)이 되게 맞춥니다.
  function trimHistory(messages, max) {
    let list = messages.slice(-(max || MAX_HISTORY));
    while (list.length && list[0].role !== 'user') list = list.slice(1);
    return list;
  }

  function buildRequest(model, messages) {
    return {
      model: model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: trimHistory(messages, MAX_HISTORY),
      stream: true
    };
  }

  // ---------- API 키 ----------

  function checkKey(raw) {
    const key = (raw || '').trim();
    if (!key) return { ok: false, message: 'API 키를 입력해 주세요.' };
    if (/[^\x21-\x7E]/.test(key)) {
      return { ok: false, message: '키에 한글, 공백 같은 올바르지 않은 문자가 들어 있어요. 복사한 키를 다시 붙여 넣어 주세요.' };
    }
    if (key.indexOf('sk-ant-') !== 0) {
      return { ok: true, key: key, warn: 'Anthropic API 키는 보통 sk-ant- 로 시작해요. 키가 맞는지 확인해 주세요.' };
    }
    return { ok: true, key: key };
  }

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 12) return '••••';
    return key.slice(0, 7) + '…' + key.slice(-4);
  }

  // ---------- 모델 ----------

  // /v1/models 응답 → [{id, name}] (Claude 모델만, 최신순)
  function normalizeModels(payload) {
    const data = payload && Array.isArray(payload.data) ? payload.data : [];
    const seen = {};
    return data
      .filter(function (m) {
        if (!m || typeof m.id !== 'string' || !/^claude-/.test(m.id) || seen[m.id]) return false;
        seen[m.id] = true;
        return true;
      })
      .map(function (m) {
        return { id: m.id, name: m.display_name || m.id, created: Date.parse(m.created_at) || 0 };
      })
      .sort(function (a, b) { return b.created - a.created || a.id.localeCompare(b.id); })
      .map(function (m) { return { id: m.id, name: m.name }; });
  }

  // 목록에서 기본으로 고를 모델: 가장 최신 Sonnet, 없으면 맨 앞
  function suggestModel(models) {
    if (!models || !models.length) return DEFAULT_MODEL;
    const sonnet = models.filter(function (m) { return /sonnet/i.test(m.id); })[0];
    return (sonnet || models[0]).id;
  }

  // ---------- 응답 해석 (스트리밍) ----------

  // SSE 문자열 → 완성된 이벤트 목록 + 아직 덜 온 나머지
  function parseSSE(buffer) {
    const parts = buffer.split(/\r?\n\r?\n/);
    const rest = parts.pop();
    const events = [];
    parts.forEach(function (chunk) {
      let data = '';
      chunk.split(/\r?\n/).forEach(function (line) {
        if (line.indexOf('data:') === 0) data += line.slice(5).replace(/^ /, '');
      });
      if (!data) return;
      try { events.push(JSON.parse(data)); } catch (e) { /* 깨진 이벤트는 건너뜀 */ }
    });
    return { events: events, rest: rest };
  }

  const ERROR_TYPE_STATUS = {
    invalid_request_error: 400,
    authentication_error: 401,
    permission_error: 403,
    not_found_error: 404,
    request_too_large: 413,
    rate_limit_error: 429,
    api_error: 500,
    overloaded_error: 529
  };

  // 이벤트 하나 → { text?, stop?, error? }
  function describeEvent(ev) {
    if (!ev || typeof ev !== 'object') return {};
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
      return { text: ev.delta.text || '' };
    }
    if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
      return { stop: ev.delta.stop_reason };
    }
    if (ev.type === 'error' && ev.error) {
      const status = ERROR_TYPE_STATUS[ev.error.type] || 500;
      return { error: friendlyError(status, JSON.stringify({ error: ev.error })) };
    }
    return {};
  }

  // ---------- 오류 문구 ----------

  function errorDetail(bodyText) {
    try {
      const j = JSON.parse(bodyText);
      return (j && j.error && j.error.message) || '';
    } catch (e) {
      return '';
    }
  }

  function friendlyError(status, bodyText) {
    const detail = errorDetail(bodyText);
    if (/credit balance/i.test(detail)) {
      return '이 API 키의 크레딧이 부족해요. Claude Console에서 크레딧과 사용 한도를 확인해 주세요.';
    }
    switch (status) {
      case 401: return 'API 키가 올바르지 않아요. 설정에서 키를 다시 확인해 주세요.';
      case 403: return '이 키로는 사용할 수 없어요(권한 또는 지역 제한). Claude Console에서 키의 권한을 확인해 주세요.';
      case 404: return '선택한 모델을 찾을 수 없어요. 설정에서 ‘최신 모델 불러오기’를 눌러 모델을 다시 골라 주세요.';
      case 413: return '질문이 너무 길어요. 줄여서 다시 보내 주세요.';
      case 429: return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
      case 500: case 502: case 503: case 504: case 529:
        return 'Claude 서버가 잠시 바빠요. 잠시 후 다시 시도해 주세요.';
      default:
        return '답변을 받지 못했어요(오류 ' + status + ')' + (detail ? ': ' + detail : '') + '.';
    }
  }

  // ---------- 답변 표시용 변환 (HTML 을 만들지 않고 구조만 돌려줌) ----------

  // **굵게**, `코드` 만 해석
  function parseInline(text) {
    const out = [];
    const re = /\*\*(.+?)\*\*|`([^`\n]+)`/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
      if (m[1] !== undefined) out.push({ t: 'b', v: m[1] });
      else out.push({ t: 'code', v: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
    return out;
  }

  // 문단 / 글머리 목록 / 번호 목록으로 나눔
  function parseBlocks(text) {
    const blocks = [];
    let para = [];
    let list = null;

    function flushPara() {
      if (para.length) blocks.push({ type: 'p', text: para.join('\n') });
      para = [];
    }
    function flushList() {
      if (list) blocks.push(list);
      list = null;
    }

    String(text || '').split(/\r?\n/).forEach(function (line) {
      let m;
      if (!line.trim()) { flushPara(); flushList(); return; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
        flushPara();
        if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
        list.items.push(m[1]);
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
        list.items.push(m[1]);
      } else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
        flushPara(); flushList();
        blocks.push({ type: 'p', text: '**' + m[1].replace(/\*\*/g, '') + '**' });
      } else {
        flushList();
        para.push(line);
      }
    });
    flushPara();
    flushList();
    return blocks;
  }

  const api = {
    API_BASE: API_BASE,
    API_VERSION: API_VERSION,
    MAX_TOKENS: MAX_TOKENS,
    MAX_HISTORY: MAX_HISTORY,
    FALLBACK_MODELS: FALLBACK_MODELS,
    DEFAULT_MODEL: DEFAULT_MODEL,
    NETWORK_ERROR: NETWORK_ERROR,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    headers: headers,
    trimHistory: trimHistory,
    buildRequest: buildRequest,
    checkKey: checkKey,
    maskKey: maskKey,
    normalizeModels: normalizeModels,
    suggestModel: suggestModel,
    parseSSE: parseSSE,
    describeEvent: describeEvent,
    friendlyError: friendlyError,
    parseInline: parseInline,
    parseBlocks: parseBlocks
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chat = api;
})(typeof window !== 'undefined' ? window : this);
