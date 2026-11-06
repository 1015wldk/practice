// 실행: node --test tests/chat.test.js
const test = require('node:test');
const assert = require('node:assert');
const Chat = require('../js/chat.js');

test('normalizeModels: Claude 모델만, 최신순, 중복 제거', () => {
  const list = Chat.normalizeModels({
    data: [
      { type: 'model', id: 'claude-old-1', display_name: 'Claude Old', created_at: '2025-01-01T00:00:00Z' },
      { type: 'model', id: 'claude-new-2', display_name: 'Claude New', created_at: '2026-06-01T00:00:00Z' },
      { type: 'model', id: 'gpt-x', display_name: 'Other', created_at: '2026-07-01T00:00:00Z' },
      { type: 'model', id: 'claude-new-2', display_name: 'Claude New (dup)', created_at: '2026-06-01T00:00:00Z' },
      { type: 'model', id: 'claude-mid-3', created_at: '2025-12-01T00:00:00Z' }
    ]
  });
  assert.deepStrictEqual(list.map((m) => m.id), ['claude-new-2', 'claude-mid-3', 'claude-old-1']);
  assert.strictEqual(list[0].name, 'Claude New');
  assert.strictEqual(list[1].name, 'claude-mid-3'); // display_name 이 없으면 id
});

test('normalizeModels: 이상한 응답에도 빈 목록', () => {
  assert.deepStrictEqual(Chat.normalizeModels(null), []);
  assert.deepStrictEqual(Chat.normalizeModels({}), []);
  assert.deepStrictEqual(Chat.normalizeModels({ data: 'x' }), []);
});

test('suggestModel: 가장 최신 Sonnet, 없으면 맨 앞, 비어 있으면 기본값', () => {
  const models = [{ id: 'claude-opus-9' }, { id: 'claude-sonnet-9' }, { id: 'claude-sonnet-8' }];
  assert.strictEqual(Chat.suggestModel(models), 'claude-sonnet-9');
  assert.strictEqual(Chat.suggestModel([{ id: 'claude-opus-9' }]), 'claude-opus-9');
  assert.strictEqual(Chat.suggestModel([]), Chat.DEFAULT_MODEL);
});

test('buildRequest: 스트리밍, 시스템 프롬프트, 질문으로 시작하는 최근 대화', () => {
  const messages = [];
  for (let i = 0; i < 30; i++) messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'm' + i });
  const req = Chat.buildRequest('claude-sonnet-5-5', messages);
  assert.strictEqual(req.model, 'claude-sonnet-5-5');
  assert.strictEqual(req.stream, true);
  assert.ok(req.max_tokens > 0);
  assert.ok(req.system.includes('써 주지 않습니다'));
  assert.ok(req.messages.length <= Chat.MAX_HISTORY);
  assert.strictEqual(req.messages[0].role, 'user');
  assert.strictEqual(req.messages[req.messages.length - 1].content, 'm29');
});

test('trimHistory: assistant 로 시작하면 user 가 나올 때까지 버림', () => {
  const out = Chat.trimHistory([
    { role: 'assistant', content: 'a' },
    { role: 'user', content: 'u' }
  ], 20);
  assert.deepStrictEqual(out, [{ role: 'user', content: 'u' }]);
});

test('headers: 브라우저 직접 호출 헤더 포함, 키는 x-api-key 에만', () => {
  const h = Chat.headers('sk-ant-test', true);
  assert.strictEqual(h['x-api-key'], 'sk-ant-test');
  assert.strictEqual(h['anthropic-version'], '2023-06-01');
  assert.strictEqual(h['anthropic-dangerous-direct-browser-access'], 'true');
  assert.strictEqual(h['content-type'], 'application/json');
  assert.strictEqual(Chat.headers('k', false)['content-type'], undefined);
  assert.ok(!JSON.stringify(Chat.buildRequest('m', [{ role: 'user', content: 'q' }])).includes('sk-ant'));
});

