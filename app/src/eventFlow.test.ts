import { describe, expect, it } from 'vitest';
import type { PathStep } from './core';
import { countSame, mergeServerThemes, stepCards } from './eventFlow';
import { blankTheme, type Theme } from './scheduler/types';
import type { AddedTheme } from './useLoadModal';

const D = '2026-10-25';
const added = (themeKey: string | undefined, t: number, o: Partial<AddedTheme> = {}): AddedTheme => ({
  name: themeKey ?? '손', place: '제로월드 강남점', dur: 70, sessions: [{ t, soldout: false, id: t }], fresh: '방금', date: D, themeKey, ...o,
});
const manual = (id: number): Theme => ({ ...blankTheme(id, '손으로'), raw: '10:00', sessions: [{ t: 600, soldout: false }], source: 'manual' });

function run(ts: Theme[], items: AddedTheme[], start = 100) {
  let n = start;
  return mergeServerThemes(ts, items, () => n++);
}

describe('mergeServerThemes — 같은 테마는 카드를 바꾸고 새로 더하지 않는다', () => {
  it('처음 넣으면 더한다(서버 키·날짜·회차 글자)', () => {
    const out = run([], [added('zero-gn:1', 600), added('key-hd:1', 1200)]);
    expect(out.map((t) => [t.id, t.themeKey, t.date, t.raw, t.source])).toEqual([
      [100, 'zero-gn:1', D, '10:00', 'server'],
      [101, 'key-hd:1', D, '20:00', 'server'],
    ]);
  });

  it('같은 날짜·같은 키는 그 자리에서 바꾼다 — id·순서·이어 붙이기 설정은 그대로, 회차는 새 값', () => {
    const first = run([manual(1)], [added('zero-gn:1', 600), added('key-hd:1', 1200)]);
    first[1] = { ...first[1], mergeMode: false, err: '옛 오류' };
    const again = run(first, [added('zero-gn:1', 660), added('key-hd:1', 1260)], 200);
    expect(again).toHaveLength(3);
    expect(again.map((t) => t.id)).toEqual([1, 100, 101]);
    expect(again[1].sessions.map((s) => s.t)).toEqual([660]);
    expect([again[1].raw, again[1].mergeMode, again[1].err]).toEqual(['11:00', false, '']);
    expect(again[2].sessions.map((s) => s.t)).toEqual([1260]);
  });

  it('여러 번 보내도 카드 수가 2 → 2 → 2 (2·4·6 으로 늘지 않는다)', () => {
    let ts: Theme[] = [];
    const pick = [added('zero-gn:1', 600), added('zero-gn:2', 720)];
    for (let i = 0; i < 3; i++) ts = run(ts, pick, 100 + i * 10);
    expect(ts).toHaveLength(2);
  });

  it('키가 다르거나 날짜가 다르면 더한다', () => {
    const ts = run([], [added('zero-gn:1', 600)]);
    expect(run(ts, [added('zero-gn:2', 600)])).toHaveLength(2);
    expect(run(ts, [added('zero-gn:1', 600, { date: '2026-10-26' })])).toHaveLength(2);
  });

  it('손으로 넣은 카드(키 없음)는 건드리지 않고, 키 없는 항목은 늘 더한다', () => {
    const ts = [manual(1)];
    const out = run(ts, [added(undefined, 600, { name: '손으로' })]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(ts[0]);
  });

  it('한 번에 같은 키가 둘 와도 하나만 남는다(뒤 값)', () => {
    const out = run([], [added('zero-gn:1', 600), added('zero-gn:1', 660)]);
    expect(out).toHaveLength(1);
    expect(out[0].sessions[0].t).toBe(660);
  });

  it('countSame — 바뀔(이미 있는) 항목 수', () => {
    const ts = run([manual(1)], [added('zero-gn:1', 600)]);
    expect(countSame(ts, [added('zero-gn:1', 660), added('zero-gn:2', 600)])).toBe(1);
    expect(countSame(ts, [added(undefined, 600, { name: '손으로' })])).toBe(0);
  });
});

describe('stepCards — 결과 단계의 카드에서 날짜·테마 키', () => {
  it('첫 단계 카드 날짜, 단계마다 키(손으로 넣은 카드는 null)', () => {
    const ts: Theme[] = [{ ...manual(1) }, { ...blankTheme(2, 'A'), date: D, themeKey: 'zero-gn:1' }];
    const ready = [{ id: 2, dur: 70, sessions: [] }, { id: 1, dur: 70, sessions: [] }];
    const steps = [{ i: 0 }, { i: 1 }] as PathStep[];
    expect(stepCards(steps, ready, ts)).toEqual({ date: D, keys: ['zero-gn:1', null] });
    expect(stepCards([{ i: 1 }] as PathStep[], ready, ts)).toEqual({ date: undefined, keys: [null] });
  });
});
