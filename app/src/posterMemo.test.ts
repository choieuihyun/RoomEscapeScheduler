import { describe, expect, it } from 'vitest';
import { addPosters, parseMemo, POSTER_MAX } from './posterMemo';

describe('posterMemo — 테마 키 → 사진 주소 지도', () => {
  it('더하면 맨 뒤(최근), 같은 키는 옮기고 새 주소, 키·주소 없는 항목은 건너뛴다', () => {
    let m = addPosters([], [{ themeKey: 'a', posterUrl: 'A1' }, { themeKey: 'b', posterUrl: 'B' }, { themeKey: 'c' }, { posterUrl: 'X' }]);
    expect(m).toEqual([['a', 'A1'], ['b', 'B']]);
    m = addPosters(m, [{ themeKey: 'a', posterUrl: 'A2' }]);
    expect(m).toEqual([['b', 'B'], ['a', 'A2']]);
  });
  it(`최근 ${POSTER_MAX}개까지 — 넘치면 오래된 것부터 버린다`, () => {
    const items = Array.from({ length: POSTER_MAX + 5 }, (_, i) => ({ themeKey: `k${i}`, posterUrl: `u${i}` }));
    const m = addPosters([], items);
    expect(m).toHaveLength(POSTER_MAX);
    expect(m[0]).toEqual(['k5', 'u5']);
    expect(m.at(-1)).toEqual([`k${POSTER_MAX + 4}`, `u${POSTER_MAX + 4}`]);
  });
  it('깨진 저장값은 빈 지도, 모양이 틀린 칸은 버린다', () => {
    expect(parseMemo(null)).toEqual([]);
    expect(parseMemo('{깨짐')).toEqual([]);
    expect(parseMemo('{"a":1}')).toEqual([]);
    expect(parseMemo('[["a","A"],["b",2],"x"]')).toEqual([['a', 'A']]);
  });
});
