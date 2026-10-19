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
export function eventStatus(ev: Pick<EventDto, 'segments' | 'booked'>): EventStatus {
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

const MAX_MIN = 2879;
const DAY_MIN = 1440;

/* 동호회 쪽 시각 칸 해석: `13:40`, `9:05`, 앞뒤 공백 허용. 24시 이상은 못 읽은 것(null).
   조합 계산의 core.ts parseClock(예약 사이트의 `24:30` 표기용, 29시까지)과는 따로 둔다. */
export function parseClock24(s: string): number | null {
  const m = s.match(/^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/* 자정 넘김을 채운다. 시각은 0~1439 로 받는다.
   - 다음 행 시작이 앞 행 시작보다 이르면 그 행부터 다음날(+1440).
   - 행 끝이 그 행 시작보다 이르면 끝을 다음날로. 같으면 그대로 둔다(부르는 쪽이 오류로 본다).
   2879 를 넘으면(이틀 넘김) null. */
export function rollDays(rows: { start: number; end: number | null }[]): { start: number; end: number | null }[] | null {
  const out: { start: number; end: number | null }[] = [];
  let off = 0;
  for (const r of rows) {
    let start = r.start + off;
    const prev = out[out.length - 1];
    if (prev && start < prev.start) { off += DAY_MIN; start += DAY_MIN; }
    let end = r.end === null ? null : r.end + off;
    if (end !== null && end < start) end += DAY_MIN;
    if (start > MAX_MIN || (end !== null && end > MAX_MIN)) return null;
    out.push({ start, end });
  }
  return out;
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
   앞 시각보다 이르면 다음날로 본다. */
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
  const rows: { start: number; end: number | null }[] = [];
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
  if (!rolled || rolled.some((r) => r.end !== null && r.end <= r.start)) return { booked, segments: [] };
  const segments = rolled.map((r, i): KakaoSeg =>
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

/* 정렬 기준 시각: 하루 종일(시각도 구간도 없음)은 맨 앞, 일정 시각이 없으면 첫 구간 시작. */
function sortMin(ev: EventDto): number {
  if (ev.startMin !== null) return ev.startMin;
  return ev.segments.length > 0 ? ev.segments[0].startMin : -1;
}

export function sortEvents(evs: EventDto[]): EventDto[] {
  return [...evs].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      sortMin(a) - sortMin(b) ||
      a.id - b.id,
  );
}

/* ── '오늘'은 한국 날짜 ── 기기 시간대와 상관없이 같은 결과가 나오게 Asia/Seoul 로 센다. */

const KST = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function kst(now: Date): { iso: string; min: number } {
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

/* 오늘 / 내일 / 모레 / n일 뒤 / n일 전 */
export function relDay(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return '오늘';
  if (n === 1) return '내일';
  if (n === 2) return '모레';
  return n > 0 ? `${n}일 뒤` : `${-n}일 전`;
}

/* 일정이 끝나는 시각(그 날짜 자정부터 분). 일정 끝 → 마지막 구간 끝 → 마지막 구간 시작(없으면 일정 시작) + 2시간,
   하루 종일이면 그날 24:00. */
function endOf(ev: EventDto): number {
  const last = ev.segments[ev.segments.length - 1];
  if (ev.endMin !== null) return ev.endMin;
  if (last?.endMin != null) return last.endMin;
  const start = last?.startMin ?? ev.startMin;
  return start === null ? DAY_MIN : start + 120;
}

/* 내 다음 일정: 참여 중이고 오늘(한국 날짜) 이후인 것 중 가장 이른 것. 오늘 일정은 이미 끝났으면 건너뛴다. */
export function nextMine(evs: EventDto[], now: Date): EventDto | null {
  const { iso: today, min } = kst(now);
  return sortEvents(evs.filter((e) => e.joined && e.date >= today && (e.date > today || endOf(e) > min)))[0] ?? null;
}

/* 오늘 ~ 오늘+days-1 (양쪽 포함). */
export function upcoming(evs: EventDto[], today: string, days: number): EventDto[] {
  const last = addDays(today, days - 1);
  return sortEvents(evs.filter((e) => e.date >= today && e.date <= last));
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
  return sortEvents([...cur.filter((e) => (e.date < from || e.date > to) && !ids.has(e.id)), ...fresh]);
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
  if (code === 'EVENT_FULL') return 'refresh';
  if (code === 'NO_SUCH_EVENT') return 'drop';
  return 'none';
}
