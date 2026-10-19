/* 홈(지연 청크)만 쓰는 일정 계산 — 내 다음 일정·오늘/내일 띠. 첫 화면 번들에 안 들어가게 clubEvents 와 떼어 둔다. */
import { addDays, clockLabel, DAY_MIN, daysBetween, kst, sortEvents, sortKeyDate } from './clubEvents';
import type { EventDto } from './server';

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
  return sortEvents(evs.filter((e) => e.joined && e.date !== null && e.date >= today && (e.date > today || endOf(e) > min)))[0] ?? null;
}

/* 홈 맨 위 띠(§4.10 "앱 안 띠" — 푸시를 못 받는 사람용): 내가 참여한 오늘·내일(한국 날짜) 일정. 날짜 미정은 뺀다.
   오늘 일정은 이미 끝났으면 뺀다(끝 = nextMine 과 같은 endOf) — 끝난 오늘 일정이 내일 일정을 가리지 않게.
   첫 일정을 `오늘 19:00` + `비밀의 화원 → 셜록의 서재` 로, 나머지는 개수(` 외 n`, 뺀 뒤 센다).
   시각은 timeLabel 과 같은 차례(일정 시각 → 첫 구간 시작) — 홈 "내 다음 일정" 카드와 같은 시각이 보이게. 둘 다 없으면 `하루 종일`.
   이름은 구간의 테마들, 구간이 없으면 제목.
   시각이 24:00 을 넘는 일정(1470 = 다음날 00:30)은 실제로 그 시각이 오는 날로 센다 — 어제 일정의 00:30 은 `오늘 00:30`,
   오늘 일정의 00:30 은 `내일 00:30`(`다음날` 말은 붙이지 않는다). 내일 일정의 00:30 은 모레라서 뺀다. */
export interface TodayStrip { event: EventDto; when: string; name: string; more: number }
export function todayStrip(evs: EventDto[], now: Date): TodayStrip | null {
  const { iso: today, min } = kst(now);
  const tomorrow = addDays(today, 1);
  const rows: { e: EventDto; day: string; start: number | null }[] = [];
  for (const e of evs) {
    if (!e.joined || e.date === null) continue;
    const raw = e.startMin ?? e.segments[0]?.startMin ?? null;
    const roll = raw !== null && raw >= DAY_MIN ? DAY_MIN : 0; // 하루 넘긴 시각이면 그만큼 덜어 그날 시각으로
    const day = roll > 0 ? addDays(e.date, 1) : e.date;
    if (day === today ? endOf(e) - roll > min : day === tomorrow) rows.push({ e, day, start: raw === null ? null : raw - roll });
  }
  rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (a.start ?? -1) - (b.start ?? -1) || a.e.id - b.e.id);
  const first = rows[0];
  if (!first) return null;
  const { e, day, start } = first;
  const name = e.segments.length > 0 ? e.segments.map((g) => g.themeName).join(' → ') : e.title || '동호회 일정';
  return {
    event: e,
    when: `${day === today ? '오늘' : '내일'} ${start === null ? '하루 종일' : clockLabel(start)}`,
    name,
    more: rows.length - 1,
  };
}

/* 오늘 / 내일 / 모레 / n일 뒤 / n일 전 */
export function relDay(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return '오늘';
  if (n === 1) return '내일';
  if (n === 2) return '모레';
  return n > 0 ? `${n}일 뒤` : `${-n}일 전`;
}

/* 오늘 ~ 오늘+days-1 (양쪽 포함). */
export function upcoming(evs: EventDto[], today: string, days: number): EventDto[] {
  const last = addDays(today, days - 1);
  return sortEvents(evs.filter((e) => { const k = sortKeyDate(e, today); return k >= today && k <= last; }), today);
}
