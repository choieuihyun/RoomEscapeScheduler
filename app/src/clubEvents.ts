/* 동호회 일정의 화면 쪽 규칙 — React 밖의 순수 함수 (작업명세서 §4.7, 계획 Task E1).
   상태·제목 만들기, 카톡 제목 해석, 카톡에 올릴 글, 홈에 고를 일정. */
import { fmt, toISO } from './core';
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

/* 시각 표시. 하루 종일이면 ''. 일정 시각이 없으면 구간의 첫 시작~마지막 끝으로 대신한다. */
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
  return end === null ? fmt(start) : `${fmt(start)}–${fmt(end)}`;
}

/* 조각 끝의 시각: `13:40`, `13시40분`, `13시`. 시는 core.ts parseClock 처럼 29 까지. */
const PIECE = /^(.*?)\s*(?<!\d)(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})\s*분?)?)$/;

/* 카톡 제목 해석. 알아본 것만 채운다 — 조각 하나라도 시각이 없거나 테마명이 비면 구간은 비운다
   (틀리게 채우는 것보다 안 채우는 게 낫다). */
export function parseKakaoTitle(s: string): {
  booked: boolean | null;
  segments: { themeName: string; startMin: number }[];
} {
  let rest = s.trim();
  let booked: boolean | null = null;
  const mark = rest.match(/^\[\s*예약\s*([oOxX0])\s*\]\s*/);
  if (mark) {
    booked = mark[1] === 'x' || mark[1] === 'X' ? false : true;
    rest = rest.slice(mark[0].length);
  }
  const segments: { themeName: string; startMin: number }[] = [];
  for (const piece of rest.split('+')) {
    const m = piece.trim().match(PIECE);
    if (!m) return { booked, segments: [] };
    const h = +m[2];
    const mi = m[3] !== undefined ? +m[3] : m[4] !== undefined ? +m[4] : 0;
    const themeName = m[1].trim();
    if (h > 29 || mi > 59 || !themeName) return { booked, segments: [] };
    segments.push({ themeName, startMin: h * 60 + mi });
  }
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

/* 내 다음 일정: 참여 중이고 오늘 이후인 것 중 가장 이른 것. */
export function nextMine(evs: EventDto[], today: string): EventDto | null {
  return sortEvents(evs.filter((e) => e.joined && e.date >= today))[0] ?? null;
}

/* 오늘 ~ 오늘+days-1 (양쪽 포함). */
export function upcoming(evs: EventDto[], today: string, days: number): EventDto[] {
  const last = addDays(today, days - 1);
  return sortEvents(evs.filter((e) => e.date >= today && e.date <= last));
}

/* "YYYY-MM-DD" 에 n 일을 더한다(로컬 타임존 기준). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n));
}

/* 글자 수는 코드 포인트로 센다(이모지 1개 = 1자). */
export const cpLen = (s: string): number => [...s].length;

/* ── 목록 병합 (useClubEvents 가 쓴다) ── */

/* from~to(양쪽 포함) 안의 기존 항목을 버리고 fresh 로 바꾼 뒤 정렬한다. 서버에서 지워진 일정이 사라진다. */
export function mergeRange(cur: EventDto[], from: string, to: string, fresh: EventDto[]): EventDto[] {
  return sortEvents([...cur.filter((e) => e.date < from || e.date > to), ...fresh]);
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
