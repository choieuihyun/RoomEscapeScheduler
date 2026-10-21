import { describe, expect, it } from 'vitest';
import { condSummary, endsNextDay, firstChar, foldChips, sessionCounts, themesInfo, timeText } from './calcView';
import { gapText, hm, resultToText, waitOf } from './resultText';
import type { OptionsState } from './serialize';
import type { PathStep, SearchResultRow } from './core';

const O = (o: Partial<OptionsState> = {}): OptionsState => ({
  oStart: '', oEnd: '', oMinGap: '10', oMaxGap: '', oPartial: false, oMeal: false, oMealFrom: '11:30', oMealTo: '14:00', oMealMin: '40',
  oMove: '10', oTeam: false, oIncludeSoldout: false, oFixedOrder: false, ...o,
});

describe('foldChips — 회차 칩 두 줄 접기', () => {
  it('두 줄에 다 들어가면 다 보인다', () => {
    expect(foldChips(10, 5)).toEqual({ shown: 10, more: 0 });
    expect(foldChips(3, 5)).toEqual({ shown: 3, more: 0 });
    expect(foldChips(0, 5)).toEqual({ shown: 0, more: 0 });
  });
  it('넘치면 마지막 칸이 "+n개" — 그 칸 몫도 n 에 센다', () => {
    expect(foldChips(12, 5)).toEqual({ shown: 9, more: 3 });
    expect(foldChips(11, 5)).toEqual({ shown: 9, more: 2 });
  });
  it('칸 수를 아직 못 쟀으면(0) 한 칸으로 본다', () => {
    expect(foldChips(5, 0)).toEqual({ shown: 1, more: 4 });
  });
});

describe('condSummary — 접힌 조건 두 줄(시간 범위는 맨 위 줄이 맡는다)', () => {
  it('목업 예: 대기 10–120분 · 이동 15분 / 옵션 1개 켬', () => {
    expect(condSummary(O({ oStart: '10:00', oEnd: '22:00', oMove: '15', oMaxGap: '120', oPartial: true })))
      .toEqual(['대기 10–120분 · 이동 15분', '옵션 1개 켬']);
  });
  it('비운 칸 — 최대 대기 없음은 "n분 이상", 옵션 없으면 "추가 옵션 없음"', () => {
    expect(condSummary(O())).toEqual(['대기 10분 이상 · 이동 10분', '추가 옵션 없음']);
    expect(condSummary(O({ oMove: '0' }))[0]).toBe('대기 10분 이상 · 이동 없음');
  });
  it('최소 대기 0·빈 칸 — 최대만 있으면 "n분까지", 둘 다 없으면 제한 없음', () => {
    expect(condSummary(O({ oMinGap: '', oMaxGap: '90' }))[0]).toBe('대기 90분까지 · 이동 10분');
    expect(condSummary(O({ oMinGap: '0' }))[0]).toBe('대기 제한 없음 · 이동 10분');
  });
  it('여러 팀이 켜져 있으면 확정한 팀 수', () => {
    expect(condSummary(O({ oTeam: true, oMeal: true }), 2)[1]).toBe('옵션 2개 켬 · 팀 2개 확정');
    expect(condSummary(O({ oTeam: true }), 0)[1]).toBe('옵션 1개 켬');
  });
  it('"공백" 이라고 하지 않는다', () => {
    expect(condSummary(O({ oMaxGap: '60' })).join(' ')).not.toMatch(/공백/);
  });
});

describe('themesInfo — 1단계 머리 오른쪽 글', () => {
  it('불러온 회차가 한 날짜·같은 기준이면 날짜와 기준', () => {
    expect(themesInfo([{ date: '2026-10-29', fresh: '방금 기준' }, { date: '2026-10-29', fresh: '방금 기준' }, {}], false)).toBe('10/29(목) 회차 · 방금 기준');
  });
  it('날짜가 섞이면 날짜를 빼고, 아무것도 없으면 순서 전제', () => {
    expect(themesInfo([{ date: '2026-10-29' }, { date: '2026-10-30' }], false)).toBe('순서는 알아서 찾아요');
    expect(themesInfo([{}], false)).toBe('순서는 알아서 찾아요');
  });
  it('순서 그대로 계산이면 늘 앞에 말한다', () => {
    expect(themesInfo([{}], true)).toBe('넣은 순서대로');
    expect(themesInfo([{ date: '2026-10-29' }], true)).toBe('넣은 순서대로 · 10/29(목) 회차');
  });
});