test('checkKey: 빈 값, 이상한 문자, 접두어 경고', () => {
  assert.strictEqual(Chat.checkKey('').ok, false);
  assert.strictEqual(Chat.checkKey('   ').ok, false);
  assert.strictEqual(Chat.checkKey('sk-ant-abc 한글').ok, false);
  assert.strictEqual(Chat.checkKey('sk ant').ok, false);
  const good = Chat.checkKey('  sk-ant-api03-abcdefgh  ');
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.key, 'sk-ant-api03-abcdefgh');
  assert.strictEqual(good.warn, undefined);
  const odd = Chat.checkKey('abcdef123456');
  assert.strictEqual(odd.ok, true);
  assert.ok(odd.warn);
});

test('maskKey: 앞 7자와 뒤 4자만 보임', () => {
  assert.strictEqual(Chat.maskKey('sk-ant-api03-SECRETSECRETWXYZ'), 'sk-ant-…WXYZ');
  assert.strictEqual(Chat.maskKey('short'), '••••');
  assert.strictEqual(Chat.maskKey(''), '');
});

test('parseSSE: 조각난 스트림을 이어 붙여 해석', () => {
  const e1 = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"안녕"}}\n\n';
  const e2 = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"하세요"}}\n\n';
  let r = Chat.parseSSE(e1 + e2.slice(0, 40));
  assert.strictEqual(r.events.length, 1);
  r = Chat.parseSSE(r.rest + e2.slice(40));
  assert.strictEqual(r.events.length, 1);
  assert.strictEqual(r.rest, '');
  assert.strictEqual(Chat.describeEvent(r.events[0]).text, '하세요');
});

test('parseSSE: CRLF 와 깨진 JSON 을 견딤', () => {
  const r = Chat.parseSSE('data: {bad json}\r\n\r\ndata: {"type":"message_stop"}\r\n\r\n');
  assert.strictEqual(r.events.length, 1);
  assert.strictEqual(r.events[0].type, 'message_stop');
});

test('describeEvent: 중단 사유와 오류 이벤트', () => {
  assert.strictEqual(Chat.describeEvent({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }).stop, 'max_tokens');
  assert.deepStrictEqual(Chat.describeEvent({ type: 'ping' }), {});
  const err = Chat.describeEvent({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
  assert.ok(err.error.includes('바빠요'));
});

test('friendlyError: 상태 코드별 안내', () => {
  assert.ok(Chat.friendlyError(401, '').includes('API 키'));
  assert.ok(Chat.friendlyError(404, '').includes('모델'));
  assert.ok(Chat.friendlyError(429, '').includes('잠시'));
  assert.ok(Chat.friendlyError(529, '').includes('바빠요'));
  const credit = JSON.stringify({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the API' } });
  assert.ok(Chat.friendlyError(400, credit).includes('크레딧'));
  assert.ok(Chat.friendlyError(400, JSON.stringify({ error: { message: 'bad field' } })).includes('bad field'));
});

test('parseBlocks: 문단, 글머리, 번호, 제목', () => {
  const blocks = Chat.parseBlocks('먼저 결론입니다.\n이어서 설명.\n\n- 하나\n- 둘\n\n1. 첫째\n2. 둘째\n\n## 제목');
  assert.deepStrictEqual(blocks.map((b) => b.type), ['p', 'ul', 'ol', 'p']);
  assert.strictEqual(blocks[0].text, '먼저 결론입니다.\n이어서 설명.');
  assert.deepStrictEqual(blocks[1].items, ['하나', '둘']);
  assert.deepStrictEqual(blocks[2].items, ['첫째', '둘째']);
  assert.strictEqual(blocks[3].text, '**제목**');
});

test('parseInline: 굵게와 코드만 해석하고 나머지는 글자 그대로', () => {
  const segs = Chat.parseInline('이것은 **중요**하고 `code` 이며 <script>alert(1)</script> 입니다');
  assert.deepStrictEqual(segs.map((s) => s.t), ['text', 'b', 'text', 'code', 'text']);
  assert.strictEqual(segs[1].v, '중요');
  assert.ok(segs[4].v.includes('<script>alert(1)</script>')); // 태그는 해석되지 않고 글자로만 남음
});

test('시스템 프롬프트에 대필 금지와 비밀보장 원칙이 들어 있음', () => {
  assert.ok(Chat.SYSTEM_PROMPT.includes('학생 대신 일지를 써 주지 않습니다'));
  assert.ok(Chat.SYSTEM_PROMPT.includes('이니셜'));
  assert.ok(Chat.SYSTEM_PROMPT.includes('무엇을(What?)'));
});
