/* 해 본 테마 훑어보기·캘린더 층 — 화면 규칙을 순수 함수로(기획 §4.62).
   played.ts 와 따로 둔 까닭: played.ts 는 진입 청크에 있어(SchedulerPage 가 부른다) 여기 함수를 거기 두면
   지연 청크(내 정보·캘린더)만 쓰는 코드가 진입 크기에 붙는다. */
import type { PlayedDto } from './server';

/* 캘린더에 띄울 기록을 날짜별로 한 번 묶는다 — 직접 적은 것(MANUAL)이고 날짜가 있는 것만.
   일정에서 온 것(EVENT·PLAN)은 그날 동호회 일정 칩·"다녀온 일정" 칩으로 이미 보여 겹치지 않게 뺀다.
   한 날 안은 받은 순서(서버의 최근 순) 그대로. 수백 개여도 달 칸을 그릴 때는 Map 에서 꺼내기만 한다. */
export function playedByDate(list: readonly PlayedDto[]): Map<string, PlayedDto[]> {
  const m = new Map<string, PlayedDto[]>();
  for (const p of list) {
    if (p.source !== 'MANUAL' || !p.playedOn) continue;
    const day = m.get(p.playedOn);
    if (day) day.push(p);
    else m.set(p.playedOn, [p]);
  }
  return m;
}

export type PlayedSort = 'recent' | 'name';

const collator = new Intl.Collator('ko');
/* createdAt 은 ISO 문자열이라 글자 비교가 곧 시간 비교다 */
const newer = (a: PlayedDto, b: PlayedDto) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id;

/* 최근 순 — 한 날짜(playedOn) 내림차순, 같은 날은 늦게 넣은 것 먼저, 날짜 없는 것은 맨 뒤에 늦게 넣은 것 먼저.
   이름 순 — 테마 이름(가나다), 같으면 매장·지점. 원래 배열은 건드리지 않는다. */
export function sortPlayed(list: readonly PlayedDto[], by: PlayedSort): PlayedDto[] {
  const out = [...list];
  if (by === 'name') {
    const place = (p: PlayedDto) => `${p.storeName ?? ''} ${p.branchName ?? ''}`;
    return out.sort((a, b) => collator.compare(a.themeName, b.themeName) || collator.compare(place(a), place(b)) || newer(a, b));
  }
  return out.sort((a, b) => {
    if (a.playedOn !== b.playedOn) {
      if (!a.playedOn) return 1;
      if (!b.playedOn) return -1;
      return a.playedOn < b.playedOn ? 1 : -1;
    }
    return newer(a, b);
  });
}

export interface YearGroup<T> {
  key: string;     // '2024' · 'none'
  label: string;   // '2024년' · '날짜 모름'
  count: number;   // 그 묶음의 기록 수(숨긴 줄 제외 — 보이는 쪽 수와 상관없이)
  rows: T[];       // 지금 보일 줄
}

/* 최근 순 목록을 연도별로 묶는다. rows 는 지금 보일 줄(앞에서 몇 개만 보일 수 있다), counted 는 수를 셀 전체 줄.
   보일 줄이 없는 연도는 빼고, 수는 counted 기준(더 보기를 누르기 전에도 "2019년 · 40개"가 맞게). */
export function groupByYear<T extends Pick<PlayedDto, 'playedOn'>>(rows: readonly T[], counted: readonly T[]): YearGroup<T>[] {
  const yearOf = (p: T) => p.playedOn?.slice(0, 4) ?? 'none';
  const counts = new Map<string, number>();
  for (const p of counted) counts.set(yearOf(p), (counts.get(yearOf(p)) ?? 0) + 1);
  const groups: YearGroup<T>[] = [];
  for (const p of rows) {
    const key = yearOf(p);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: key === 'none' ? '날짜 모름' : `${key}년`, count: counts.get(key) ?? 0, rows: [] };
      groups.push(g);
    }
    g.rows.push(p);
  }
  return groups;
}

/* 찾기 칸의 글자로 목록도 거른다 — 테마·매장·지점 부분 일치(NFKC·대소문자·공백 무시, 테마 찾기와 같은 규칙). 빈 글자면 다 맞다 */
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export function matchPlayed(p: Pick<PlayedDto, 'themeName' | 'storeName' | 'branchName'>, q: string): boolean {
  const needle = squash(q);
  return !needle || squash(`${p.themeName} ${p.storeName ?? ''} ${p.branchName ?? ''}`).includes(needle);
}

/* 위쪽 요약 "모두 412개 · 올해 23개" — 올해는 한국 날짜 오늘(today, YYYY-MM-DD)의 연도로 센다 */
export function playedSummary(list: readonly Pick<PlayedDto, 'playedOn'>[], today: string): { total: number; thisYear: number } {
  const y = today.slice(0, 4);
  let thisYear = 0;
  for (const p of list) if (p.playedOn?.startsWith(y)) thisYear++;
  return { total: list.length, thisYear };
}

/* 날짜 칸 값 확인 — 비면 null(몰라도 된다), 오늘(KST) 뒤면 'future'. max 속성만으로는 직접 친 미래 날짜가 막히지 않는다 */
export function checkPlayedOn(value: string, today: string): { ok: true; playedOn: string | null } | { ok: false } {
  const v = value.trim();
  if (!v) return { ok: true, playedOn: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > today) return { ok: false };
  return { ok: true, playedOn: v };
}

/* 목록 줄의 날짜 — 최근 순은 연도 머리가 있어 "3/15 (금)", 이름 순은 연도까지 "2024.3.15" */
export function fullDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}.${m}.${d}`;
}
