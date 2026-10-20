import { describe, expect, it } from 'vitest';
import type { EventDto, SettlementDto, SettlementItemDto, TransferDto } from './server';
import {
  canMark, commas, draftFrom, draftInput, draftIssue, draftShares, gapText, headCount, isEven, itemLine, myDue, orderTransfers,
  parseWon, payInfoMissing, payIssue, progress, settlePeople, settleText, splitEven, toInputs, withItem, won,
} from './settle';

const W = (uid: string, nickname = uid) => ({ uid, nickname });
const item = (o: Partial<SettlementItemDto> & { amount: number }): SettlementItemDto => ({
  id: 1, label: '방탈출', payer: W('a', '방탈출러버'), shares: [], ...o,
});
const tr = (from: string, to: string, amount: number, paid = false): TransferDto => ({ from: W(from, `닉${from}`), to: W(to, `닉${to}`), amount, paid, paidAt: null });
const dto = (o: Partial<SettlementDto>): SettlementDto => ({
  eventId: 1, version: 3, updatedAt: null, updatedBy: null, items: [], total: 0, transfers: [], payInfo: {}, ...o,
});
const ev = (o: Partial<EventDto> = {}) => ({
  title: '월야애담 정모', segments: [], date: '2026-10-24',
  participants: [{ uid: 'a', nickname: '방탈출러버', addedBy: null, joinedAt: '' }, { uid: 'b', nickname: '열쇠', addedBy: null, joinedAt: '' }],
  ...o,
});

describe('금액 글자', () => {
  it('쉼표·원', () => {
    expect(commas(132000)).toBe('132,000');
    expect(won(26400)).toBe('26,400원');
    expect(won(0)).toBe('0원');
    expect(won(10_000_000)).toBe('10,000,000원');
  });
  it('입력 칸 — 숫자만, 비면 null, 앞 0 떼기', () => {
    expect(parseWon('132,000원')).toBe(132000);
    expect(parseWon(' 0012 ')).toBe(12);
    expect(parseWon('')).toBeNull();
    expect(parseWon('원')).toBeNull();
    expect(parseWon('0')).toBe(0);
    expect(Number.isInteger(parseWon('1.5'))).toBe(true); // 소수점은 숫자가 아니라 빠진다 — 늘 정수(서버는 정수만 받는다)
  });
});

describe('똑같이 나누기(§4.13)', () => {
  it('나누어떨어지면 모두 같다', () => {
    expect(splitEven(132000, ['a', 'b', 'c', 'd', 'e'], 'a').map((s) => s.amount)).toEqual([26400, 26400, 26400, 26400, 26400]);
  });
  it('1인은 10원 단위 내림, 남는 돈은 결제한 사람 몫에', () => {
    const r = splitEven(10000, ['a', 'b', 'c'], 'b');
    expect(r).toEqual([{ uid: 'a', amount: 3330 }, { uid: 'b', amount: 3340 }, { uid: 'c', amount: 3330 }]);
    expect(r.reduce((x, s) => x + s.amount, 0)).toBe(10000);
  });
  it('결제한 사람이 같이 낸 사람이 아니면 첫 사람 몫에', () => {
    expect(splitEven(1005, ['b', 'c'], 'a')).toEqual([{ uid: 'b', amount: 505 }, { uid: 'c', amount: 500 }]);
  });
  it('작은 금액(1인 0원)도 합은 맞다', () => {
    expect(splitEven(7, ['a', 'b', 'c'], 'c')).toEqual([{ uid: 'a', amount: 0 }, { uid: 'b', amount: 0 }, { uid: 'c', amount: 7 }]);
    expect(splitEven(1000, [], 'a')).toEqual([]);
  });
  it('조정됨 판정 — 똑같이 나눈 그대로면 아니다. 서버가 순서를 바꿔 돌려줘도 같다', () => {
    const even = splitEven(10000, ['a', 'b', 'c'], 'b');
    expect(isEven(10000, even, 'b')).toBe(true);
    expect(isEven(10000, [...even].reverse(), 'b')).toBe(true);
    const notPayer = splitEven(1005, ['b', 'c'], 'a');
    expect(isEven(1005, [notPayer[1], notPayer[0]], 'a')).toBe(true);
    expect(isEven(10000, [{ uid: 'a', amount: 3340 }, { uid: 'b', amount: 3330 }, { uid: 'c', amount: 3330 }], 'b')).toBe(false);
    expect(isEven(10000, [{ uid: 'a', amount: 5000 }, { uid: 'b', amount: 2500 }, { uid: 'c', amount: 2500 }], 'b')).toBe(false);
  });
  it('합 검사 문구', () => {
    expect(gapText(10000, [{ uid: 'a', amount: 4000 }, { uid: 'b', amount: 4000 }])).toBe('합이 2,000원 모자라요');
    expect(gapText(10000, [{ uid: 'a', amount: 6000 }, { uid: 'b', amount: 5000 }])).toBe('합이 1,000원 남아요');
    expect(gapText(10000, [{ uid: 'a', amount: 6000 }, { uid: 'b', amount: 4000 }])).toBe('');
  });
  it('항목 줄 — 1인 금액, 고친 것이면 조정됨', () => {
    const shares = splitEven(132000, ['a', 'b', 'c', 'd', 'e'], 'a').map((s) => ({ ...s, nickname: s.uid }));
    expect(itemLine(item({ amount: 132000, shares }))).toBe('방탈출러버 결제 · 5명 · 1인 26,400원');
    expect(itemLine(item({ amount: 10000, shares: [{ ...W('a'), amount: 7000 }, { ...W('b'), amount: 3000 }] }))).toBe('방탈출러버 결제 · 2명 · 조정됨');
  });
});

