/* 동호회 일정의 화면 쪽 규칙 — React 밖의 순수 함수 (작업명세서 §4.7, 계획 Task E1).
   상태·제목 만들기, 카톡 제목 해석, 카톡에 올릴 글, 홈에 고를 일정. */
import { fmt, WEEKDAYS } from './core';
import { errorCode, type EventDto } from './server';

export type EventStatus = 'talk' | 'before' | 'done';

export const STATUS_LABEL: Record<EventStatus, string> = {
  talk: '협의 중',
  before: '예약 전',
  done: '예약 완료',
};

/* 상태는 저장하지 않고 만든다: 구간 없음 → 협의 중, 있으면 예약 여부에 따라. */
export function eventStatus(ev: Pick<EventDto, 'segments' | 'booked'> & { date?: string | null }): EventStatus {
  if (ev.date === null) return 'talk'; // 날짜 미정은 구간이 있어도 늘 협의 중(§4.8)
  if (ev.segments.length === 0) return 'talk';
  return ev.booked ? 'done' : 'before';
}

/* 제목이 비면 구간으로 만든다: `비밀의 화원 13:40 → 셜록의 서재 15:20`. */
export function eventTitle(ev: Pick<EventDto, 'title' | 'segments'>): string {
  if (ev.title) return ev.title;
  return ev.segments.map((s) => `${s.themeName} ${fmt(s.startMin)}`).join(' → ');
}

/* ── 날짜·시각 (2026-10-19 다듬기, 작업명세서 §4.7 "시각") ──
   입력은 평범한 24시간제(00:00~23:59). 저장 값은 자정부터 분이라 다음날이면 1440 이상(최대 2879). */

export const DAY_MIN = 1440;

/* 동호회 쪽 시각 칸 해석: `13:40`, `9:05`, 앞뒤 공백 허용. 24시 이상은 못 읽은 것(null).
   조합 계산의 core.ts parseClock(예약 사이트의 `24:30` 표기용, 29시까지)과는 따로 둔다. */
