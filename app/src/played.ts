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

/* 서버와 같은 이름 정규화(NFKC → 소문자 → 글자·숫자만) — 한꺼번에 넣기(bulkPlayed.ts)도 쓴다 */
export const normalizeName = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

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

export function sourceLabel(p: Pick<PlayedDto, 'source'>): '모임 일정에서' | '개인 일정에서' | '직접' {
  return p.source === 'EVENT' ? '모임 일정에서' : p.source === 'PLAN' ? '개인 일정에서' : '직접';
}

/* ── 협의 도우미(§4.9 fresh-themes) ── */

/* 목록 대신 보일 말. 안 모은 날(collected false)은 테마가 비어도 "열린 테마 없음"이 아니다 — 문구를 따로 둔다.
   테마가 있으면 null(목록을 보인다). */
export function freshMessage(dto: Pick<FreshDto, 'collected' | 'themes'>): string | null {
  if (!dto.collected) return '이 날은 아직 시간표를 모으지 않았어요. 가까워지면 다시 볼 수 있어요.';
  if (dto.themes.length === 0) return '이 날 열린 테마가 없어요.';
  return null;
}

/* 도우미 결과가 낡았나 — 열 때 이만큼 묵었으면 다시 가져온다(시간표는 몇 분 단위로 바뀐다) */
export const FRESH_STALE_MS = 5 * 60_000;
export const freshStale = (fetchedAt: number, now: number): boolean => now - fetchedAt > FRESH_STALE_MS;

/* 해 본 테마 기록이 하나도 없는 참여자 닉네임 — 이 사람들의 초록 점("안 해 봄")은 틀릴 수 있다 */
export function noRecordNames(dto: Pick<FreshDto, 'noRecord'>, ev: Pick<EventDto, 'participants'>): string[] {
  return playedNames({ playedBy: dto.noRecord }, ev);
}

export const noRecordText = (names: string[]): string =>
  `${names.join(', ')} 님은 해 본 테마 기록이 없어서 "안 해 봄"으로 보여도 틀릴 수 있어요.`;

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

/* ── 개인 "다녀온 일정" → 해 본 테마(§4.9 source PLAN) ── */

/* 일정 단계에서 기록할 것만 — 서버가 400 BAD_PLAYED 로 거절할 이름·같은 테마 중복은 뺀다.
   개인 일정 단계에는 매장·지점이 없어 branchName 은 늘 null. 날짜가 없으면 playedOn 도 null. */
export function stepsToPlayed(
  steps: { name: string }[], date: string | null | undefined,
): { themeName: string; branchName: string | null; playedOn: string | null }[] {
  const seen = new Set<string>();
  const out: { themeName: string; branchName: string | null; playedOn: string | null }[] = [];
  for (const s of steps) {
    const themeName = (s.name ?? '').trim();
    if (!isPlayableName(themeName)) continue;
    const key = normalizeName(themeName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ themeName, branchName: null, playedOn: date || null });
  }
  return out;
}

/* 저장·"다녀옴으로" 뒤에 부른다. 실패는 조용히 — 일정 저장에는 영향이 없다. 서버는 같은 기록이면 기존 행을 돌려줘 되풀이해도 괜찮다. */
export async function recordPlanPlayed(steps: { name: string }[], date: string): Promise<void> {
  try {
    const items = stepsToPlayed(steps, date);
    if (items.length === 0) return;
    const [{ addPlayed }, { idToken }] = await Promise.all([import('./server'), import('./cloud')]);
    const t = await idToken();
    if (!t) return;
    for (const it of items) {
      try { await addPlayed({ themeKey: null, ...it, source: 'PLAN' }, t); }
      catch (e) { console.warn('해 본 테마 기록 실패:', e); }
    }
  } catch (e) {
    console.warn('해 본 테마 기록 실패:', e);
  }
}