describe('항목 고치기 창', () => {
  const people = settlePeople(ev(), null);
  it('새 항목 — 첫 항목은 "방탈출", 결제한 사람은 나, 같이 낸 사람은 지금 참여자 전원', () => {
    expect(draftFrom(null, people, 'b', true)).toEqual({ label: '방탈출', amount: null, payerUid: 'b', sharers: ['a', 'b'], custom: null });
    expect(draftFrom(null, people, 'zz', false).payerUid).toBe('a');
    expect(draftFrom(null, people, 'a', false).label).toBe('');
  });
  it('검사 — 이름·금액·사람·합', () => {
    const d = draftFrom(null, people, 'a', true);
    expect(draftIssue({ ...d, label: ' ' })).toBe('항목 이름을 적어 주세요.');
    expect(draftIssue({ ...d, label: '가'.repeat(21), amount: 1000 })).toBe('항목 이름은 20자까지예요.');
    expect(draftIssue(d)).toBe('금액을 적어 주세요.');
    expect(draftIssue({ ...d, amount: 10_000_001 })).toBe('금액은 10,000,000원까지예요.');
    expect(draftIssue({ ...d, amount: 1000, sharers: [] })).toBe('같이 낸 사람을 한 명 이상 골라 주세요.');
    expect(draftIssue({ ...d, amount: 1000, custom: { a: 100, b: 100 } })).toBe('합이 800원 모자라요');
    expect(draftIssue({ ...d, amount: 1000 })).toBe('');
  });
  it('사람별로 고치면 그 값 그대로, 다시 똑같이(custom null)면 나눈 값', () => {
    const d = { ...draftFrom(null, people, 'a', true), amount: 10000 };
    expect(draftShares(d)).toEqual([{ uid: 'a', amount: 5000 }, { uid: 'b', amount: 5000 }]);
    expect(draftShares({ ...d, custom: { a: 7000, b: 3000 } })).toEqual([{ uid: 'a', amount: 7000 }, { uid: 'b', amount: 3000 }]);
    expect(draftInput({ ...d, label: ' 저녁 ' })).toEqual({ label: '저녁', amount: 10000, payerUid: 'a', shares: [{ uid: 'a', amount: 5000 }, { uid: 'b', amount: 5000 }] });
  });
  it('있는 항목 — 조정된 것이면 custom 으로 그대로 연다', () => {
    const it2 = item({ amount: 10000, payer: W('b', '열쇠'), shares: [{ ...W('a'), amount: 7000 }, { ...W('b'), amount: 3000 }] });
    expect(draftFrom(it2, people, 'a', false)).toMatchObject({ label: '방탈출', amount: 10000, payerUid: 'b', sharers: ['a', 'b'], custom: { a: 7000, b: 3000 } });
    const even = item({ amount: 10000, payer: W('a'), shares: [{ ...W('b'), amount: 5000 }, { ...W('a'), amount: 5000 }] });
    expect(draftFrom(even, people, 'a', false).custom).toBeNull();
  });
  it('고를 사람 — 참여자 + 저장된 항목에만 있는 사람(참여를 뺀 사람)', () => {
    const d = dto({ items: [item({ amount: 9000, payer: W('x', '나간사람'), shares: [{ ...W('a', '방탈출러버'), amount: 4500 }, { ...W('x', '나간사람'), amount: 4500 }] })] });
    expect(settlePeople(ev(), d)).toEqual([
      { uid: 'a', nickname: '방탈출러버', gone: false }, { uid: 'b', nickname: '열쇠', gone: false }, { uid: 'x', nickname: '나간사람', gone: true }]);
    expect(draftFrom(null, settlePeople(ev(), d), 'a', false).sharers).toEqual(['a', 'b']); // 새 항목 기본은 지금 참여자만
  });
  it('항목 하나 바꾼 전체 목록(PUT 본문) — 더하기·바꾸기·지우기, 정수 그대로', () => {
    const items = [item({ id: 7, amount: 1000, shares: [{ ...W('a'), amount: 1000 }] }), item({ id: 8, label: '저녁', amount: 2000, shares: [{ ...W('b'), amount: 2000 }] })];
    const x = { label: '카페', amount: 300, payerUid: 'a', shares: [{ uid: 'a', amount: 300 }] };
    expect(withItem(items, null, x).map((i) => i.label)).toEqual(['방탈출', '저녁', '카페']);
    expect(withItem(items, 1, x).map((i) => i.label)).toEqual(['방탈출', '카페']);
    expect(withItem(items, 0, null).map((i) => i.label)).toEqual(['저녁']);
    expect(toInputs(items)[0]).toEqual({ label: '방탈출', amount: 1000, payerUid: 'a', shares: [{ uid: 'a', amount: 1000 }] });
    expect(JSON.parse(JSON.stringify(withItem(items, null, x)))[2].amount).toBe(300);
  });
});

