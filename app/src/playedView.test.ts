import { describe, expect, it } from 'vitest';
import { PLAYED_MIN, checkPlayedOn, fullDay, groupByYear, matchPlayed, playedByDate, playedSummary, sortPlayed } from './playedView';
import type { PlayedDto } from './server';

let seq = 0;
const P = (themeName: string, playedOn: string | null, source: PlayedDto['source'] = 'MANUAL', extra: Partial<PlayedDto> = {}): PlayedDto => ({
  id: ++seq, themeKey: null, themeName, branchName: null, storeName: null, playedOn, source, eventId: null,
  createdAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}Z`, ...extra,
});

describe('playedByDate — 캘린더 층', () => {
  it('직접 적은 것(MANUAL)이고 날짜가 있는 것만 날짜별로 묶는다', () => {
    const a = P('셜록', '2026-10-03');
    const b = P('고백', '2026-10-03');
    const c = P('폐교', '2026-10-05');
    const list = [a, P('심야 병동', '2026-10-03', 'EVENT'), P('데드맨', '2026-10-03', 'PLAN'), b, P('날짜 없음', null), c];
    const m = playedByDate(list);
    expect([...m.keys()]).toEqual(['2026-10-03', '2026-10-05']);
    expect(m.get('2026-10-03')).toEqual([a, b]);
    expect(m.get('2026-10-05')).toEqual([c]);
  });

  it('없으면 빈 Map', () => {
    expect(playedByDate([P('x', null), P('y', '2026-01-01', 'EVENT')]).size).toBe(0);
  });

  it('400개도 한 번에 묶는다', () => {
    const list = Array.from({ length: 400 }, (_, i) => P(`t${i}`, `2025-${String((i % 12) + 1).padStart(2, '0')}-01`));
    const m = playedByDate(list);
    expect(m.size).toBe(12);
    expect([...m.values()].reduce((n, d) => n + d.length, 0)).toBe(400);
  });
});

describe('sortPlayed — 최근 순 · 이름 순', () => {
  it('최근 순: 날짜 내림, 같은 날은 늦게 넣은 것 먼저, 날짜 없는 것은 맨 뒤(늦게 넣은 것 먼저)', () => {
    const old = P('a', '2023-05-01', 'MANUAL', { createdAt: '2026-01-01T00:00:00Z' });
    const n1 = P('b', null, 'MANUAL', { createdAt: '2026-02-01T00:00:00Z' });
    const sameEarly = P('c', '2024-03-15', 'EVENT', { createdAt: '2026-01-01T00:00:00Z' });
    const sameLate = P('d', '2024-03-15', 'MANUAL', { createdAt: '2026-03-01T00:00:00Z' });
    const n2 = P('e', null, 'MANUAL', { createdAt: '2026-05-01T00:00:00Z' });
    const recent = P('f', '2026-10-01');
    const out = sortPlayed([old, n1, sameEarly, sameLate, n2, recent], 'recent');
    expect(out.map((p) => p.themeName)).toEqual(['f', 'd', 'c', 'a', 'e', 'b']);
  });

  it('이름 순: 가나다, 같은 이름은 매장으로', () => {
    const list = [P('하늘', null), P('가면', '2020-01-01'), P('셜록', null, 'MANUAL', { storeName: '제로월드', branchName: '홍대점' }),
      P('셜록', null, 'MANUAL', { storeName: '제로월드', branchName: '강남점' }), P('나비', '2025-01-01')];
    const out = sortPlayed(list, 'name');
    expect(out.map((p) => `${p.themeName}${p.branchName ?? ''}`)).toEqual(['가면', '나비', '셜록강남점', '셜록홍대점', '하늘']);
  });

  it('원래 배열은 그대로', () => {
    const list = [P('b', null), P('a', null)];
    const copy = [...list];
    sortPlayed(list, 'name');
    expect(list).toEqual(copy);
  });
});

describe('groupByYear — 연도별 묶음 머리', () => {
  it('연도마다 묶고 날짜 없는 것은 "날짜 모름", 수는 전체 기준', () => {
    const all = sortPlayed([P('a', '2024-03-01'), P('b', '2024-01-01'), P('c', '2023-12-31'), P('d', null), P('e', null)], 'recent');
    const g = groupByYear(all.slice(0, 3), all);   // 앞의 3개만 보일 때
    expect(g.map((x) => [x.label, x.count, x.rows.length])).toEqual([['2024년', 2, 2], ['2023년', 1, 1]]);
    const full = groupByYear(all, all);
    expect(full.map((x) => [x.key, x.label, x.count])).toEqual([['2024', '2024년', 2], ['2023', '2023년', 1], ['none', '날짜 모름', 2]]);
  });

  it('수에서 뺀 줄(지우려고 미뤄 둔 줄)도 보이는 묶음 안에 남는다', () => {
    const a = P('a', '2024-03-01'), gone = P('gone', '2024-02-01');
    const g = groupByYear([a, gone], [a]);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(1);
    expect(g[0].rows).toEqual([a, gone]);
  });
});

describe('playedSummary — 모두 n개 · 올해 n개', () => {
  it('올해는 한국 날짜 오늘의 연도로 센다(날짜 없는 것은 올해에 안 든다)', () => {
    const list = [P('a', '2026-01-01'), P('b', '2026-10-20'), P('c', '2025-12-31'), P('d', null)];
    expect(playedSummary(list, '2026-10-20')).toEqual({ total: 4, thisYear: 2 });
    expect(playedSummary(list, '2027-01-01')).toEqual({ total: 4, thisYear: 0 });
  });
});

describe('checkPlayedOn — 날짜 칸', () => {
  it('비면 날짜 없이, 오늘까지는 그대로, 오늘 뒤는 막는다', () => {
    expect(checkPlayedOn('', '2026-10-20')).toEqual({ ok: true, playedOn: null });
    expect(checkPlayedOn('2026-10-20', '2026-10-20')).toEqual({ ok: true, playedOn: '2026-10-20' });
    expect(checkPlayedOn('2019-02-03', '2026-10-20')).toEqual({ ok: true, playedOn: '2019-02-03' });
    expect(checkPlayedOn('2026-10-21', '2026-10-20')).toEqual({ ok: false, why: 'future' });
    expect(checkPlayedOn('2026-1-2', '2026-10-20')).toEqual({ ok: false, why: 'bad' });
  });
  it('1990년 전은 막는다(한꺼번에 넣기 parseDate 하한과 같게) — 직접 친 0024년 같은 것', () => {
    expect(checkPlayedOn('0024-03-15', '2026-10-20')).toEqual({ ok: false, why: 'bad' });
    expect(checkPlayedOn('1989-12-31', '2026-10-20')).toEqual({ ok: false, why: 'bad' });
    expect(checkPlayedOn('1990-01-01', '2026-10-20')).toEqual({ ok: true, playedOn: '1990-01-01' });
    expect(PLAYED_MIN).toBe('1990-01-01');
  });
});

it('fullDay — 이름 순 줄의 날짜', () => {
  expect(fullDay('2024-03-05')).toBe('2024.3.5');
});

describe('matchPlayed — 찾기 칸으로 목록 거르기', () => {
  const p = P('셜록 홈즈', null, 'MANUAL', { storeName: '제로월드', branchName: '강남점' });
  it('테마·매장·지점 부분 일치, 공백·대소문자·전각 무시', () => {
    expect(matchPlayed(p, '셜록홈')).toBe(true);
    expect(matchPlayed(p, ' 제로 월드 ')).toBe(true);
    expect(matchPlayed(p, '강남')).toBe(true);
    expect(matchPlayed(P('ＡＢＣ room', null), 'abcRoom')).toBe(true);
    expect(matchPlayed(p, '홍대')).toBe(false);
  });
  it('빈 글자면 다 맞다, 매장이 없어도 된다', () => {
    expect(matchPlayed(p, '')).toBe(true);
    expect(matchPlayed(P('고백', null), '  ')).toBe(true);
    expect(matchPlayed(P('고백', null), 'null')).toBe(false);
  });
});
