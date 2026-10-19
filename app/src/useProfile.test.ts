import { describe, expect, it } from 'vitest';
import { mergePast, nextPastQuery, onDeleteToastClose, PAST_PAGE, withoutPending } from './useProfile';
import type { EventDto, PlayedDto } from './server';

const ev = (id: number, date: string) => ({ id, date } as EventDto);

describe('nextPastQuery', () => {
  it('처음은 오늘 이전, 한 쪽 + 1개', () => {
    expect(nextPastQuery([], '2026-10-19')).toEqual({ before: '2026-10-19', limit: PAST_PAGE + 1 });
  });
  it('다음 쪽은 마지막 날짜의 다음 날부터, 그날 이미 받은 수만큼 더', () => {
    const loaded = [ev(1, '2026-10-11'), ev(2, '2026-10-04'), ev(3, '2026-10-04')];
    expect(nextPastQuery(loaded, '2026-10-19')).toEqual({ before: '2026-10-05', limit: 2 + PAST_PAGE + 1 });
  });
  it('서버 상한 50을 넘지 않는다', () => {
    const loaded = Array.from({ length: 45 }, (_, i) => ev(i, '2026-10-04'));
    expect(nextPastQuery(loaded, '2026-10-19').limit).toBe(50);
  });
});

describe('mergePast', () => {
  it('쪽 경계에 걸친 같은 날 일정을 빠뜨리지 않고, 이미 받은 것은 거른다', () => {
    const loaded = [ev(1, '2026-10-11'), ev(2, '2026-10-04')];
    // before=10-05 로 다시 받은 응답 — 10/4 의 2번(이미 있음)과 4번(경계 너머), 그 앞 날짜들
    const fresh = [ev(2, '2026-10-04'), ev(4, '2026-10-04'), ev(5, '2026-09-28')];
    const m = mergePast(loaded, fresh, 12);
    expect(m.list.map((e) => e.id)).toEqual([1, 2, 4, 5]);
    expect(m.hasMore).toBe(false);
  });
  it('새것이 한 쪽보다 많으면 한 쪽만 붙이고 더 있음', () => {
    const fresh = Array.from({ length: PAST_PAGE + 1 }, (_, i) => ev(i + 1, `2026-09-${String(20 - i).padStart(2, '0')}`));
    const m = mergePast([], fresh, PAST_PAGE + 1);
    expect(m.list).toHaveLength(PAST_PAGE);
    expect(m.hasMore).toBe(true);
  });
  it('응답이 꽉 찼는데 새것이 없으면 끝(한 날짜에 50개 넘게)', () => {
    const loaded = [ev(1, '2026-10-04')];
    expect(mergePast(loaded, [ev(1, '2026-10-04')], 1).hasMore).toBe(false);
  });
  it('응답이 한도보다 적으면 끝', () => {
    expect(mergePast([], [ev(1, '2026-10-04')], PAST_PAGE + 1)).toEqual({ list: [ev(1, '2026-10-04')], hasMore: false });
  });
});

describe('미뤄 둔 지우기', () => {
  const row = (id: number): PlayedDto => ({
    id, themeKey: null, themeName: `t${id}`, branchName: null, playedOn: null, source: 'EVENT', eventId: 3, createdAt: '2026-10-12T00:00:00Z',
  });
  it('되돌리기(action)만 요청 없이 되살리고, 나머지 닫힘은 모두 그때 DELETE', () => {
    expect(onDeleteToastClose('action')).toBe('restore');
    expect(onDeleteToastClose('expired')).toBe('send');
    expect(onDeleteToastClose('evicted')).toBe('send');
    expect(onDeleteToastClose('dismissed')).toBe('send');
  });
  it('새로 받은 목록에서도 지우려고 미뤄 둔 id 는 뺀다', () => {
    const list = [row(1), row(2), row(3)];
    expect(withoutPending(list, new Set([2])).map((p) => p.id)).toEqual([1, 3]);
    expect(withoutPending(list, new Set())).toBe(list);
  });
});
