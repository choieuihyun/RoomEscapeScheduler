import { describe, it, expect } from 'vitest';
import type { EventDto } from './server';
import {
  eventStatus, eventTitle, timeLabel, parseKakaoTitle, kakaoPost,
  sortEvents, nextMine, upcoming, addDays, cpLen, STATUS_LABEL,
  mergeRange, upsert, isUndecided, sortKeyDate, candidateSummary, dropEvent, afterActionError,
  parseClock24, rollDays, todayKst, daysBetween, relDay, dayLabel, longDayLabel, clockLabel, rangeLabel,
  parseAvailText, availText, windowLabel, windowToCalc, todayStrip,
} from './clubEvents';

const seg = (themeName: string, startMin: number, endMin: number | null = null) =>
  ({ themeName, branchName: null, themeKey: null, startMin, endMin, playedBy: [] as string[] });

const ev = (o: Partial<EventDto> = {}): EventDto => ({
  id: 1, title: '', date: '2026-10-20', candidates: [], startMin: null, endMin: null, location: null,
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

  it('시각 표시 — 시작만 있는 일정, 다음날', () => {
    expect(timeLabel(ev({ startMin: 1140, endMin: null }))).toBe('19:00');
    expect(timeLabel(ev({ startMin: 1320, endMin: 1500 }))).toBe('22:00–다음날 01:00');
    expect(clockLabel(1470)).toBe('다음날 00:30');
    expect(clockLabel(1439)).toBe('23:59');
    expect(rangeLabel(1480, 1550)).toBe('다음날 00:40–01:50'); // 시작이 다음날이면 끝에는 다시 안 붙인다
    expect(rangeLabel(820, null)).toBe('13:40');
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

  it('자정 넘김 — 24시간제라 24:30 은 못 읽고, 앞 시각보다 이르면 다음날', () => {
    expect(parseKakaoTitle('ABC 24:30').segments).toEqual([]);
    expect(parseKakaoTitle('ABC 23:00 + DEF 00:30').segments.map((x) => x.startMin)).toEqual([1380, 1470]);
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

  it('시간 범위는 시작·끝을 다 채운다 (2026-10-19 다듬기 — 전에는 안 채웠다)', () => {
    for (const sep of ['~', '-', '–', ' ~ ']) {
      expect(parseKakaoTitle(`비밀의 화원 13:40${sep}14:50`).segments).toEqual([
        { themeName: '비밀의 화원', startMin: 820, endMin: 890 },
      ]);
    }
    expect(parseKakaoTitle('A 23:30~00:40').segments).toEqual([{ themeName: 'A', startMin: 1410, endMin: 1480 }]);
    expect(parseKakaoTitle('A 13:40-14:50 + B 15:20').segments).toEqual([
      { themeName: 'A', startMin: 820, endMin: 890 }, { themeName: 'B', startMin: 920 },
    ]);
    expect(parseKakaoTitle('[예약O] A 13:40~14:50 + B 15:20~16:30').segments.map((x) => [x.startMin, x.endMin]))
      .toEqual([[820, 890], [920, 990]]);
  });

  it('시간 범위를 못 읽으면 전체를 안 채운다', () => {
    expect(parseKakaoTitle('A 13:40~25:00').segments).toEqual([]);
    expect(parseKakaoTitle('A 13:40 14:50').segments).toEqual([]);
    expect(parseKakaoTitle('A 13:40~13:40').segments).toEqual([]);
    expect(parseKakaoTitle('A 13:40~14:50 + B').segments).toEqual([]);
    /* 자정을 건너지 않는 역순은 오타로 보고 안 채운다 */
    expect(parseKakaoTitle('A 13:00 + B 12:00').segments).toEqual([]);
    expect(parseKakaoTitle('A 13:40~14:50 + B 13:30').segments).toEqual([]);
    expect(parseKakaoTitle('A 23:30 + B 00:40').segments.map((x) => x.startMin)).toEqual([1410, 1480]);
  });

  it('parseClock24 는 00:00~23:59 만', () => {
    expect(parseClock24('23:59')).toBe(1439);
    expect(parseClock24('24:00')).toBeNull();
    expect(parseClock24(' 9:05 ')).toBe(545);
    expect(parseClock24('25:30')).toBeNull();
    expect(parseClock24('13:60')).toBeNull();
    expect(parseClock24('abc')).toBeNull();
  });

  it('자정 넘김 자동 (rollDays) — 18시 이후 → 6시 전일 때만, 한 번만', () => {
    const r = (...xs: [number, number | null][]) => rollDays(xs.map(([start, end]) => ({ start, end })));
    expect(r([1380, null], [30, null])).toEqual({ rows: [{ start: 1380, end: null }, { start: 1470, end: null }] });
    expect(r([1410, null], [40, null])).toEqual({ rows: [{ start: 1410, end: null }, { start: 1480, end: null }] });
    expect(r([1320, 60])).toEqual({ rows: [{ start: 1320, end: 1500 }] });
    /* 한 번 넘기면 뒤 구간도 다음날 */
    expect(r([1380, 1430], [30, 90], [100, null])).toEqual({ rows: [
      { start: 1380, end: 1430 }, { start: 1470, end: 1530 }, { start: 1540, end: null }] });
    /* 자정을 건너지 않는 역순은 넘기지 않는다(오타) */
    expect(r([820, 890], [810, null])).toEqual({ bad: 'start', index: 1 });   // 13:40–14:50 뒤 13:30
    expect(r([780, null], [720, null])).toEqual({ bad: 'start', index: 1 });  // 13:00 뒤 12:00
    expect(r([1050, null], [330, null])).toEqual({ bad: 'start', index: 1 }); // 17:30 뒤 05:30 — 18시 전
    expect(r([1380, null], [400, null])).toEqual({ bad: 'start', index: 1 }); // 23:00 뒤 06:40 — 6시 이후
    expect(r([840, 780])).toEqual({ bad: 'end', index: 0 });                  // 14:00~13:00
    expect(r([840, 840])).toEqual({ bad: 'end', index: 0 });                  // 같은 시각
    /* 두 번 넘기지 않는다, 첫 시작에서 24시간 넘게 떨어진 시각도 안 받는다 */
    expect(r([1380, null], [60, null], [30, null])).toEqual({ bad: 'start', index: 2 });
    expect(r([1380, null], [30, 20])).toEqual({ bad: 'end', index: 1 });
    expect(r([1380, null], [30, null], [1430, null])).toEqual({ bad: 'start', index: 2 }); // 23:00/00:30/23:50
  });

  it('모르는 맨 앞 대괄호는 걷어 내고 예약 여부는 null', () => {
    const want = { booked: null, segments: [{ themeName: 'ABC', startMin: 820 }] };
    expect(parseKakaoTitle('[예약] ABC 13:40')).toEqual(want);
    expect(parseKakaoTitle('[공지] ABC 13:40')).toEqual(want);
  });

  it('내 다음 일정', () => {
    const evs = [
      ev({ id: 1, date: '2026-10-18', joined: true }),
      ev({ id: 2, date: '2026-10-19' }),
      ev({ id: 4, date: '2026-10-22', joined: true }),
      ev({ id: 3, date: '2026-10-20', joined: true }),
    ];
    const now = new Date('2026-10-19T03:00:00Z'); // 한국 10/19 12:00
    expect(nextMine(evs, now)?.id).toBe(3);
    expect(nextMine([evs[0]], now)).toBeNull();
  });

  it('내 다음 일정은 오늘 이미 끝난 일정을 건너뛴다(한국 시각)', () => {
    const today = ev({ id: 1, date: '2026-10-19', joined: true, segments: [seg('A', 820, 890), seg('B', 920, 990)] });
    const later = ev({ id: 2, date: '2026-10-21', joined: true });
    const at = (kst: string) => new Date(`2026-10-19T${kst}:00+09:00`);
    expect(nextMine([today, later], at('16:00'))?.id).toBe(1);
    expect(nextMine([today, later], at('17:00'))?.id).toBe(2);
    /* 끝을 모르면 시작 + 2시간 */
    const noEnd = ev({ id: 3, date: '2026-10-19', joined: true, startMin: 1140 });
    expect(nextMine([noEnd, later], at('20:59'))?.id).toBe(3);
    expect(nextMine([noEnd, later], at('21:00'))?.id).toBe(2);
    /* 하루 종일은 그날 내내 남는다 */
    const allDay = ev({ id: 4, date: '2026-10-19', joined: true });
    expect(nextMine([allDay, later], at('23:59'))?.id).toBe(4);
    /* 자정을 넘기는 일정은 그날 밤에도 남는다 */
    const late = ev({ id: 5, date: '2026-10-19', joined: true, startMin: 1320, endMin: 1500 });
    expect(nextMine([late, later], at('23:30'))?.id).toBe(5);
  });

  it('오늘은 한국 날짜 — 기기 시간대와 무관', () => {
    expect(todayKst(new Date('2026-10-19T15:30:00Z'))).toBe('2026-10-20');
    expect(todayKst(new Date('2026-10-19T14:59:00Z'))).toBe('2026-10-19');
    expect(todayKst(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });

  it('daysBetween 과 relDay', () => {
    expect(daysBetween('2026-10-19', '2026-10-24')).toBe(5);
    expect(daysBetween('2026-10-24', '2026-10-19')).toBe(-5);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2); // 다른 나라 서머타임 날에도 정수
    const t = '2026-10-19';
    expect([0, 1, 2, 5, -1].map((n) => relDay(addDays(t, n), t))).toEqual(['오늘', '내일', '모레', '5일 뒤', '1일 전']);
  });

  it('날짜 표기', () => {
    expect(dayLabel('2026-10-24')).toBe('10/24 (토)');
    expect(longDayLabel('2026-10-24')).toBe('2026년 10월 24일 (토)');
    expect(dayLabel('2026-11-01')).toBe('11/1 (일)');
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

describe('시간 협의 (§4.8)', () => {
  const cand = (date: string, responses: { uid: string; available: boolean; startMin?: number | null; endMin?: number | null }[] = []) =>
    ({ date, responses: responses.map((r) => ({ startMin: null, endMin: null, ...r })) });
  const people = (...uids: string[]) => uids.map((uid) => ({ uid, nickname: uid, addedBy: null, joinedAt: '' }));
  const undecided = (o: Partial<EventDto> = {}) => ev({ date: null, candidates: [cand('2026-10-30'), cand('2026-11-20')], ...o });

  it('미정 일정은 협의 중', () => {
    expect(isUndecided(undecided())).toBe(true);
    expect(eventStatus(undecided({ segments: two, booked: true }))).toBe('talk');
  });

  it('미정은 내 다음 일정에서 빠진다', () => {
    const now = new Date('2026-10-19T03:00:00Z');
    expect(nextMine([undecided({ joined: true })], now)).toBeNull();
    expect(nextMine([undecided({ joined: true }), ev({ id: 2, date: '2026-12-01', joined: true })], now)?.id).toBe(2);
  });

  it('후보 일부만 범위 안이어도 그 범위에 속한다', () => {
    const u = undecided();
    expect(sortKeyDate(u, '2026-11-01')).toBe('2026-11-20');
    expect(sortKeyDate(u)).toBe('2026-10-30');
    expect(sortKeyDate(u, '2026-12-01')).toBe('2026-10-30');
    expect(mergeRange([u], '2026-11-01', '2026-11-30', []).map((e) => e.id)).toEqual([]);
    expect(mergeRange([u], '2026-11-01', '2026-11-30', [u]).map((e) => e.id)).toEqual([1]);
    expect(mergeRange([u], '2026-12-01', '2026-12-31', []).map((e) => e.id)).toEqual([1]);
    expect(upcoming([u], '2026-11-01', 30).map((e) => e.id)).toEqual([1]);
    expect(upcoming([u], '2026-12-01', 30)).toEqual([]);
  });

  it('교집합', () => {
    const sum = (rs: Parameters<typeof cand>[1], n = ['A', 'B', 'C']) =>
      candidateSummary(ev({ candidates: [cand('2026-10-31', rs)], participants: people(...n) }))[0];
    const all = sum([
      { uid: 'A', available: true },
      { uid: 'B', available: true, startMin: 840, endMin: 1320 },
      { uid: 'C', available: true, startMin: 780, endMin: 1080 },
    ]);
    expect(all).toMatchObject({ yes: 3, total: 3, window: { start: 840, end: 1080 }, all: true });
    const cNo = sum([
      { uid: 'A', available: true },
      { uid: 'B', available: true, startMin: 840, endMin: 1320 },
      { uid: 'C', available: false },
    ]);
    expect(cNo).toMatchObject({ yes: 2, all: false, noUids: ['C'], noneUids: [] });
    expect(sum([])).toMatchObject({ yes: 0, window: null, noneUids: ['A', 'B', 'C'], all: false });
    expect(sum([{ uid: 'A', available: true }, { uid: 'B', available: true, startMin: 1200, endMin: 1500 }], ['A', 'B']).window)
      .toEqual({ start: 1200, end: 1500 });
    expect(sum([{ uid: 'B', available: true, startMin: 600, endMin: 720 }, { uid: 'C', available: true, startMin: 780, endMin: 900 }], ['B', 'C']).window)
      .toBeNull();
  });

  it('미정은 지난 후보가 아니라 from 이상인 후보 자리에 정렬된다', () => {
    const u = ev({ id: 5, date: null, candidates: [cand('2026-10-10'), cand('2026-10-25')] });
    const d = ev({ id: 6, date: '2026-10-20' });
    expect(upcoming([u, d], '2026-10-19', 30).map((e) => e.id)).toEqual([6, 5]);
    expect(mergeRange([], '2026-10-19', '2026-10-31', [u, d]).map((e) => e.id)).toEqual([6, 5]);
  });

  it('정했다가 다시 미정으로 돌려도 범위가 맞다', () => {
    const decided = ev({ id: 7, date: '2026-11-05' });
    expect(mergeRange([decided], '2026-11-01', '2026-11-30', [])).toEqual([]);
    const far = ev({ id: 8, date: null, candidates: [cand('2026-12-10')] });
    expect(mergeRange([far], '2026-11-01', '2026-11-30', []).map((e) => e.id)).toEqual([8]);
  });

  it('참여자가 아닌 사람의 응답은 세지 않는다', () => {
    const [row] = candidateSummary(ev({
      participants: people('A'),
      candidates: [cand('2026-10-31', [{ uid: 'A', available: true, startMin: 600, endMin: 900 }, { uid: 'Z', available: true, startMin: 700, endMin: 800 }])],
    }));
    expect(row).toMatchObject({ yes: 1, total: 1, window: { start: 600, end: 900 } });
  });

  it('NOT_A_CANDIDATE 는 다시 불러온다', () => {
    expect(afterActionError({ body: { error: 'NOT_A_CANDIDATE' } })).toBe('refresh');
  });

  it('정렬: 모두 되는 날짜가 맨 위', () => {
    const rows = candidateSummary(ev({
      participants: people('A', 'B'),
      candidates: [
        cand('2026-10-30', [{ uid: 'A', available: true }]),
        cand('2026-11-01', [{ uid: 'A', available: true }, { uid: 'B', available: true }]),
        cand('2026-10-31', [{ uid: 'A', available: true }]),
        cand('2026-10-29'),
      ],
    }));
    expect(rows.map((r) => r.date)).toEqual(['2026-11-01', '2026-10-30', '2026-10-31', '2026-10-29']);
  });

  it('내 응답 시간 칸 읽기 — 빈칸은 종일, 자정 넘김은 18시 이후 시작만', () => {
    expect(parseAvailText('')).toEqual({ startMin: null, endMin: null });
    expect(parseAvailText(' 종일 ')).toEqual({ startMin: null, endMin: null });
    expect(parseAvailText('14:00~22:00')).toEqual({ startMin: 840, endMin: 1320 });
    expect(parseAvailText('9:30 - 12:00')).toEqual({ startMin: 570, endMin: 720 });
    expect(parseAvailText('14:00–22:00')).toEqual({ startMin: 840, endMin: 1320 });
    expect(parseAvailText('22:00~02:00')).toEqual({ startMin: 1320, endMin: 1560 });
    expect(parseAvailText('15:00~03:00')).toHaveProperty('error');
    expect(parseAvailText('22:00~14:00')).toHaveProperty('error');
    expect(parseAvailText('14:00~14:00')).toHaveProperty('error');
    expect(parseAvailText('14:00')).toHaveProperty('error');
    expect(parseAvailText('2시~5시')).toHaveProperty('error');
    expect(parseAvailText('24:00~25:00')).toHaveProperty('error');
  });

  it('내 응답 시간 칸 글은 다시 읽으면 같은 값', () => {
    expect(availText({ startMin: null, endMin: null })).toBe('');
    expect(availText({ startMin: 1320, endMin: 1560 })).toBe('22:00~02:00');
    expect(parseAvailText(availText({ startMin: 1320, endMin: 1560 }))).toEqual({ startMin: 1320, endMin: 1560 });
  });

  it('다 같이 되는 시간 표시와 조합 계산 조건', () => {
    expect(windowLabel({ start: 0, end: 2879 })).toBe('종일');
    expect(windowLabel({ start: 840, end: 1320 })).toBe('14:00–22:00');
    expect(windowLabel({ start: 1320, end: 1560 })).toBe('22:00–다음날 02:00');
    expect(windowToCalc({ start: 840, end: 1320 })).toEqual({ oStart: '14:00', oEnd: '22:00' });
    expect(windowToCalc({ start: 1320, end: 1560 })).toEqual({ oStart: '22:00', oEnd: '26:00' });
    expect(windowToCalc({ start: 0, end: 2879 })).toEqual({ oStart: '', oEnd: '' });
    expect(windowToCalc({ start: 840, end: 2000 })).toEqual({ oStart: '14:00', oEnd: '' });
  });
});

describe('홈 오늘·내일 띠 (§4.10)', () => {
  const T = '2026-10-19';
  it('참여한 오늘 일정 — 첫 구간 시각 + 테마들', () => {
    const s = todayStrip([ev({ id: 1, date: T, joined: true, title: '정모', startMin: 1110, segments: [seg('비밀의 화원', 1140), seg('셜록의 서재', 1230)] })], T);
    expect(s && `${s.when} ${s.name}`).toBe('오늘 19:00 비밀의 화원 → 셜록의 서재');
    expect(s?.more).toBe(0);
    expect(s?.event.id).toBe(1);
  });

  it('구간이 없으면 일정 시각 + 제목, 시각도 없으면 하루 종일, 제목도 없으면 동호회 일정', () => {
    const a = todayStrip([ev({ date: T, joined: true, title: '보드게임', startMin: 1080 })], T);
    expect(a && `${a.when} ${a.name}`).toBe('오늘 18:00 보드게임');
    const b = todayStrip([ev({ date: T, joined: true, title: '보드게임' })], T);
    expect(b && `${b.when} ${b.name}`).toBe('오늘 하루 종일 보드게임');
    const c = todayStrip([ev({ date: T, joined: true })], T);
    expect(c && `${c.when} ${c.name}`).toBe('오늘 하루 종일 동호회 일정');
  });

  it('내일이면 내일, 자정 넘김은 다음날 표기', () => {
    const s = todayStrip([ev({ date: '2026-10-20', joined: true, segments: [seg('심야', 1470)] })], T);
    expect(s?.when).toBe('내일 다음날 00:30');
  });

  it('참여 안 한 일정·날짜 미정(후보가 오늘이어도)·모레 일정은 뺀다', () => {
    const evs = [
      ev({ id: 1, date: T, joined: false }),
      ev({ id: 2, date: null, joined: true, candidates: [{ date: T, responses: [] }] }),
      ev({ id: 3, date: '2026-10-21', joined: true }),
      ev({ id: 4, date: '2026-10-18', joined: true }),
    ];
    expect(todayStrip(evs, T)).toBeNull();
  });

  it('여럿이면 정렬상 첫 것 + 오늘·내일 합친 나머지 개수', () => {
    const evs = [
      ev({ id: 1, date: '2026-10-20', joined: true, startMin: 600 }),
      ev({ id: 2, date: T, joined: true, startMin: 1200 }),
      ev({ id: 3, date: T, joined: true, startMin: 900, title: '먼저' }),
      ev({ id: 4, date: T, joined: false, startMin: 60 }),
    ];
    const s = todayStrip(evs, T);
    expect(s?.event.id).toBe(3);
    expect(s?.when).toBe('오늘 15:00');
    expect(s?.more).toBe(2);
  });
});
