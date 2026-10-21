import { describe, expect, it } from 'vitest';
import { courseLine, dDay, monthDayLabel, namesLine, owesMoney, peopleLabel, placeLabel, settleSummary, talkSummary, weekDays, weekTitle } from './eventView';
import type { CandidateDto, SegmentDto, TransferDto } from './server';

const seg = (themeName: string, branchName: string | null): SegmentDto =>
  ({ themeName, branchName, themeKey: null, startMin: 600, endMin: 670, playedBy: [] }) as SegmentDto;
const tr = (from: string, to: string, paid = false): TransferDto =>
  ({ from: { uid: from, nickname: from }, to: { uid: to, nickname: to }, amount: 1000, paid, paidAt: null });
const item = { id: 1, label: '방탈출', amount: 132000, payer: { uid: 'b', nickname: 'b' }, shares: [] };

describe('dDay', () => {
  it('오늘·D-n·지난 날', () => {
    expect(dDay('2026-10-21', '2026-10-21')).toBe('오늘');
    expect(dDay('2026-10-24', '2026-10-21')).toBe('D-3');
    expect(dDay('2026-11-01', '2026-10-31')).toBe('D-1');
    expect(dDay('2026-10-20', '2026-10-21')).toBe('D+1');
  });
});

describe('monthDayLabel', () => {
  it('연도 없이 월·일·요일', () => expect(monthDayLabel('2026-10-24')).toBe('10월 24일 (토)'));
});

describe('placeLabel', () => {
  it('적어 둔 위치가 먼저', () => expect(placeLabel({ location: ' 강남역 11번 출구 ', segments: [seg('a', '키이스케이프 강남점')] })).toBe('강남역 11번 출구'));
  it('없으면 구간 매장을 겹치지 않게', () => {
    expect(placeLabel({ location: null, segments: [seg('a', '제로월드 강남점'), seg('b', '제로월드 강남점'), seg('c', '키이스케이프 강남점'), seg('d', null)] }))
      .toBe('제로월드 강남점 · 키이스케이프 강남점');
  });
  it('둘 다 없으면 빈 글', () => expect(placeLabel({ location: '  ', segments: [] })).toBe(''));
});

describe('courseLine · peopleLabel', () => {
  it('테마를 화살표로', () => expect(courseLine({ segments: [seg('심야 병동', null), seg('비밀의 화원', null)] })).toBe('심야 병동 → 비밀의 화원'));
  it('정원 있음·마감·정원 없음', () => {
    expect(peopleLabel({ count: 4, capacity: 6 })).toEqual({ n: '4/6명', left: '2자리 남음' });
    expect(peopleLabel({ count: 6, capacity: 6 })).toEqual({ n: '6/6명', left: '마감' });
    expect(peopleLabel({ count: 3, capacity: null })).toEqual({ n: '3명', left: '' });
  });
});

describe('talkSummary', () => {
  it('후보 수와 한 번이라도 답한 사람 수', () => {
    const r = (uid: string) => ({ uid, nickname: uid, available: true, startMin: null, endMin: null, updatedAt: '' });
    const cands = [{ date: '2026-10-24', responses: [r('a'), r('b')] }, { date: '2026-10-25', responses: [r('a'), r('c')] }, { date: '2026-10-26', responses: [] }] as CandidateDto[];
    expect(talkSummary({ candidates: cands })).toBe('후보 3개 · 응답 3명');
    expect(talkSummary({ candidates: [] })).toBe('후보 0개 · 응답 0명');
  });
});

describe('settleSummary · owesMoney', () => {
  it('받은 정산 — 합계와 남은 송금', () => {
    expect(settleSummary(132000, { items: [item], total: 132000, transfers: [tr('a', 'b'), tr('c', 'b', true), tr('d', 'b')] })).toBe('132,000원 · 보낼 돈 2건 남음');
    expect(settleSummary(132000, { items: [item], total: 132000, transfers: [tr('a', 'b', true)] })).toBe('132,000원 · 다 보냈어요');
    expect(settleSummary(132000, { items: [item], total: 132000, transfers: [] })).toBe('132,000원 · 주고받을 돈 없음');
  });
  it('아직 못 받았으면 목록의 합계만, 없으면 아직 없어요', () => {
    expect(settleSummary(50000, null)).toBe('50,000원');
    expect(settleSummary(null, null)).toBe('아직 없어요');
    expect(settleSummary(null, { items: [], total: 0, transfers: [] })).toBe('아직 없어요');
  });
  it('내가 안 보낸 송금이 있을 때만', () => {
    expect(owesMoney({ transfers: [tr('me', 'b')] }, 'me')).toBe(true);
    expect(owesMoney({ transfers: [tr('me', 'b', true), tr('b', 'me')] }, 'me')).toBe(false);
    expect(owesMoney(null, 'me')).toBe(false);
  });
});

describe('weekDays · weekTitle', () => {
  it('오늘이 든 일~토', () => {
    expect(weekDays('2026-10-21')).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
    expect(weekDays('2026-11-01')[0]).toBe('2026-11-01'); // 일요일이면 그날부터
    expect(weekDays('2026-10-31')).toContain('2026-10-25');
  });
  it('그 달 몇째 주(1일이 든 주가 첫째)', () => {
    expect(weekTitle('2026-10-21')).toBe('10월 넷째 주'); // 10/1 목요일
    expect(weekTitle('2026-10-01')).toBe('10월 첫째 주');
    expect(weekTitle('2026-10-04')).toBe('10월 둘째 주');
    expect(weekTitle('2026-11-30')).toBe('11월 다섯째 주');
  });
});

describe('namesLine — 홈 다음 일정 참여자 이름 한 줄', () => {
  it('"열쇠 외 3명" · 한 명이면 이름만 · 없으면 빈 글', () => {
    expect(namesLine(['열쇠', '미로', '단서', '자물쇠'])).toBe('열쇠 외 3명');
    expect(namesLine(['열쇠', '미로'])).toBe('열쇠 외 1명');
    expect(namesLine(['열쇠'])).toBe('열쇠');
    expect(namesLine([])).toBe('');
  });
});