export function parseClock24(s: string): number | null {
  const m = s.match(/^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export type TimeRow = { start: number; end: number | null };
/* 넘기지 못한 곳: 몇 번째 행의 시작(앞 행보다 이름)인지 끝(그 행 시작보다 이름)인지 */
export type RollResult = { rows: TimeRow[] } | { bad: 'start' | 'end'; index: number };

/* 자정을 건너는 것으로 보는 경우: 앞 시각이 18:00 이후이고 뒤 시각이 06:00 전. */
const crossesMidnight = (prev: number, next: number): boolean => prev >= 18 * 60 && next < 6 * 60;

/* 자정 넘김을 채운다. 시각은 0~1439 로 받는다.
   - 다음 행 시작이 앞 행 시작보다 이르면, 자정을 건너는 경우(위 18시·6시 규칙)만 그 행부터 다음날(+1440).
   - 행 끝이 그 행 시작보다 이르거나 같으면, 자정을 건너는 경우만 끝을 다음날로.
   - 다음날로는 한 번만 넘긴다. 첫 시작에서 24시간 이상 떨어진 시각도 받지 않는다(`23:00`/`00:30`/`23:50` 같은 순서 실수).
   그 밖에 순서가 뒤집혔으면 어디가 틀렸는지 돌려준다 — 오타가 조용히 하루 뒤로 저장되지 않게. */
export function rollDays(rows: TimeRow[]): RollResult {
  const out: TimeRow[] = [];
  let off = 0;
  for (const [i, r] of rows.entries()) {
    const prev = rows[i - 1];
    if (prev && r.start < prev.start) {
      if (off || !crossesMidnight(prev.start, r.start)) return { bad: 'start', index: i };
      off = DAY_MIN;
    }
    const start = r.start + off;
    let end = r.end === null ? null : r.end + off;
    if (r.end !== null && end !== null && r.end <= r.start) {
      if (off || !crossesMidnight(r.start, r.end)) return { bad: 'end', index: i };
      end += DAY_MIN;
    }
    const first = out[0]?.start ?? start;
    if (start >= first + DAY_MIN) return { bad: 'start', index: i };
    if (end !== null && end >= first + DAY_MIN) return { bad: 'end', index: i };
    out.push({ start, end });
  }
  return { rows: out };
}

/* 화면에 보이는 시각: 1440 이상이면 `다음날 00:30`. 카톡 글·자동 제목은 그냥 fmt 를 쓴다. */
export const clockLabel = (min: number): string => (min >= DAY_MIN ? `다음날 ${fmt(min)}` : fmt(min));

/* 시작~끝. 시작이 이미 다음날이면 끝에는 다시 붙이지 않는다: `23:00–다음날 01:00`, `다음날 00:40–01:50`. */
export function rangeLabel(start: number, end: number | null): string {
  if (end === null) return clockLabel(start);
  return `${clockLabel(start)}–${start >= DAY_MIN ? fmt(end) : clockLabel(end)}`;
}

/* 시각 표시. 하루 종일이면 ''. 끝이 없으면 시작만(`19:00`). 일정 시각이 없으면 구간의 첫 시작~마지막 끝으로 대신한다. */
export function timeLabel(
  ev: Pick<EventDto, 'startMin' | 'endMin' | 'segments'>,
): string {
  let start = ev.startMin;
  let end = ev.endMin;
  if (start === null) {
    if (ev.segments.length === 0) return '';
    start = ev.segments[0].startMin;
    end = ev.segments[ev.segments.length - 1].endMin;
  }
  return rangeLabel(start, end);
}

/* 시각 한 개: `13:40`, `13시40분`, `13시`. 24시간제라 시는 23 까지(아래에서 거른다). */
const TIME = String.raw`(?<!\d)(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})\s*분?)?)`;
/* 조각 = 테마명 + 시각, 또는 테마명 + 시각 ~ 시각(구분자 `~`·`-`·`–`) */
const PIECE = new RegExp(String.raw`^(.*?)\s*${TIME}(?:\s*[~\-–]\s*${TIME})?$`);

/* 이름 끝에 시각이나 `~`·`-`·`–` 가 남아 있으면 못 읽은 것이다(`A 13:40 14:50` 처럼) */
const RANGE_TAIL = /(?:\d:\d{2}|\d\s*시|\d\s*분)\s*$|[~\-–]\s*$/;

const toMin = (h: string, mm: string | undefined, mm2: string | undefined): number | null => {
  const hh = +h;
  const mi = mm !== undefined ? +mm : mm2 !== undefined ? +mm2 : 0;
  return hh > 23 || mi > 59 ? null : hh * 60 + mi;
};

export interface KakaoSeg { themeName: string; startMin: number; endMin?: number }

/* 카톡 제목 해석. 알아본 것만 채운다 — 조각 하나라도 시각이 없거나 테마명이 비면 구간은 비운다
   (틀리게 채우는 것보다 안 채우는 게 낫다). `13:40~14:50` 같은 시간 범위는 시작·끝을 다 채우고,
   자정을 건너면(rollDays) 다음날로 본다. 그 밖에 순서가 뒤집혔으면 안 채운다. */
export function parseKakaoTitle(s: string): {
  booked: boolean | null;
  segments: KakaoSeg[];
} {
  let rest = s.trim();
  let booked: boolean | null = null;
  /* 맨 앞 대괄호는 늘 하나 걷어 낸다 — 예약 O/X 표시면 예약 여부를 읽고, `[공지]` 같은 모르는 말이면 버린다
     (테마명 안에 남으면 틀리게 채우게 된다). */
  const lead = rest.match(/^\[([^\]]*)\]\s*/);
  if (lead) {
    const mark = lead[1].match(/^\s*예약\s*([oOxX0])\s*$/);
    if (mark) booked = mark[1] === 'x' || mark[1] === 'X' ? false : true;
    rest = rest.slice(lead[0].length);
  }
  const names: string[] = [];
  const rows: TimeRow[] = [];
  for (const piece of rest.split('+')) {
    const m = piece.trim().match(PIECE);
    if (!m) return { booked, segments: [] };
    const themeName = m[1].trim();
    if (!themeName || RANGE_TAIL.test(themeName)) return { booked, segments: [] };
    const start = toMin(m[2], m[3], m[4]);
    const end = m[5] === undefined ? null : toMin(m[5], m[6], m[7]);
    if (start === null || (m[5] !== undefined && end === null)) return { booked, segments: [] };
    names.push(themeName);
    rows.push({ start, end });
  }
  const rolled = rollDays(rows);
  if (!('rows' in rolled)) return { booked, segments: [] };
  const segments = rolled.rows.map((r, i): KakaoSeg =>
    r.end === null ? { themeName: names[i], startMin: r.start } : { themeName: names[i], startMin: r.start, endMin: r.end });
  return { booked, segments };
}

/* 카톡에 올릴 글. 구간이 있으면 `[예약O] 테마 시각 + … · 3/4명`, 없으면 `제목 · 2명`. */
export function kakaoPost(ev: EventDto, link: string): string {
  const people = ev.capacity === null ? `${ev.count}명` : `${ev.count}/${ev.capacity}명`;
  const head =
    ev.segments.length > 0
      ? `[예약${ev.booked ? 'O' : 'X'}] ` +
        ev.segments.map((s) => `${s.themeName} ${fmt(s.startMin)}`).join(' + ')
      : ev.title;
  return `${head} · ${people}\n${link}`;
}

export const isUndecided = (ev: Pick<EventDto, 'date'>): boolean => ev.date === null;

/* 정렬·자리 잡기 기준 날짜: 날짜가 있으면 그 날짜, 미정이면 from 이상인 가장 이른 후보(없으면 가장 이른 후보).
   후보도 없으면 ''. */
export function sortKeyDate(ev: Pick<EventDto, 'date' | 'candidates'>, from?: string): string {
  if (ev.date !== null) return ev.date;
  const ds = ev.candidates.map((c) => c.date).sort();
  return (from === undefined ? undefined : ds.find((d) => d >= from)) ?? ds[0] ?? '';
}

export interface CandidateRow {
  date: string;
  yes: number;
  total: number;
  window: { start: number; end: number } | null;
  noUids: string[];
  noneUids: string[];
  all: boolean;
}

/* 후보 날짜별 요약(§4.8): 몇 명 중 몇 명이 되는지, 된다는 사람들 시간대의 교집합(종일 = 0~2879),
   안 된다는 사람·응답 안 한 사람. 모두 되는 날짜가 먼저, 그다음 되는 사람 많은 순, 같으면 날짜 순. */
export function candidateSummary(ev: Pick<EventDto, 'candidates' | 'participants'>): CandidateRow[] {
  const total = ev.participants.length;
  const rows = ev.candidates.map((c): CandidateRow => {
    const byUid = new Map(c.responses.map((r) => [r.uid, r]));
    const noUids: string[] = [];
    const noneUids: string[] = [];
    let yes = 0;
    let start = 0;
    let end = 2 * DAY_MIN - 1;
    for (const p of ev.participants) {
      const r = byUid.get(p.uid);
      if (!r) noneUids.push(p.uid);
      else if (!r.available) noUids.push(p.uid);
      else {
        yes++;
        start = Math.max(start, r.startMin ?? 0);
        end = Math.min(end, r.endMin ?? 2 * DAY_MIN - 1);
      }
    }
    return { date: c.date, yes, total, window: yes > 0 && start < end ? { start, end } : null, noUids, noneUids, all: total > 0 && yes === total };
  });
  return rows.sort((a, b) => Number(b.all) - Number(a.all) || b.yes - a.yes || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* 다 같이 되는 시간 표시 — 모두 종일이라 0~2879 그대로면 `종일` */
export const windowLabel = (w: { start: number; end: number }): string =>
  w.start === 0 && w.end >= 2 * DAY_MIN - 1 ? '종일' : rangeLabel(w.start, w.end);

/* 내 응답의 시간 칸: 빈칸(또는 `종일`) = 종일, `14:00~22:00`(구분자 `~`·`-`·`–`). 24시간제,
   자정 넘김은 §4.7 규칙(앞 시각 18시 이후 → 뒤 시각 6시 전)일 때만 다음날로 본다. */
export type AvailTime = { startMin: number | null; endMin: number | null };
export function parseAvailText(s: string): AvailTime | { error: string } {
  const t = s.trim();
  if (!t || t === '종일') return { startMin: null, endMin: null };
  const m = t.match(/^(.+?)\s*[~\-–]\s*(.+)$/);
  const start = m ? parseClock24(m[1]) : null;
  const end = m ? parseClock24(m[2]) : null;
  if (start === null || end === null) return { error: '14:00~22:00 처럼 24시간제로 적어 주세요. 비우면 종일이에요.' };
  const rolled = rollDays([{ start, end }]);
  if (!('rows' in rolled)) {
    return { error: end < 6 * 60 && start >= 6 * 60
      ? '자정을 넘기는 시간은 저녁 6시 이후에 시작할 때만 적을 수 있어요.'
      : '끝 시각이 시작보다 늦어야 해요.' };
  }
  return { startMin: rolled.rows[0].start, endMin: rolled.rows[0].end };
}

/* 다 같이 되는 시간 → 조합 계산 조건(가장 이른 시작·가장 늦은 종료) 칸 값. 계산 쪽 parseClock 은 29:59 까지
   읽으므로 자정 뒤는 `25:30` 처럼 이어 적는다(fmt 로 접으면 끝이 시작보다 앞이 된다). 종일 쪽 끝·29:59 를 넘는 끝은
   "제한 없음"(빈칸). */
export function windowToCalc(w: { start: number; end: number }): { oStart: string; oEnd: string } {
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const LAST = 29 * 60 + 59;
  return { oStart: w.start === 0 || w.start > LAST ? '' : hm(w.start), oEnd: w.end > LAST ? '' : hm(w.end) };
}

/* 시간 칸에 다시 보일 글 — 24시간제로 접는다(1560 → `02:00`). 읽을 때 parseAvailText 가 다음날을 다시 채운다 */
export const availText = (r: AvailTime): string =>
  r.startMin === null || r.endMin === null ? '' : `${fmt(r.startMin)}~${fmt(r.endMin)}`;

/* 정렬 기준 시각: 하루 종일(시각도 구간도 없음)은 맨 앞, 일정 시각이 없으면 첫 구간 시작. */
function sortMin(ev: EventDto): number {
  if (ev.startMin !== null) return ev.startMin;
  return ev.segments.length > 0 ? ev.segments[0].startMin : -1;
}

/* from 을 주면 미정 일정은 from 이상인 가장 이른 후보 자리에 놓인다(지난 후보에 끌려가지 않게). */
export function sortEvents(evs: EventDto[], from?: string): EventDto[] {
  return [...evs].sort(
    (a, b) =>
      (sortKeyDate(a, from) < sortKeyDate(b, from) ? -1 : sortKeyDate(a, from) > sortKeyDate(b, from) ? 1 : 0) ||
      sortMin(a) - sortMin(b) ||
      a.id - b.id,
  );
}

/* ── '오늘'은 한국 날짜 ── 기기 시간대와 상관없이 같은 결과가 나오게 Asia/Seoul 로 센다. */

const KST = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function kst(now: Date): { iso: string; min: number } {
  const p = Object.fromEntries(KST.formatToParts(now).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}

/* 한국 날짜 "YYYY-MM-DD" */
export const todayKst = (now: Date = new Date()): string => kst(now).iso;

const utcDay = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/* a 에서 b 까지 며칠(b 가 늦으면 양수). 날짜끼리만 빼서 시간대와 무관하다. */
export const daysBetween = (a: string, b: string): number => Math.round((utcDay(b) - utcDay(a)) / 86_400_000);

/* 요일 번호(0 = 일) */
export const weekday = (iso: string): number => new Date(utcDay(iso)).getUTCDay();

/* `10/24 (토)` — 목록·칩 */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d} (${WEEKDAYS[weekday(iso)]})`;
}

/* `2026년 10월 24일 (토)` — 내 다음 일정·상세 패널 */
export function longDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[weekday(iso)]})`;
}

/* "YYYY-MM-DD" 에 n 일을 더한다(날짜만 — 시간대와 무관). */
export function addDays(iso: string, n: number): string {
  return new Date(utcDay(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/* 글자 수는 코드 포인트로 센다(이모지 1개 = 1자). */
export const cpLen = (s: string): number => [...s].length;

/* ── 목록 병합 (useClubEvents 가 쓴다) ── */

/* from~to(양쪽 포함) 안의 기존 항목을 버리고 fresh 로 바꾼 뒤 정렬한다. 서버에서 지워진 일정이 사라진다. */
export function mergeRange(cur: EventDto[], from: string, to: string, fresh: EventDto[]): EventDto[] {
  const ids = new Set(fresh.map((e) => e.id)); // 범위 밖에서 범위 안으로 옮겨 온 일정이 둘로 남지 않게
  /* 날짜 미정 일정은 후보가 하나라도 범위 안이면 그 범위 소속 */
  const inRange = (e: EventDto) =>
    e.date !== null ? e.date >= from && e.date <= to : e.candidates.some((c) => c.date >= from && c.date <= to);
  return sortEvents([...cur.filter((e) => !inRange(e) && !ids.has(e.id)), ...fresh], from);
}

/* 같은 id 가 있으면 바꾸고 없으면 넣는다. */
export function upsert(cur: EventDto[], ev: EventDto): EventDto[] {
  return sortEvents([...cur.filter((e) => e.id !== ev.id), ev]);
}

export function dropEvent(cur: EventDto[], id: number): EventDto[] {
  return cur.filter((e) => e.id !== id);
}

/* 동작이 실패한 뒤 목록을 어떻게 맞출지. 정원 초과면 그 일정을 다시 불러와 낡은 "참여" 단추를 없앤다,
   이미 지워진 일정이면 목록에서 뺀다. 수정 충돌(EVENT_CONFLICT)은 화면(E5)이 직접 다룬다. */
export function afterActionError(err: unknown): 'refresh' | 'drop' | 'none' {
  const code = errorCode(err);
  if (code === 'EVENT_FULL' || code === 'NOT_A_CANDIDATE') return 'refresh';
  if (code === 'NO_SUCH_EVENT') return 'drop';
  return 'none';
}
