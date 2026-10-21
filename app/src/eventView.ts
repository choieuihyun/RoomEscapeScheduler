/* 홈·일정 상세 개편(2026-10-21)에서 쓰는 글 만들기 — 큰 숫자(D-day), 접힌 줄 요약, 장소·코스 한 줄, 이번 주.
   홈·상세는 지연 청크라 첫 화면 번들(clubEvents)에 넣지 않고 여기 둔다. */
import { addDays, daysBetween, weekday } from './clubEvents';
import { WEEKDAYS } from './core';
import { won } from './settle';
import type { EventDto, SettlementDto } from './server';

/* 내 다음 일정의 큰 숫자 — 오늘이면 "오늘", 아니면 D-n. 지난 날은 오지 않지만 오면 D+n */
export function dDay(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return '오늘';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/* `10월 24일 (토)` — 연도 없이 */
export function monthDayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[weekday(iso)]})`;
}

/* 어디 — 적어 둔 위치가 있으면 그것, 없으면 구간의 매장들(겹치면 한 번). 둘 다 없으면 '' */
export function placeLabel(ev: Pick<EventDto, 'location' | 'segments'>): string {
  if (ev.location?.trim()) return ev.location.trim();
  return [...new Set(ev.segments.map((g) => g.branchName?.trim()).filter((b): b is string => !!b))].join(' · ');
}

/* 코스 한 줄 — `심야 병동 → 비밀의 화원`. 구간이 없으면 '' */
export const courseLine = (ev: Pick<EventDto, 'segments'>): string => ev.segments.map((g) => g.themeName).join(' → ');

/* 인원 — `4/6명 · 2자리 남음`, 꽉 차면 `6/6명 · 마감`, 정원 없으면 `3명` */
export function peopleLabel(ev: Pick<EventDto, 'count' | 'capacity'>): { n: string; left: string } {
  if (ev.capacity === null) return { n: `${ev.count}명`, left: '' };
  const rest = ev.capacity - ev.count;
  return { n: `${ev.count}/${ev.capacity}명`, left: rest > 0 ? `${rest}자리 남음` : '마감' };
}

/* 날짜 협의 접힌 줄 — `후보 3개 · 응답 2명`(응답한 사람은 후보 어디에든 한 번이라도 답한 사람) */
export function talkSummary(ev: Pick<EventDto, 'candidates'>): string {
  const who = new Set(ev.candidates.flatMap((c) => c.responses.map((r) => r.uid)));
  return `후보 ${ev.candidates.length}개 · 응답 ${who.size}명`;
}

/* 정산 접힌 줄 — 합계 · 남은 송금. 정산을 아직 못 받았으면 합계만, 없으면 "아직 없어요" */
export function settleSummary(total: number | null, dto: Pick<SettlementDto, 'items' | 'total' | 'transfers'> | null): string {
  if (dto && dto.items.length > 0) {
    const left = dto.transfers.filter((t) => !t.paid).length;
    const tail = dto.transfers.length === 0 ? '주고받을 돈 없음' : left > 0 ? `보낼 돈 ${left}건 남음` : '다 보냈어요';
    return `${won(dto.total)} · ${tail}`;
  }
  if (dto) return '아직 없어요';
  return total === null ? '아직 없어요' : won(total);
}

/* 내가 아직 안 보낸 송금이 있나 — 있으면 정산 줄을 처음부터 펼쳐 둔다(홈 "보낼 돈" 띠로 들어온 경우) */
export const owesMoney = (dto: Pick<SettlementDto, 'transfers'> | null, meUid: string): boolean =>
  !!dto && dto.transfers.some((t) => t.from.uid === meUid && !t.paid);

/* 오늘이 든 주(일~토) 일곱 날 */
export function weekDays(today: string): string[] {
  const start = addDays(today, -weekday(today));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/* `10월 넷째 주` — 그 달의 몇째 주(주는 일요일 시작, 1일이 든 주가 첫째 주). 주가 두 달에 걸치면 오늘의 달로 */
export function weekTitle(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const nth = Math.floor((d - 1 + weekday(first)) / 7);
  return `${m}월 ${['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'][nth]} 주`;
}
