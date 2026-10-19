import { describe, expect, it, vi } from 'vitest';
import { nextRetryDelay, PROFILE_RETRY_MS, wasRecorded, mergePast, nextPastCursor, pageRows, tryPlayed, withoutPending } from './useProfile';
import type { EventDto, PlayedDto } from './server';

const ev = (id: number, date: string) => ({ id, date } as EventDto);

describe('지난 일정 커서', () => {
  it('처음은 오늘 이전(before 만)', () => {
    expect(nextPastCursor([], '2026-10-19')).toEqual({ before: '2026-10-19' });
  });
  it('다음 쪽은 받은 쪽 마지막 일정의 (date, id) 그대로 — 같은 날 일정이 쪽 경계에 걸쳐도 서버가 id 로 이어 준다', () => {
    const loaded = [ev(9, '2026-10-11'), ev(7, '2026-10-04'), ev(5, '2026-10-04')];
    expect(nextPastCursor(loaded, '2026-10-19')).toEqual({ before: '2026-10-04', beforeId: 5 });
  });
  it('더 있는지는 total 로, 겹치는 id 는 한 번만', () => {
    const loaded = [ev(9, '2026-10-11'), ev(7, '2026-10-04')];
    expect(mergePast(loaded, [ev(7, '2026-10-04'), ev(5, '2026-10-04')], 4)).toEqual({
      list: [ev(9, '2026-10-11'), ev(7, '2026-10-04'), ev(5, '2026-10-04')], hasMore: true,
    });
    expect(mergePast(loaded, [ev(5, '2026-10-04'), ev(3, '2026-09-28')], 4).hasMore).toBe(false);
  });
  it('빈 쪽이 오면 total 이 남아 있어도 끝(그 사이 일정이 지워졌을 때 끝없이 누르지 않게)', () => {
    expect(mergePast([ev(1, '2026-10-04')], [], 5).hasMore).toBe(false);
  });
});

const row = (id: number): PlayedDto => ({
  id, themeKey: null, themeName: `t${id}`, branchName: null, storeName: null, playedOn: null, source: 'EVENT', eventId: 3,
  createdAt: '2026-10-12T00:00:00Z',
});
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe('미뤄 둔 지우기', () => {
  it('새로 받은 목록에서도 미뤄 둔 id 는 수에서 뺀다', () => {
    const list = [row(1), row(2), row(3)];
    expect(ids(withoutPending(list, new Set([2])))).toEqual([1, 3]);
    expect(withoutPending(list, new Set())).toBe(list);
  });
  it('지운 줄은 쪽 수·줄 수에 안 들고 원래 자리에 남는다', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    const r = pageRows(rows, new Set([3]), 0, 10);
    expect(r.count).toBe(11);
    expect(r.pages).toBe(2);
    expect(ids(r.shown)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // 남은 줄 10 + 지운 줄(3) 자리
    expect(ids(pageRows(rows, new Set([3]), 1, 10).shown)).toEqual([12]);
  });
  it('쪽 경계에 있는 지운 줄은 양쪽에서 보인다(누른 쪽에서 사라지지 않게)', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    expect(ids(pageRows(rows, new Set([11]), 0, 10).shown)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(ids(pageRows(rows, new Set([11]), 1, 10).shown)).toEqual([11, 12]);
  });
  it('마지막 쪽을 다 지우면 쪽 번호를 앞으로 맞추고, 남은 게 없어도 지운 줄은 보인다', () => {
    const rows = [row(1), row(2)];
    const r = pageRows(rows, new Set([1, 2]), 3, 10);
    expect(r).toMatchObject({ count: 0, pages: 1, cur: 0 });
    expect(ids(r.shown)).toEqual([1, 2]);
  });
});

describe('해 본 테마 첫 요청 — 일시 오류로 굳지 않는다', () => {
  const httpErr = (status: number, body?: unknown) => Object.assign(new Error('x'), { status, body });
  const noWait = () => Promise.resolve();
  it('첫 요청이 500 이어도 두 번째가 되면 ok(→ api on)', async () => {
    const load = vi.fn().mockRejectedValueOnce(httpErr(500, { error: 'INTERNAL' })).mockResolvedValueOnce([row(1)]);
    const r = await tryPlayed(load, noWait);
    expect(r).toEqual({ kind: 'ok', list: [row(1)] });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('404(본문 없음)는 바로 missing — 다시 하지 않는다', async () => {
    const load = vi.fn().mockRejectedValue(httpErr(404));
    expect(await tryPlayed(load, noWait)).toEqual({ kind: 'missing' });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('두 번 다 실패하면 error 로 돌려준다(missing 으로 굳히지 않는다)', async () => {
    const e = httpErr(503);
    const r = await tryPlayed(vi.fn().mockRejectedValue(e), noWait);
    expect(r).toEqual({ kind: 'error', error: e });
  });
});

describe('첫 요청 스스로 다시 해 보기', () => {
  it('30초·2분·2분, 세 번까지만', () => {
    expect(PROFILE_RETRY_MS).toEqual([30_000, 120_000, 120_000]);
    expect([0, 1, 2, 3].map(nextRetryDelay)).toEqual([30_000, 120_000, 120_000, null]);
  });
});

describe('기록 더한 뒤 이미 있었나(wasRecorded)', () => {
  it('보내기 전 목록에 그 id 가 있으면 이미 있던 것', () => {
    expect(wasRecorded([row(1), row(2)], 2, false)).toBe(true);
    expect(wasRecorded([row(1)], 2, false)).toBe(false);
  });
  it('되돌리기로 살린 줄이거나 목록을 못 받았으면 새 기록', () => {
    expect(wasRecorded([row(2)], 2, true)).toBe(false);
    expect(wasRecorded(null, 2, false)).toBe(false);
  });
});
