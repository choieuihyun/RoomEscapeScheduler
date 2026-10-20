import { describe, expect, it } from 'vitest';
import { dayLabel } from './clubEvents';
import type { PathStep } from './core';
import { decideForm, toInput } from './eventForm';
import { ctxAfter, planInsert } from './eventInsert';
import type { EventDto, SegmentDto } from './server';

const ev = (o: Partial<EventDto> = {}): EventDto => ({
  id: 7, title: '토요 번개', date: null, candidates: [{ date: '2026-10-25', responses: [] }, { date: '2026-10-26', responses: [] }],
  startMin: null, endMin: null, location: '강남역', capacity: 4, booked: false, memo: '늦지 마요', segments: [], version: 5,
  createdBy: { uid: 'u1', nickname: '가' }, createdAt: '', updatedAt: '',
  participants: [], count: 1, joined: true, mine: true, canManage: true, ...o,
});
const step = (name: string, place: string, start: number, end: number) => ({ name, place, start, end }) as PathStep;
const steps = [step('비밀의 화원', '제로월드 강남점', 820, 890), step('셜록의 서재', '제로월드 강남점', 960, 1020)];
const keys = ['zero-gn:1', 'zero-gn:2'];
const seg = (themeName: string, startMin: number) => ({ themeName, branchName: null, themeKey: null, startMin, endMin: null }) as unknown as SegmentDto;

const plan = (e: EventDto, d: string | null = '2026-10-25', st = steps, ks: (string | null)[] = keys) => {
  const p = planInsert(e, st, ks, d);
  if ('error' in p) throw new Error(p.error);
  return p;
};

describe('planInsert — 계산 결과를 그 일정의 구간으로(일정 수정 본문)', () => {
  it('협의 중(날짜 미정) 일정: 결과 날짜로 정하고 구간·테마 키를 넣는다. 후보는 보내지 않아 서버가 그대로 둔다', () => {
    const p = plan(ev());
    expect(p.input.date).toBe('2026-10-25');
    expect('candidates' in p.input).toBe(false);
    expect(p.input.segments).toEqual([
      { themeName: '비밀의 화원', branchName: '제로월드 강남점', themeKey: 'zero-gn:1', startMin: 820, endMin: 890 },
      { themeName: '셜록의 서재', branchName: '제로월드 강남점', themeKey: 'zero-gn:2', startMin: 960, endMin: 1020 },
    ]);
    expect([p.input.booked, p.input.startMin, p.input.endMin]).toEqual([false, null, null]);
    // 제목·위치·정원·메모는 그대로
    expect([p.input.title, p.input.location, p.input.capacity, p.input.memo]).toEqual(['토요 번개', '강남역', 4, '늦지 마요']);
    expect(p.confirm).toBe('');
    expect(p.done).toBe(`'토요 번개' 일정에 테마 2개를 넣고 ${dayLabel('2026-10-25')}에 하기로 정했어요.`);
  });

  it('결과 날짜를 모르면(손으로 넣은 카드) 정해진 일정은 그 날짜, 미정 일정은 막는다', () => {
    expect(plan(ev({ date: '2026-10-25' }), null, steps, [null, null]).input.date).toBe('2026-10-25');
    expect(planInsert(ev(), steps, [null, null], null)).toEqual({ error: expect.stringContaining('날짜를 정할 수 없어요') });
  });

  it('이미 테마가 있는 일정은 덮어쓴다고 묻는다', () => {
    const p = plan(ev({ date: '2026-10-25', segments: [seg('A', 600), seg('B', 700), seg('C', 800)] }));
    expect(p.confirm).toBe('지금 테마 3개를 이 결과로 바꿔요.');
    expect(p.input.segments).toHaveLength(2);
    expect(p.done).toBe("'토요 번개' 일정에 테마 2개를 넣었어요.");
  });

  it('정해진 날짜와 결과 날짜가 다르면, 예약 완료였으면 그것도 같이 묻는다', () => {
    const p = plan(ev({ date: '2026-10-24', booked: true, segments: [seg('A', 600)] }));
    expect(p.input.date).toBe('2026-10-25');
    expect(p.input.booked).toBe(false);
    expect(p.confirm.split('\n')).toEqual([
      '지금 테마 1개를 이 결과로 바꿔요.',
      `일정 날짜도 ${dayLabel('2026-10-24')}에서 ${dayLabel('2026-10-25')}로 바뀌어요.`,
      '예약 완료 표시는 예약 전으로 돌아가요.',
    ]);
  });

  it('첫 회차가 자정 뒤면 날짜를 다음날로 옮겨 정한다(결과 카드 → 일정 등록과 같다)', () => {
    const p = plan(ev(), '2026-10-25', [step('심야 병동', '키이스케이프 홍대점', 1470, 1550)], ['key-hd:1']);
    expect(p.input.date).toBe('2026-10-26');
    expect(p.input.segments[0]).toMatchObject({ startMin: 30, endMin: 110 });
  });

  it('이름·지점은 40자로 자르고, 80자 넘는 테마 키는 싣지 않는다', () => {
    const long = '가'.repeat(45);
    const p = plan(ev(), '2026-10-25', [step(long, '나'.repeat(50), 600, 660)], ['k'.repeat(81)]);
    expect(p.input.segments[0]).toMatchObject({ themeName: '가'.repeat(40), branchName: '나'.repeat(40), themeKey: null });
  });

  it('미정 일정을 후보에 없는 날짜로 정하려면 묻는다(후보 날이면 묻지 않는다)', () => {
    expect(plan(ev(), '2026-10-27').confirm).toBe(`후보에 없는 날짜예요. ${dayLabel('2026-10-27')}로 정할까요?`);
    expect(plan(ev(), '2026-10-26').confirm).toBe('');
    /* 후보 날(10/25) 밤 24:30 회차 — 날짜는 10/26 으로 옮겨 저장하지만 후보 밤이라 묻지 않는다 */
    const late = plan(ev({ candidates: [{ date: '2026-10-25', responses: [] }, { date: '2026-10-27', responses: [] }] }), '2026-10-25',
      [step('심야 병동', '키이스케이프 홍대점', 1470, 1550)], ['key-hd:1']);
    expect([late.confirm, late.input.date, late.input.segments[0].startMin]).toEqual(['', '2026-10-26', 30]);
  });

  it('구간 없이 일정 시각만 있던 정해진 일정은 그 시각이 바뀐다고 묻는다', () => {
    const p = plan(ev({ date: '2026-10-25', startMin: 1140, endMin: 1380 }));
    expect([p.input.startMin, p.input.endMin]).toEqual([null, null]);
    expect(p.confirm).toBe('일정 시각(19:00–23:00)은 테마 시각으로 바뀌어요.');
    expect(plan(ev({ date: '2026-10-25' })).confirm).toBe('');
  });

  it('제목이 없는 일정도 구간이 있으니 저장된다', () => {
    expect(plan(ev({ title: '', date: '2026-10-25', segments: [seg('A', 600)] })).input.title).toBe('');
  });
});