describe('보낼 돈', () => {
  const ts = [tr('c', 'a', 100), tr('b', 'a', 200, true), tr('me', 'a', 300), tr('d', 'me', 50)];
  it('내가 보낼 줄 먼저, 그다음 받을 줄, 나머지는 서버 순서', () => {
    expect(orderTransfers(ts, 'me').map((t) => `${t.from.uid}>${t.to.uid}`)).toEqual(['me>a', 'd>me', 'c>a', 'b>a']);
  });
  it('진행·내가 안 보낸 돈·사람 수', () => {
    expect(progress({ transfers: ts })).toEqual({ paid: 1, total: 4 });
    expect(myDue({ transfers: ts }, 'me')).toBe(300);
    expect(myDue({ transfers: [tr('me', 'a', 300, true)] }, 'me')).toBe(0);
    expect(myDue(null, 'me')).toBe(0);
    expect(headCount({ items: [item({ amount: 1, shares: [{ ...W('a'), amount: 1 }, { ...W('b'), amount: 0 }] }), item({ amount: 1, shares: [{ ...W('b'), amount: 1 }] })] })).toBe(2);
  });
  it('보냈어요 — 보내는 사람·받는 사람·운영진/만든 사람만', () => {
    expect(canMark(tr('me', 'a', 1), 'me', false)).toBe(true);
    expect(canMark(tr('a', 'me', 1), 'me', false)).toBe(true);
    expect(canMark(tr('a', 'b', 1), 'me', false)).toBe(false);
    expect(canMark(tr('a', 'b', 1), 'me', true)).toBe(true);
  });
  it('송금 정보 안내 — 받을 돈이 있는데 두 칸 다 비었을 때만(payInfo 에는 받는 사람 전원이 null 로라도 온다)', () => {
    expect(payInfoMissing({ transfers: [tr('a', 'me', 1)], payInfo: { me: { bankText: null, kakaopayUrl: null } } }, 'me')).toBe(true);
    expect(payInfoMissing({ transfers: [tr('a', 'me', 1)], payInfo: {} }, 'me')).toBe(true);
    expect(payInfoMissing({ transfers: [tr('a', 'me', 1)], payInfo: { me: { bankText: '카뱅 1', kakaopayUrl: null } } }, 'me')).toBe(false);
    expect(payInfoMissing({ transfers: [tr('me', 'a', 1)], payInfo: {} }, 'me')).toBe(false);
  });
});

