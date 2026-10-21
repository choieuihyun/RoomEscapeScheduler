import { describe, expect, it } from 'vitest';
import { pairKey } from './core';
import { planMove, planWaitText } from './planWait';
import { serialize, type AppState, type ThemeState } from './serialize';

const T = (id: number, name: string, dur: number, raw: string, place: string): ThemeState =>
  ({ id, name, dur, raw, place, sessions: [], source: 'manual' });
const snap = (themes: ThemeState[], oMove = '15', moveMap: Record<string, number> = {}): string => serialize({
  themes, moveMap, sortKey: 'gap', teams: [], nextId: 9,
  options: { oStart: '', oEnd: '', oMinGap: '10', oMaxGap: '', oPartial: false, oMeal: false, oMealFrom: '', oMealTo: '',
    oMealMin: '', oMove, oTeam: false, oIncludeSoldout: false, oFixedOrder: false },
} as AppState);

/* 13:00 비밀의 화원(강남, 70분) → 14:40 셜록(홍대, 60분) → 16:00 병동(강남, 80분): 비는 시간 30 + 20 = 50 */
const steps = [
  { name: '비밀의 화원', dur: 70, start: 780, end: 850 },
  { name: '셜록의 서재', dur: 60, start: 880, end: 940 },
  { name: '심야 병동', dur: 80, start: 960, end: 1040 },
];
const themes = [
  T(1, '비밀의 화원', 70, '13:00 15:00', '강남점'),
  T(2, '셜록의 서재', 60, '14:40 16:00', '홍대점'),
  T(3, '심야 병동', 80, '16:00', '강남점'),
];

describe('planMove · planWaitText — 저장한 일정의 대기(결과 카드와 같은 정의)', () => {
  it('저장한 이동 합이 있으면 그걸 뺀다 — 0 도 대기', () => {
    expect(planWaitText({ total: 60, moveTotal: 15 })).toBe('대기 45분');
    expect(planWaitText({ total: 60, moveTotal: 0 })).toBe('대기 60분');
  });
  it('옛 저장값은 snapshot 의 매장·이동 시간으로 다시 센다', () => {
    const p = { total: 50, steps, snapshot: snap(themes) };
    expect(planMove(p)).toBe(30);   // 강남→홍대 15 + 홍대→강남 15
    expect(planWaitText(p)).toBe('대기 20분');
  });
  it('매장 사이 이동 시간을 따로 정했으면 그 값으로', () => {
    const p = { total: 50, steps, snapshot: snap(themes, '15', { [pairKey('강남점', '홍대점')]: 10 }) };
    expect(planMove(p)).toBe(20);
  });
  it('매장이 없으면 이동 0 — 비는 시간이 곧 대기', () => {
    const p = { total: 50, steps, snapshot: snap(themes.map(t => ({ ...t, place: '' }))) };
    expect(planWaitText(p)).toBe('대기 50분');
  });
  it('이름 없는 테마는 "테마 n" 단계와 맞춘다', () => {
    const p = { total: 50, steps: [{ ...steps[0], name: '테마 1' }, steps[1], steps[2]], snapshot: snap([{ ...themes[0], name: '' }, themes[1], themes[2]]) };
    expect(planMove(p)).toBe(30);
  });
  it('모르면 "비는 시간" — snapshot 없음·깨짐·맞는 테마 없음·같은 이름이 매장 둘·이동이 비는 시간보다 김', () => {
    expect(planWaitText({ total: 60, steps, snapshot: '' })).toBe('비는 시간 60분');
    expect(planWaitText({ total: 60, steps, snapshot: '!!깨진값' })).toBe('비는 시간 60분');
    expect(planMove({ total: 50, steps, snapshot: snap(themes.slice(0, 2)) })).toBeNull();
    expect(planMove({ total: 50, steps, snapshot: snap([...themes, T(4, '셜록의 서재', 60, '14:40', '신촌점')]) })).toBeNull();
    expect(planMove({ total: 50, steps, snapshot: snap(themes, '40') })).toBeNull();
  });
});