describe("decideForm — '이 날짜로 정하기'(미정 일정 → 후보 날짜)", () => {
  const save = (e: EventDto, d: string) => { const r = toInput(decideForm(e, d)); if ('error' in r) throw new Error(r.error); return r.input; };
  const late = ev({ candidates: [{ date: '2026-10-25', responses: [] }, { date: '2026-10-27', responses: [] }], segments: [{ ...seg('심야 병동', 1470), endMin: 1540 }] });

  it('자정 뒤 구간(1470)은 후보 날 밤 = 다음날 00:30 으로 — "이 일정에 넣기"와 같은 값', () => {
    const i = save(late, '2026-10-25');
    expect([i.date, i.segments.map((g) => [g.startMin, g.endMin])]).toEqual(['2026-10-26', [[30, 100]]]);
    const p = plan(late, '2026-10-25', [step('심야 병동', '키이스케이프 강남점', 1470, 1540)], [null]);
    expect([i.date, i.segments[0].startMin, i.segments[0].endMin]).toEqual([p.input.date, p.input.segments[0].startMin, p.input.segments[0].endMin]);
    /* 두 번째 후보로 정해도 그 후보 기준 */
    expect(save(late, '2026-10-27').date).toBe('2026-10-28');
    expect('candidates' in i).toBe(false);
  });

  it('구간 없이 자정 뒤 시각(24:30)만 있는 일정도 다음날 00:30, 낮 시각이면 고른 날 그대로', () => {
    const timed = save(ev({ startMin: 1470, endMin: 1530 }), '2026-10-25');
    expect([timed.date, timed.startMin, timed.endMin]).toEqual(['2026-10-26', 30, 90]);
    const day = save(ev({ segments: [{ ...seg('비밀의 화원', 820), endMin: 890 }] }), '2026-10-26');
    expect([day.date, day.segments[0].startMin]).toEqual(['2026-10-26', 820]);
  });
});

describe('ctxAfter — 넣은 뒤 계산 화면의 일정 문맥', () => {
  const ctx = { id: 7, title: '토요 번개', date: null };
  it('성공·지워진 일정이면 놓고, 충돌·실패·취소면 그대로(다시 누를 수 있게)', () => {
    expect(ctxAfter(ctx, 'ok')).toBeNull();
    expect(ctxAfter(ctx, 'gone')).toBeNull();
    expect(ctxAfter(ctx, 'conflict')).toBe(ctx);
    expect(ctxAfter(ctx, 'error')).toBe(ctx);
    expect(ctxAfter(ctx, 'cancel')).toBe(ctx);
  });
});
