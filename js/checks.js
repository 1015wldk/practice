/*
 * 실습일지 자동 점검 규칙.
 * 글을 대신 써 주지 않고, 안내문의 작성 원칙에 맞는지 규칙으로만 확인한다.
 * 브라우저(window.Checks)와 Node(module.exports) 양쪽에서 쓸 수 있다.
 */
(function (root) {
  'use strict';

  // ---------- 단어 목록 ----------

  const SURNAMES = '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부';
  const NAME_STOPWORDS = [
    '오늘', '이번', '이분', '이웃', '이전', '이후', '주변', '전체', '전원', '남성', '여성', '남자', '여자',
    '동료', '신규', '기존', '노인', '장애', '고령', '한분', '어느', '다른', '모든', '해당', '여러',
    '우리', '많은', '나이', '연세', '이용', '참여', '대상', '기관', '방문', '담당', '유일', '나머지',
    '김장', '이야기', '선배', '원장', '부장', '과장', '팀장', '실장', '관장', '센터장', '사회복지사',
    '복지사', '간호', '요양', '보호', '도우미', '지도', '강사', '선생', '교수', '고객', '손님', '어머', '아버', '부모', '봉사', '조부', '조모', '주민', '반장'
  ];

  const STIGMA_WORDS = [
    { word: '불쌍', suggest: '상황을 구체적으로 묘사하기 (예: "혼자 식사하는 날이 많다고 말씀하셨다")' },
    { word: '가엾', suggest: '감정 대신 관찰한 사실 쓰기' },
    { word: '문제 가정', suggest: '"지원이 필요한 가족", 구체적 어려움 서술' },
    { word: '문제가정', suggest: '"지원이 필요한 가족", 구체적 어려움 서술' },
    { word: '결손가정', suggest: '"한부모 가족", "조손 가족" 등 사실 그대로' },
    { word: '결손 가정', suggest: '"한부모 가족", "조손 가족" 등 사실 그대로' },
    { word: '말을 안 듣', suggest: '어떤 요청에 어떻게 반응했는지 행동으로 서술' },
    { word: '말 안 듣', suggest: '어떤 요청에 어떻게 반응했는지 행동으로 서술' },
    { word: '말을 듣지 않', suggest: '어떤 요청에 어떻게 반응했는지 행동으로 서술' },
    { word: '장애자', suggest: '"장애인", "장애가 있는 분"' },
    { word: '정신병자', suggest: '"정신장애가 있는 분", 진단명은 필요한 경우에만' },
    { word: '벙어리', suggest: '"언어장애인", "청각장애인"' },
    { word: '귀머거리', suggest: '"청각장애인"' },
    { word: '절름발이', suggest: '"지체장애인"' },
    { word: '정상인', suggest: '"비장애인"' },
    { word: '미친', suggest: '관찰한 행동을 그대로 서술' },
    { word: '한심', suggest: '판단 대신 관찰한 사실 쓰기' },
    { word: '이상한 사람', suggest: '어떤 행동이 눈에 띄었는지 서술' }
  ];

  // 관찰·분석에서 흔한 실수: 주관적 평가
  const SUBJECTIVE_WORDS = [
    '고집이 세', '고집이 셌', '고집불통', '까다로운', '까다롭', '게으른', '게을러', '이기적',
    '성격이 나쁘', '성격이 이상', '예의가 없', '버릇이 없', '의지가 없', '의욕이 없'
  ];

  const INTERPRETIVE_WORDS = [
    '화를 냈', '화를 내셨', '화가 났', '화가 나셨', '짜증', '좋아하셨', '좋아하셔', '좋아했', '싫어하',
    '싫어했', '불만이', '기분이 좋', '기분이 나빠', '기분 나빠', '우울해', '행복해', '즐거워하',
    '귀찮아', '무시했', '무시하셨', '예민', '삐졌', '삐지', '서운해'
  ];

  const THEORY_WORDS = [
    '강점관점', '강점 관점', '생태체계', '생태학적', '체계이론', '체계 이론', '환경 속의 인간', '환경 속 인간',
    '자기결정', '윤리강령', '윤리 강령', '임파워먼트', '역량강화', '역량 강화', '비심판', '수용',
    '개별화', '비밀보장', '사회적 지지', '상호작용', '집단역동', '집단 역동', '라포', '공감',
    '인간존엄', '인간 존엄', '사회정의', '사회 정의', '클라이언트 중심', '사례관리', '옹호', '회상요법',
    '욕구', '매슬로', '발달단계', '발달 단계', '에릭슨', '사회학습', '인지행동', '해결중심', '위기개입',
    '사회적 관계망', '자원', '연계', '접근성', '참여권', '권리'
  ];

  const VAGUE_FEELINGS = ['보람', '뜻깊', '뜻 깊', '좋은 경험', '많이 배웠', '좋았다', '감사했', '즐거웠', '재미있었'];

  const QUESTION_HINTS = ['?', '여쭙', '여쭤', '궁금', '묻고', '조언', '의견'];

  // ---------- 유틸 ----------

  function textOf(entry, keys) {
    return keys.map(function (k) { return entry[k] || ''; }).join('\n');
  }

  function allText(entry) {
    return textOf(entry, ['content', 'observation', 'what', 'soWhat', 'nowWhat', 'questions']);
  }

  function findWords(text, words) {
    const found = [];
    words.forEach(function (w) {
      const word = typeof w === 'string' ? w : w.word;
      if (text.indexOf(word) !== -1 && found.indexOf(word) === -1) found.push(word);
    });
    return found;
  }

  function len(s) {
    return (s || '').replace(/\s/g, '').length;
  }

  function splitSentences(text) {
    return (text || '')
      .split(/[.!?。\n]+/)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.replace(/\s/g, '').length >= 15; });
  }

  function uniq(arr) {
    return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
  }

  // ---------- 개별 탐지 ----------

  function findPrivateInfo(text) {
    const hits = [];
    const patterns = [
      { type: '전화번호', re: /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g },
      { type: '전화번호', re: /0\d{1,2}-\d{3,4}-\d{4}/g },
      { type: '주민등록번호', re: /\d{6}-?[1-4]\d{6}/g },
      { type: '이메일', re: /[\w.+-]+@[\w-]+\.[\w.]+/g },
      { type: '주소', re: /[가-힣]+(?:시|도)\s+[가-힣]+(?:구|군)(?=[\s,.]|$)/g },
      { type: '주소', re: /[가-힣\d]+(?:로|길)\s*\d+(?:-\d+)?(?:번길)?/g },
      { type: '주소', re: /\d+동\s*\d+호/g },
      { type: '주소', re: /[가-힣]+동\s*\d+(?:-\d+)?\s*번지/g },
      { type: '주소', re: /\d+\s*번지/g }
    ];
    patterns.forEach(function (p) {
      const m = text.match(p.re);
      if (m) m.forEach(function (v) { hits.push({ type: p.type, value: v.trim() }); });
    });

    // "김영희씨", "박철수 어르신" 처럼 성 + 이름 + 호칭
    const nameRe = new RegExp('(?<![가-힣])([' + SURNAMES + '][가-힣]{1,2})\\s?(씨|님|어르신|할머니|할아버지|아동|학생)', 'g');
    let m;
    while ((m = nameRe.exec(text)) !== null) {
      const word = m[1];
      if (NAME_STOPWORDS.indexOf(word) !== -1) continue;
      if (/(당|관|터|실|회|팀|반|층|방|소|원|교|과|님)$/.test(word)) continue; // 경로당, 복지관 등 장소·조직
      if (/(한|운|던|른|된|쁜|픈|많은|적은)$/.test(word)) continue; // 조용한 어르신 등 꾸밈말
      if (/(들|께|은|는|이|가|을|를|의|과|와|도|만)$/.test(word) && word.length === 3) continue;
      hits.push({ type: '실명 가능성', value: m[0] });
    }

    const seen = {};
    return hits.filter(function (h) {
      const key = h.type + h.value;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function sixWh(content) {
    const parts = [
      { key: '언제', ok: /(\d{1,2}\s*시|\d{1,2}:\d{2}|오전|오후|아침|점심|저녁|\d+\s*회기|\d+일)/.test(content) },
      { key: '어디서', ok: /(경로당|복지관|센터|기관|시설|요양원|학교|가정|사무실|교실|프로그램실|강당|상담실|현장|에서)/.test(content) },
      { key: '누구와', ok: /(\d+\s*명|명\s*대상|대상|어르신|아동|청소년|클라이언트|이용자|참여자|가족|슈퍼바이저|선생님|담당자|[A-Z]\s?씨)/.test(content) },
      { key: '무엇을', ok: /(맡았|진행|보조|참여|관찰|실시|준비|배부|상담|면담|기록|안내|방문|정리|회의|작성|지원)/.test(content) }
    ];
    return parts;
  }

  function timetableLines(content) {
    return (content || '').split('\n').filter(function (l) {
      return /^\s*[-·•]?\s*\d{1,2}\s*(:\d{2}|시)/.test(l);
    }).length;
  }

  function duplicateSentences(entry, others) {
    const mine = uniq(splitSentences(allText(entry)));
    if (!mine.length || !others || !others.length) return [];
    const theirs = {};
    others.forEach(function (o) {
      splitSentences(allText(o)).forEach(function (s) { theirs[s] = true; });
    });
    return mine.filter(function (s) { return theirs[s]; });
  }

  // ---------- 종합 점검 (제출 전 자가 점검 7항목 + 추가 점검) ----------

  function run(entry, otherEntries) {
    const results = [];
    const content = entry.content || '';
    const observation = entry.observation || '';
    const text = allText(entry);

    // 1. 개인정보
    const priv = findPrivateInfo(text + '\n' + (entry.place || ''));
    results.push({
      id: 'privacy',
      label: '실명, 주소, 연락처 등 클라이언트를 알 수 있는 정보가 없다.',
      status: !text.trim() ? 'empty' : priv.length ? 'warn' : 'ok',
      message: priv.length
        ? '확인이 필요한 표현이 있어요. 이니셜이나 가명(A씨, 70대 여성)으로 바꾸세요.'
        : '전화번호·주소·실명 형태의 표현을 찾지 못했어요. 기관명 등 특정 가능한 정보도 한 번 더 보세요.',
      items: priv.map(function (h) { return h.type + ': ' + h.value; })
    });

    // 2. 육하원칙
    const wh = sixWh(content);
    const whMissing = wh.filter(function (p) { return !p.ok; }).map(function (p) { return p.key; });
    const tt = timetableLines(content);
    const whItems = whMissing.length ? ['빠진 것 같은 요소: ' + whMissing.join(', ')] : [];
    if (tt >= 3) whItems.push('시간대별 줄이 ' + tt + '개예요. 시간표 나열보다 핵심 활동 1~2개를 자세히 쓰세요.');
    results.push({
      id: 'facts',
      label: '실습 내용에 언제, 어디서, 누구와, 무엇을 했는지 사실이 들어 있다.',
      status: !content.trim() ? 'empty' : whMissing.length <= 0 && tt < 3 ? 'ok' : 'warn',
      message: !content.trim()
        ? '‘실습 내용’을 먼저 써 주세요.'
        : whMissing.length ? '육하원칙 중 일부가 보이지 않아요.' : tt >= 3 ? '시간표 나열에 가까워요.' : '언제·어디서·누구와·무엇을이 모두 보여요.',
      items: whItems
    });

    // 3. 사실과 해석 구분
    const interpC = findWords(content, INTERPRETIVE_WORDS.concat(SUBJECTIVE_WORDS));
    const interpO = findWords(observation, SUBJECTIVE_WORDS);
    const fiItems = [];
    if (interpC.length) fiItems.push('실습 내용: ' + interpC.map(function (w) { return '“' + w + '”'; }).join(', '));
    if (interpO.length) fiItems.push('관찰·분석: ' + interpO.map(function (w) { return '“' + w + '”'; }).join(', '));
    results.push({
      id: 'factInterp',
      label: '사실과 해석을 구분해서 썼다.',
      status: !(content + observation).trim() ? 'empty' : fiItems.length ? 'warn' : 'ok',
      message: fiItems.length
        ? '해석·평가로 읽힐 수 있는 표현이에요. 눈에 보인 행동(예: “목소리를 높이며 서류를 내려놓았다”)을 먼저 쓰고 해석은 그다음에 쓰세요.'
        : '감정·평가 표현을 찾지 못했어요. 스스로 한 번 더 확인해 보세요.',
      items: fiItems
    });

    // 4. 이론·가치 연결
    const theory = findWords(text, THEORY_WORDS);
    results.push({
      id: 'theory',
      label: '이론이나 가치와 연결한 문장이 한 줄 이상 있다.',
      status: !text.trim() ? 'empty' : theory.length ? 'ok' : 'warn',
      message: theory.length
        ? '이론·가치 관련 표현: ' + theory.join(', ')
        : '강점관점, 생태체계, 자기결정권, 윤리강령 등과 한두 줄이라도 연결해 보세요.',
      items: []
    });

    // 5. 판단·낙인 표현
    const stigma = STIGMA_WORDS.filter(function (s) { return text.indexOf(s.word) !== -1; });
    results.push({
      id: 'stigma',
      label: '“불쌍한”, “문제 가정” 같은 판단·낙인 표현이 없다.',
      status: !text.trim() ? 'empty' : stigma.length ? 'warn' : 'ok',
      message: stigma.length ? '판단·낙인으로 읽힐 수 있는 표현이 있어요.' : '목록에 있는 판단·낙인 표현은 없어요.',
      items: stigma.map(function (s) { return '“' + s.word + '” → ' + s.suggest; })
    });

    // 6. 성찰 3단계
    const steps = [
      { key: '무엇을', v: entry.what },
      { key: '그래서', v: entry.soWhat },
      { key: '앞으로', v: entry.nowWhat }
    ];
    const short = steps.filter(function (s) { return len(s.v) < 20; }).map(function (s) { return s.key; });
    const reflText = textOf(entry, ['what', 'soWhat', 'nowWhat']);
    const vague = findWords(reflText, VAGUE_FEELINGS);
    const refItems = [];
    if (short.length) refItems.push('더 써야 할 단계: ' + short.join(', ') + ' (각 20자 이상 권장)');
    if (vague.length && len(entry.soWhat) < 60) {
      refItems.push('“' + vague.join('”, “') + '”로 끝나지 않았나요? 왜 그렇게 느꼈는지, 내 경험·가치관과 어떻게 이어지는지 써 보세요.');
    }
    results.push({
      id: 'reflection',
      label: '“무엇을 → 그래서 → 앞으로”에 맞춰 성찰을 썼다.',
      status: !reflText.trim() ? 'empty' : refItems.length ? 'warn' : 'ok',
      message: refItems.length ? '성찰 3단계를 보완해 보세요.' : '세 단계가 모두 채워져 있어요.',
      items: refItems
    });

    // 7. 질문·향후 계획
    const q = entry.questions || '';
    const hasQ = findWords(q, QUESTION_HINTS).length > 0;
    results.push({
      id: 'questions',
      label: '슈퍼바이저에게 드릴 질문이나 다음 계획이 있다.',
      status: !q.trim() ? 'empty' : len(q) >= 10 ? 'ok' : 'warn',
      message: !q.trim()
        ? '비워두지 말고 질문 하나, 다음에 시도할 것 하나를 써 보세요.'
        : len(q) < 10 ? '조금 더 구체적으로 써 보세요.'
        : hasQ ? '질문과 계획이 있어요.' : '계획은 있어요. 슈퍼바이저께 여쭐 질문도 하나 더해 보세요.',
      items: []
    });

    // 추가: 다른 날 일지와 같은 문장
    const dups = duplicateSentences(entry, otherEntries);
    const extra = {
      id: 'duplicate',
      label: '다른 날 일지와 같은 문장을 반복하지 않았다.',
      status: dups.length >= 2 ? 'warn' : 'ok',
      message: dups.length >= 2
        ? '다른 날 일지와 똑같은 문장이 ' + dups.length + '개 있어요. 매일 비슷한 문장을 붙이면 슈퍼비전의 의미가 사라져요.'
        : '',
      items: dups.slice(0, 5)
    };

    return { checklist: results, extra: extra };
  }

  const api = {
    run: run,
    findPrivateInfo: findPrivateInfo,
    sixWh: sixWh,
    duplicateSentences: duplicateSentences,
    STIGMA_WORDS: STIGMA_WORDS,
    THEORY_WORDS: THEORY_WORDS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Checks = api;
})(typeof window !== 'undefined' ? window : this);