describe('텍스트로 뽑기', () => {
  const d = dto({
    items: [
      item({ amount: 132000, payer: W('a', '방탈출러버'), shares: ['a', 'b', 'c', 'd', 'e'].map((u) => ({ ...W(u), amount: 26400 })) }),
      item({ id: 2, label: '저녁', amount: 80000, payer: W('b', '열쇠'), shares: [{ ...W('a'), amount: 30000 }, { ...W('b'), amount: 20000 }, { ...W('c'), amount: 15000 }, { ...W('d'), amount: 15000 }] }),
    ],
    total: 212000,
    transfers: [{ ...tr('b', 'a', 6400), from: W('b', '열쇠'), to: W('a', '방탈출러버') }, { ...tr('c', 'a', 41400, true), from: W('c', '방린이'), to: W('a', '방탈출러버') }],
    payInfo: { a: { bankText: '카카오뱅크 3333-01-1234567 홍길동', kakaopayUrl: 'https://qr.kakaopay.com/abc' } },
  });
  it('제목·날짜, 항목별 금액·결제한 사람·인원, 모두, 보낼 돈, 받는 사람 계좌', () => {
    expect(settleText(ev(), d)).toBe([
      '[정산] 10/24(토) 월야애담 정모',
      '방탈출 132,000원 · 방탈출러버 결제 · 5명',
      '저녁 80,000원 · 열쇠 결제 · 4명 (조정됨)',
      '모두 212,000원',
      '',
      '보낼 돈',
      '열쇠 → 방탈출러버 6,400원',
      '방린이 → 방탈출러버 41,400원 (보냄)',
      '',
      '받는 사람 계좌',
      '방탈출러버: 카카오뱅크 3333-01-1234567 홍길동',
      '방탈출러버 카카오페이: https://qr.kakaopay.com/abc',
    ].join('\n'));
  });
  it('날짜 미정 일정은 날짜 없이, 송금이 없으면 그렇게, 계좌가 없으면 그 절이 빠진다', () => {
    const t = settleText(ev({ date: null }), dto({ items: [], total: 0 }));
    expect(t).toBe('[정산] 월야애담 정모\n모두 0원\n\n보낼 돈\n보낼 돈이 없어요.');
  });
});

describe('송금 정보 검사(§4.13)', () => {
  it('계좌 글 60자, 카카오페이 링크는 https://qr.kakaopay.com/ 으로 시작·공백 없음·200자', () => {
    expect(payIssue('', '')).toBe('');
    expect(payIssue('가'.repeat(60), '')).toBe('');
    expect(payIssue('가'.repeat(61), '')).toBe('계좌 글은 60자까지 적을 수 있어요.');
    expect(payIssue('', 'https://qr.kakaopay.com/Ej7abc')).toBe('');
    expect(payIssue('', 'http://qr.kakaopay.com/x')).toMatch(/으로 시작하는 주소만/);
    expect(payIssue('', 'https://qr.kakaopay.com/')).toMatch(/으로 시작하는 주소만/);
    expect(payIssue('', 'https://qr.kakaopay.com/a b')).toMatch(/으로 시작하는 주소만/);
    expect(payIssue('', 'https://qr.kakaopay.com/' + 'a'.repeat(200))).toMatch(/200자/);
  });
});
