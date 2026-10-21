import { describe, expect, it } from 'vitest';
import type { PathStep } from './core';
import { countOtherCtx, countSame, ctxAlive, dropOtherCtx, insertMode, mergeServerThemes, stepCards } from './eventFlow';
import { addGone } from './clubEvents';
import { blankTheme, type Theme } from './scheduler/types';
import type { AddedTheme } from './scheduler/types';

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

  it('테마 사진 주소를 카드에 싣고, 같은 테마를 다시 넣으면 새 주소로(손으로 넣은 카드는 없음)', () => {
    const first = run([manual(1)], [added('zero-gn:1', 600, { posterUrl: 'https://img.example/a.jpg' })]);
    expect(first.map((t) => t.posterUrl)).toEqual([undefined, 'https://img.example/a.jpg']);
    const again = run(first, [added('zero-gn:1', 660, { posterUrl: 'https://img.example/b.jpg' })], 200);
    expect(again.map((t) => t.posterUrl)).toEqual([undefined, 'https://img.example/b.jpg']);
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

describe('일정 문맥이 바뀌면 앞 일정 테마 카드 정리 (§5)', () => {
  it('문맥에서 넣은 카드엔 그 일정 id 를 단다 — 문맥 없이 넣으면 달지 않는다', () => {
    let n = 1;
    const a = mergeServerThemes([manual(9)], [added('zero-gn:1', 600)], () => n++, 30);
    expect(a.map((t) => t.ctx)).toEqual([undefined, 30]);
    expect(mergeServerThemes([], [added('zero-gn:1', 600)], () => n++)[0].ctx).toBeUndefined();
  });

  it('다른 일정 문맥으로 오면 앞 문맥 카드만 뺀다 — 손으로·문맥 없이 넣은 카드, 같은 문맥 카드는 그대로', () => {
    let n = 1;
    const ts = [
      manual(9),
      ...mergeServerThemes([], [added('zero-gn:1', 600), added('key-hd:1', 1200)], () => n++, 30),
      ...mergeServerThemes([], [added('zero-gn:2', 700)], () => 50),
    ];
    expect(countOtherCtx(ts, 31)).toBe(2);
    expect(dropOtherCtx(ts, 31).map((t) => t.id)).toEqual([9, 50]);
    expect(countOtherCtx(ts, 30)).toBe(0);
    expect(dropOtherCtx(ts, 30)).toEqual(ts);
  });

  it('같은 키 카드를 바꾸면 문맥 표시도 새 값으로 — 문맥 없이 다시 넣으면 지우고, 다른 문맥이면 그 문맥으로', () => {
    let n = 1;
    const id = () => n++;
    const plain = mergeServerThemes([manual(9)], [added('zero-gn:1', 600)], id);       // 회차 불러오기(문맥 없음)
    const tagged = mergeServerThemes(plain, [added('zero-gn:1', 600)], id, 7);          // 일정 7 도우미가 같은 키
    expect(tagged.map((t) => t.ctx)).toEqual([undefined, 7]);
    const reloaded = mergeServerThemes(tagged, [added('zero-gn:1', 660)], id);         // 문맥 카드를 문맥 없이 다시
    expect(reloaded.map((t) => t.ctx)).toEqual([undefined, undefined]);
    expect(dropOtherCtx(reloaded, 8)).toHaveLength(2);                                   // 다른 일정 문맥으로 와도 남는다
    expect(mergeServerThemes(tagged, [added('zero-gn:1', 600)], id, 8)[1].ctx).toBe(8);
    expect(reloaded.map((t) => t.id)).toEqual(tagged.map((t) => t.id));                 // 자리·id 는 그대로
  });
});

describe('일정에 넣기 — 문맥을 세운 뒤 계산한 결과에만 (§6)', () => {
  const old: unknown[] = [];
  const ctx = { id: 30, title: '토요 번개', date: null, seen: old };
  it('문맥이 없으면 none, 문맥을 세울 때의 옛 결과면 stale(넣기 단추 없음)', () => {
    expect(insertMode(null, old, true)).toBe('none');
    expect(insertMode(ctx, old, true)).toBe('stale');
    expect(insertMode(ctx, old, false)).toBe('stale');
  });
  it('문맥을 세운 뒤 다시 계산한 결과엔 넣기, 못 고치는 일정이면 blocked', () => {
    const fresh: unknown[] = [];
    expect(insertMode(ctx, fresh, true)).toBe('insert');
    expect(insertMode(ctx, fresh, undefined)).toBe('insert');
    expect(insertMode(ctx, fresh, false)).toBe('blocked');
  });
  it('그 일정을 지우면(gone) 문맥을 놓는다 — 로그아웃·API 꺼짐도', () => {
    expect(ctxAlive(ctx, true, [])).toBe(true);
    expect(ctxAlive(ctx, true, addGone([], 30))).toBe(false);
    expect(ctxAlive(ctx, true, addGone([], 31))).toBe(true);
    expect(ctxAlive(ctx, false, [])).toBe(false);
    expect(ctxAlive(null, true, [])).toBe(false);
  });
  it('지운 일정 id 는 겹치지 않게 최근 20개까지', () => {
    let g: number[] = [];
    for (let i = 0; i < 25; i++) g = addGone(g, i);
    expect(addGone(g, 24)).toBe(g);
    expect([g.length, g[0], g[19]]).toEqual([20, 5, 24]);
  });
});
