// 실행: node --test tests/checks.test.js
const test = require('node:test');
const assert = require('node:assert');
const Checks = require('../js/checks.js');

const statusOf = (entry, id, others) =>
  Checks.run(entry, others || []).checklist.find((c) => c.id === id).status;

// 안내문의 "고치기 전 / 고친 후" 예시
const before = {
  content: '오늘은 경로당 어르신들과 프로그램을 했다.',
  observation: '어르신들이 너무 좋아하셨다. 고집이 셌다.',
  what: '어르신들이 너무 좋아하셔서 보람 있었다.',
  soWhat: '역시 어르신들은 관심을 받는 걸 좋아하시는 것 같다.',
  nowWhat: '',
  questions: ''
};

const after = {
  content: '오전 10시, ○○경로당 어르신 9명 대상 회상 프로그램에서 진행 보조를 맡았다.',
  observation: '처음에 참여를 거부하던 B씨(80대 여성)가 다른 어르신이 젊은 시절 사진을 소개하자 자신도 결혼사진 이야기를 시작했다.',
  what: 'B씨가 동료 어르신의 사진 이야기를 듣고 결혼사진 이야기를 시작한 장면.',
  soWhat: '나는 예전 요양원 근무 경험상 관심을 주면 참여하신다고 생각했는데, 오늘은 동료 어르신의 이야기가 계기가 되었다. 이는 집단 내 상호작용의 힘을 보여주는 장면이라고 생각한다.',
  nowWhat: '다음 회기에는 참여가 적은 어르신이 다른 분의 이야기에 반응할 수 있도록 순서를 조정해 보고 싶다.',
  questions: '이에 대해 슈퍼바이저님의 의견을 여쭙고 싶다.'
};

test('고친 후 예시는 7개 항목을 모두 통과한다', () => {
  const r = Checks.run(after, []);
  for (const c of r.checklist) assert.strictEqual(c.status, 'ok', c.id + ': ' + c.message);
});

test('고치기 전 예시는 여러 항목에서 경고가 나온다', () => {
  assert.strictEqual(statusOf(before, 'facts'), 'warn');
  assert.strictEqual(statusOf(before, 'factInterp'), 'warn');
  assert.strictEqual(statusOf(before, 'theory'), 'warn');
  assert.strictEqual(statusOf(before, 'reflection'), 'warn');
  assert.strictEqual(statusOf(before, 'questions'), 'empty');
});

test('개인정보: 전화번호, 주소, 실명 형태를 찾는다', () => {
  const hits = Checks.findPrivateInfo('박철수씨 010-1234-5678, 서울시 강남구 테헤란로 123, 101동 202호');
  const types = hits.map((h) => h.type);
  assert.ok(types.includes('전화번호'));
  assert.ok(types.includes('주소'));
  assert.ok(hits.some((h) => h.value === '박철수씨'));
});

test('개인정보: 가명·장소·꾸밈말은 실명으로 보지 않는다', () => {
  const hits = Checks.findPrivateInfo('A씨, 70대 여성, 경로당 어르신, 복지관 선생님, 동료 어르신, 조용한 어르신, 오늘 어르신들');
  assert.deepStrictEqual(hits, []);
});

test('판단·낙인 표현을 찾는다', () => {
  const e = Object.assign({}, after, { observation: '불쌍한 분이었다. 문제 가정에서 자랐다.' });
  assert.strictEqual(statusOf(e, 'stigma'), 'warn');
});

test('다른 날 일지와 같은 문장을 반복하면 경고한다', () => {
  const r = Checks.run(after, [Object.assign({}, after, { id: 'other' })]);
  assert.strictEqual(r.extra.status, 'warn');
  assert.ok(r.extra.items.length >= 2);
});

test('시간표 나열을 알아챈다', () => {
  const e = Object.assign({}, after, { content: '09:00 출근\n10:00 프로그램 보조\n12:00 점심\n13:00 회의' });
  assert.strictEqual(statusOf(e, 'facts'), 'warn');
});