const st = (i: number, name: string, start: number, dur: number, move = 0, place = ''): PathStep => ({ i, name, place, dur, start, end: start + dur, soldout: false, move });
const row = (steps: PathStep[], moveTotal: number): SearchResultRow => {
  const gaps = steps.slice(1).map((s, k) => s.start - steps[k].end);
  return { steps, count: steps.length, start: steps[0].start, end: steps[steps.length - 1].end, total: gaps.reduce((a, b) => a + b, 0), gaps, varc: 0, minGap: Math.min(...gaps), moveTotal, minWait: 0 };
};

describe('결과 글 — 대기', () => {
  it('hm — 시간·분', () => {
    expect(hm(270)).toBe('4시간 30분');
    expect(hm(240)).toBe('4시간');
    expect(hm(50)).toBe('50분');
  });
  it('gapText — 이동이 있으면 이동·대기, 없으면 대기, 딱 붙으면 바로 이어서', () => {
    expect(gapText(st(0, 'A', 960, 60), st(1, 'B', 1050, 80, 15))).toBe('이동 15분 · 대기 15분');
    expect(gapText(st(0, 'A', 960, 60), st(1, 'B', 1050, 80))).toBe('대기 30분');
    expect(gapText(st(0, 'A', 960, 60), st(1, 'B', 1020, 80))).toBe('바로 이어서');
  });
  it('waitOf — 이동을 뺀 대기 합', () => {
    expect(waitOf(row([st(0, 'A', 960, 60), st(1, 'B', 1050, 80, 15)], 15))).toBe(15);
  });
  it('복사 글은 "공백" 대신 "대기"', () => {
    const plain = resultToText(row([st(0, '셜록의 서재', 960, 60, 0, '홍대점'), st(1, '심야 병동', 1050, 80)], 0));
    expect(plain).toBe('2연방 · 16:00 → 18:50 (2시간 50분, 대기 30분)\n\n16:00–17:00  셜록의 서재 @홍대점 (60분)\n     ↓ 대기 30분\n17:30–18:50  심야 병동 (80분)');
    const moved = resultToText(row([st(0, 'A', 960, 60), st(1, 'B', 1050, 80, 15)], 15));
    expect(moved).toContain('(2시간 50분, 이동 15분 · 대기 15분)');
    expect(moved).toContain('↓ 이동 15분  대기 15분');
    expect(plain + moved).not.toMatch(/공백/);
  });
});

describe('sessionCounts · endsNextDay — 테마 카드 회차 표시', () => {
  it('"예약 가능 n · 매진 m" — 매진이 없으면 앞만, 회차가 없으면 빈 글', () => {
    const ss = (so: boolean[]) => so.map((soldout) => ({ soldout }));
    expect(sessionCounts(ss([false, true, false, true, false]))).toBe('예약 가능 3 · 매진 2');
    expect(sessionCounts(ss([false, false]))).toBe('예약 가능 2');
    expect(sessionCounts(ss([true]))).toBe('예약 가능 0 · 매진 1');
    expect(sessionCounts([])).toBe('');
  });
  it('자정을 걸치는 회차만 — 딱 자정에 끝나거나 자정 뒤에 시작하면 아니다', () => {
    expect(endsNextDay(23 * 60 + 30, 70)).toBe(true);
    expect(endsNextDay(23 * 60, 60)).toBe(false);
    expect(endsNextDay(22 * 60, 70)).toBe(false);
    expect(endsNextDay(24 * 60 + 30, 70)).toBe(false);
  });
});

describe('timeText — 맨 위 가능한 시간 한 줄', () => {
  it('시작·끝', () => {
    expect(timeText({ oStart: '10:00', oEnd: '22:00' })).toBe('10:00 ~ 22:00');
    expect(timeText({ oStart: '13:00', oEnd: '' })).toBe('13:00부터');
    expect(timeText({ oStart: '', oEnd: '23:59' })).toBe('23:59까지');
    expect(timeText({ oStart: ' ', oEnd: '' })).toBe('시간 제한 없음');
  });
});

describe('firstChar — 테마 사진 없는 자리의 첫 글자', () => {
  it('앞 빈칸은 건너뛰고 한 글자, 두 칸 글자(이모지)도 한 글자, 없으면 빈 글', () => {
    expect([firstChar('비밀의 화원'), firstChar('  셜록'), firstChar('🔐 금고'), firstChar(''), firstChar('   ')]).toEqual(['비', '셜', '🔐', '', '']);
  });
});
