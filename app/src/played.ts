/* 해 본 테마 — 화면 규칙을 순수 함수로 (작업명세서 §4.9). */
import type { EventDto, PlayedDto, SegmentDto, ThemeRef } from './server';

/* 일정에서 이 테마를 이미 해 본 참여자 수 — 구간마다 겹치는 사람은 한 번만 센다. */
export function playedCount(ev: Pick<EventDto, 'segments'>): number {
  const set = new Set<string>();
  for (const s of ev.segments) for (const u of s.playedBy ?? []) set.add(u);
  return set.size;
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
    if (needle && !squash(`${ref.themeName} ${ref.storeName} ${ref.branchName}`).includes(needle)
      && ![ref.themeName, ref.storeName, ref.branchName].some((f) => squash(f).includes(needle))) continue;
    out.push({ ref, recorded: isRecorded(ref, mine) });
    if (out.length >= 20) break;
  }
  return out;
}

export function sourceLabel(p: Pick<PlayedDto, 'source'>): '일정에서 자동' | '개인 일정에서' | '직접' {
  return p.source === 'EVENT' ? '일정에서 자동' : p.source === 'PLAN' ? '개인 일정에서' : '직접';
}
