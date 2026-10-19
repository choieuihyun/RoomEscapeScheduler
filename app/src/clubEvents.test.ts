import { describe, it, expect } from 'vitest';
import type { EventDto } from './server';
import {
  eventStatus, eventTitle, timeLabel, parseKakaoTitle, kakaoPost,
  sortEvents, nextMine, upcoming, addDays, cpLen, STATUS_LABEL,
  mergeRange, upsert, dropEvent, afterActionError,
} from './clubEvents';

const seg = (themeName: string, startMin: number, endMin: number | null = null) =>
  ({ themeName, branchName: null, themeKey: null, startMin, endMin });

const ev = (o: Partial<EventDto> = {}): EventDto => ({
  id: 1, title: '', date: '2026-10-20', startMin: null, endMin: null, location: null,
  capacity: null, booked: false, memo: null, segments: [], version: 0,
  createdBy: { uid: 'u1', nickname: '가' }, createdAt: '', updatedAt: '',
  participants: [], count: 1, joined: false, mine: false, canManage: false, ...o,
});

const two = [seg('비밀의 화원', 820), seg('셜록의 서재', 920)];

describe('clubEvents', () => {
  it('구간 없으면 협의 중, 있으면 booked 로', () => {
    expect(eventStatus({ segments: [], booked: true })).toBe('talk');
    expect(eventStatus({ segments: [seg('A', 600)], booked: false })).toBe('before');
    expect(eventStatus({ segments: [seg('A', 600)], booked: true })).toBe('done');
    expect(STATUS_LABEL.done).toBe('예약 완료');
  });

  it('제목이 비면 구간으로 만든다', () => {
    expect(eventTitle({ title: '', segments: two })).toBe('비밀의 화원 13:40 → 셜록의 서재 15:20');
    expect(eventTitle({ title: '번개', segments: two })).toBe('번개');
  });

  it('시각 표시', () => {
    expect(timeLabel(ev())).toBe('');
    expect(timeLabel(ev({ startMin: 820, endMin: 990 }))).toBe('13:40–16:30');
    expect(timeLabel(ev({ segments: [seg('A', 820, 900), seg('B', 920, 990)] }))).toBe('13:40–16:30');
    expect(timeLabel(ev({ segments: two }))).toBe('13:40');
  });

  it('카톡 제목 기본형', () => {
    expect(parseKakaoTitle('[예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20')).toEqual({
      booked: true,
      segments: [{ themeName: '비밀의 화원', startMin: 820 }, { themeName: '셜록의 서재', startMin: 920 }],
    });
  });

  it('카톡 제목 변형', () => {
    const r = parseKakaoTitle('[ 예약 x ]심해 탐사 11:00+미드나잇 13시30분');
    expect(r.booked).toBe(false);
    expect(r.segments.map((s) => s.startMin)).toEqual([660, 810]);
    expect(parseKakaoTitle('[예약0] ABC 13:40').booked).toBe(true);
    expect(parseKakaoTitle('  ABC 13시  ').segments).toEqual([{ themeName: 'ABC', startMin: 780 }]);
  });

  it('시각 없는 조각이 섞이면 구간을 안 채운다', () => {
    expect(parseKakaoTitle('[예약X] ABC 13:40 + DEF')).toEqual({ booked: false, segments: [] });
    expect(parseKakaoTitle('테마, 일정 협의')).toEqual({ booked: null, segments: [] });
    expect(parseKakaoTitle('13:40').segments).toEqual([]);
  });

  it('자정 넘김', () => {
    expect(parseKakaoTitle('ABC 24:30').segments[0].startMin).toBe(1470);
    const e = ev({ booked: true, segments: [seg('ABC', 1470)], count: 2 });
    expect(kakaoPost(e, 'https://x/#e=1')).toContain('ABC 00:30');
    const late = ev({ id: 1, startMin: 1470 });
    const early = ev({ id: 2, startMin: 1200 });
    const allDay = ev({ id: 3, startMin: null });
    expect(sortEvents([late, early, allDay]).map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it('카톡 글', () => {
    const e = ev({ id: 12, booked: true, count: 3, capacity: 4, segments: two });
    expect(kakaoPost(e, 'https://x/#e=12')).toBe(
      '[예약O] 비밀의 화원 13:40 + 셜록의 서재 15:20 · 3/4명\nhttps://x/#e=12');
    const talk = ev({ title: '테마, 일정 협의', count: 2, capacity: null });
    expect(kakaoPost(talk, 'L')).toBe('테마, 일정 협의 · 2명\nL');
  });

  it('내 다음 일정', () => {
    const evs = [
      ev({ id: 1, date: '2026-10-18', joined: true }),
      ev({ id: 2, date: '2026-10-19' }),
      ev({ id: 4, date: '2026-10-22', joined: true }),
      ev({ id: 3, date: '2026-10-20', joined: true }),
    ];
    expect(nextMine(evs, '2026-10-19')?.id).toBe(3);
    expect(nextMine([evs[0]], '2026-10-19')).toBeNull();
  });

  it('2주 목록', () => {
    const evs = [ev({ id: 1, date: '2026-11-01' }), ev({ id: 2, date: '2026-11-02' }), ev({ id: 3, date: '2026-10-18' })];
    expect(upcoming(evs, '2026-10-19', 14).map((x) => x.id)).toEqual([1]);
  });

  it('addDays 와 cpLen', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(cpLen('😀가')).toBe(2);
  });
});

describe('clubEvents 목록 병합', () => {
  const a = ev({ id: 1, date: '2026-10-01' });
  const b = ev({ id: 2, date: '2026-10-20' });
  const c = ev({ id: 3, date: '2026-11-05' });

  it('범위 병합은 그 범위만 바꾼다', () => {
    const d = ev({ id: 4, date: '2026-10-22' });
    const r = mergeRange([a, b, c], '2026-10-15', '2026-10-31', [d]);
    expect(r.map((e) => e.id)).toEqual([1, 4, 3]);
  });

  it('지워진 일정은 범위 병합에서 사라진다', () => {
    expect(mergeRange([a, b, c], '2026-10-15', '2026-10-31', []).map((e) => e.id)).toEqual([1, 3]);
  });

  it('범위 밖에 있던 일정이 범위 안으로 옮겨 오면 한 개만 남는다', () => {
    const moved = { ...c, date: '2026-10-22' };
    const r = mergeRange([a, b, c], '2026-10-15', '2026-10-31', [b, moved]);
    expect(r.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(r[2].date).toBe('2026-10-22');
  });

  it('upsert 는 같은 id 를 바꾸고 정렬을 지킨다', () => {
    const r = upsert([a, b, c], { ...b, date: '2026-09-01', title: '바뀜' });
    expect(r.map((e) => e.id)).toEqual([2, 1, 3]);
    expect(r[0].title).toBe('바뀜');
    expect(upsert([a], b).map((e) => e.id)).toEqual([1, 2]);
  });

  it('dropEvent 는 그 id 만 뺀다', () => {
    expect(dropEvent([a, b, c], 2).map((e) => e.id)).toEqual([1, 3]);
  });

  it('정원 초과 뒤에는 그 일정을 다시 불러온다', () => {
    const err = (status: number, code: string) => ({ status, body: { error: code } });
    expect(afterActionError(err(409, 'EVENT_FULL'))).toBe('refresh');
    expect(afterActionError(err(404, 'NO_SUCH_EVENT'))).toBe('drop');
    expect(afterActionError(err(409, 'EVENT_CONFLICT'))).toBe('none');
    expect(afterActionError(new Error('x'))).toBe('none');
  });
});
