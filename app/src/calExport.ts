/* 내 캘린더로 내보내기(2026-10-23 사용자 요청) — 일정 하나를 구글 캘린더 주소나 .ics 파일로. 순수 함수.
   일정 상세(지연 청크)에서만 쓴다. 날짜 미정 일정은 내보낼 수 없다(null).
   시각은 한국 시각(자정부터 분, 다음날이면 1440 이상)이라 UTC 로 바꿔 싣는다 — 받는 캘린더가 자기 시간대로 보여 준다. */
import { clockLabel, eventTitle } from './clubEvents';
import type { EventDto } from './server';

type Ev = Pick<EventDto, 'id' | 'title' | 'date' | 'startMin' | 'endMin' | 'location' | 'memo' | 'segments'>;

const KST_MIN = 9 * 60;
const DEFAULT_LEN = 120;   // 끝을 모르면 2시간(홈의 "끝난 일정" 판단과 같다)

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;

/* "YYYY-MM-DD" + 그날 자정부터 분(KST) → "YYYYMMDDTHHMMSSZ" */
function utcStamp(date: string, min: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 0, min - KST_MIN));
  return `${ymd(t)}T${p2(t.getUTCHours())}${p2(t.getUTCMinutes())}00Z`;
}

/* 내보낼 시각 — 하루 종일이면 날짜만(끝은 다음날, 캘린더 약속). 구간이 있으면 첫 시작 ~ 마지막 끝(없으면 마지막 시작 + 2시간),
   없으면 일정 시작 ~ 끝(없으면 + 2시간). 오전·오후 일정은 그 범위 그대로(00:00–11:59 · 12:00–23:59) */
export function calSpan(ev: Ev): { allDay: boolean; start: string; end: string } | null {
  if (ev.date === null) return null;
  const segs = ev.segments;
  let start: number | null = ev.startMin, end: number | null = ev.endMin;
  if (segs.length > 0) {
    const last = segs[segs.length - 1];
    start = segs[0].startMin;
    end = last.endMin ?? last.startMin + DEFAULT_LEN;
  }
  if (start === null) {
    const [y, m, d] = ev.date.split('-').map(Number);
    return { allDay: true, start: ev.date.replace(/-/g, ''), end: ymd(new Date(Date.UTC(y, m - 1, d + 1))) };
  }
  return { allDay: false, start: utcStamp(ev.date, start), end: utcStamp(ev.date, end ?? start + DEFAULT_LEN) };
}

/* 캘린더 설명 — 코스 줄("13:40 비밀의 화원 · 강남점"), 메모, 앱 링크 */
function details(ev: Ev, link: string): string {
  const course = ev.segments.map((g) => `${clockLabel(g.startMin)} ${g.themeName}${g.branchName ? ` · ${g.branchName}` : ''}`);
  const parts = [course.join('\n'), ev.memo ?? '', `Floduler: ${link}`].filter(Boolean);
  return parts.join('\n\n');
}

const placeOf = (ev: Ev): string => ev.location ?? ev.segments.find((g) => g.branchName)?.branchName ?? '';

export function googleCalUrl(ev: Ev, link: string): string | null {
  const s = calSpan(ev);
  if (!s) return null;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: eventTitle(ev) || '모임 일정', dates: `${s.start}/${s.end}`, details: details(ev, link) });
  const place = placeOf(ev);
  if (place) q.set('location', place);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* RFC 5545 글 값 — \ ; , 와 줄바꿈 이스케이프 */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/* 75바이트(UTF-8)에서 접는다 — 이어지는 줄은 공백 한 칸으로 시작(그 공백도 75 안에 센다). 글자 중간에서 자르지 않는다 */
function fold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 75) { out.push(cur); cur = ' '; size = 1; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out;
}

/* .ics 파일 글. UID 는 일정 id 로 고정 — 같은 일정을 다시 넣으면 캘린더가 새로 만들지 않고 고친다(지원하는 앱에서) */
export function icsText(ev: Ev, link: string, now: Date): string | null {
  const s = calSpan(ev);
  if (!s) return null;
  const stamp = `${ymd(now)}T${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`;
  const place = placeOf(ev);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Floduler//Club Event//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:floduler-event-${ev.id}@roomescapescheduler.web.app`,
    `DTSTAMP:${stamp}`,
    s.allDay ? `DTSTART;VALUE=DATE:${s.start}` : `DTSTART:${s.start}`,
    s.allDay ? `DTEND;VALUE=DATE:${s.end}` : `DTEND:${s.end}`,
    `SUMMARY:${esc(eventTitle(ev) || '모임 일정')}`,
    `DESCRIPTION:${esc(details(ev, link))}`,
    ...(place ? [`LOCATION:${esc(place)}`] : []),
    `URL:${link}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
