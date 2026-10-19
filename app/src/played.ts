/* 해 본 테마 — 화면 규칙을 순수 함수로 (작업명세서 §4.9). */
import { candidateSummary } from './clubEvents';
import type { EventDto, FreshDto, PlayedDto, SegmentDto, ThemeRef } from './server';

/* 일정에서 이 테마를 이미 해 본 참여자 수 — 구간마다 겹치는 사람은 한 번만 센다. */
export function playedCount(ev: Pick<EventDto, 'segments'>): number {
  const set = new Set<string>();
  for (const s of ev.segments) for (const u of s.playedBy ?? []) set.add(u);
  return set.size;
}

/* 사람마다 이 일정 테마 중 몇 개를 해 봤나 — 참여자 칩의 "해 봄 n" */
export function playedPerPerson(ev: Pick<EventDto, 'segments'>): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of ev.segments) for (const u of new Set(s.playedBy ?? [])) m.set(u, (m.get(u) ?? 0) + 1);
  return m;
}

/* 구간 하나를 해 본 참여자 닉네임. 참여자 목록에 없는 uid 는 뺀다. */
export function playedNames(seg: Pick<SegmentDto, 'playedBy'>, ev: Pick<EventDto, 'participants'>): string[] {
  const nick = new Map(ev.participants.map((p) => [p.uid, p.nickname]));
  const out: string[] = [];
  for (const u of seg.playedBy ?? []) {
    const n = nick.get(u);
    if (n) out.push(n);
  }
  return out;
}

const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/* 이미 해 본 테마인가 — 키가 같거나, 한쪽에 키가 없으면 이름이 같을 때(서버 판정과 같게). */
function isRecorded(ref: ThemeRef, mine: PlayedDto[]): boolean {
  const name = normalizeName(ref.themeName);
  return mine.some((p) =>
    p.themeKey ? p.themeKey === ref.themeKey : normalizeName(p.themeName) === name);
}

const normalizeName = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/* 서버가 이름을 맞출 때 쓰는 규칙 — 글자·숫자만 남겨 비면 400 BAD_PLAYED. 직접 입력을 미리 막는 데 쓴다. */
export function isPlayableName(name: string): boolean {
  return normalizeName(name).length > 0;
}

/* 이름·매장·지점 부분 일치(공백·대소문자 무시), 최대 20개. 이미 기록한 것은 recorded. */
export function searchThemes(
  all: ThemeRef[], q: string, mine: PlayedDto[],
): { ref: ThemeRef; recorded: boolean }[] {
  const needle = squash(q);
  const out: { ref: ThemeRef; recorded: boolean }[] = [];
  for (const ref of all) {
    if (needle && !squash(`${ref.themeName} ${ref.storeName} ${ref.branchName}`).includes(needle)) continue;
    out.push({ ref, recorded: isRecorded(ref, mine) });
    if (out.length >= 20) break;
  }
  return out;
}

export function sourceLabel(p: Pick<PlayedDto, 'source'>): '일정에서 자동' | '개인 일정에서' | '직접' {
  return p.source === 'EVENT' ? '일정에서 자동' : p.source === 'PLAN' ? '개인 일정에서' : '직접';
}

/* ── 협의 도우미(§4.9 fresh-themes) ── */

/* 목록 대신 보일 말. 안 모은 날(collected false)은 테마가 비어도 "열린 테마 없음"이 아니다 — 문구를 따로 둔다.
   테마가 있으면 null(목록을 보인다). */
export function freshMessage(dto: Pick<FreshDto, 'collected' | 'themes'>): string | null {
  if (!dto.collected) return '이 날은 아직 시간표를 모으지 않았어요. 가까워지면 다시 볼 수 있어요.';
  if (dto.themes.length === 0) return '이 날 열린 테마가 없어요.';
  return null;
}

/* 해 본 테마 기록이 하나도 없는 참여자 닉네임 — 이 사람들 때문에 "아무도 안 해 봄"이 틀릴 수 있다 */
export function noRecordNames(dto: Pick<FreshDto, 'noRecord'>, ev: Pick<EventDto, 'participants'>): string[] {
  return playedNames({ playedBy: dto.noRecord }, ev);
}

export const noRecordText = (names: string[]): string =>
  `${names.join(', ')} 님은 해 본 테마 기록이 없어요. "아무도 안 해 봄"이 틀릴 수 있어요.`;

/* 도우미가 볼 날짜. 정해진 날이면 그 날짜 하나, 날짜 미정이면 오늘 이후 후보(날짜 순) 중에서 고르고
   처음엔 "언제 될까요?" 맨 위 줄(candidateSummary 순서)의 날짜. 볼 날짜가 다 지났으면 null — 지난 날을
   "아직 시간표를 모으지 않았어요. 가까워지면…"으로 보이면 틀린 말이라 도우미를 숨긴다. */
export function helperDates(
  ev: Pick<EventDto, 'date' | 'candidates' | 'participants'>, today: string,
): { dates: string[]; first: string } | null {
  if (ev.date !== null) return ev.date >= today ? { dates: [ev.date], first: ev.date } : null;
  const dates = ev.candidates.map((c) => c.date).filter((d) => d >= today).sort();
  const first = candidateSummary(ev).find((r) => r.date >= today)?.date;
  return first ? { dates, first } : null;
}
