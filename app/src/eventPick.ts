/* 일정 만들기 창의 "테마 찾아서 넣기" — 예약 사이트에서 모은 회차를 구간으로 바꾸고 이미 있는 구간과 합친다.
   React 밖의 순수 함수. 일정 창(지연 청크)만 쓴다 — eventForm.ts 는 진입 번들이라 여기에 둔다. */
import { fmt } from './core';
import { addDays, cpLen, parseClock24, rollDays, type TimeRow } from './clubEvents';
import { MAX_SEGS, type FormSeg, type FormState } from './eventForm';
import { normalizeName } from './played';
import type { Branch, PlayedDto, ServerSession, ServerTheme } from './server';

/* 고른 회차 하나. t 는 그 날짜 자정부터 분(다음날 회차는 1440 이상), dur 은 테마 소요 시간(모르면 null) */
export interface PickedSession {
  key: string;
  date: string;
  themeName: string;
  branchName: string;
  themeKey: string | null;
  t: number;
  dur: number | null;
}

/* 시간표 계산의 회차 불러오기와 같은 지점 이름 — `매장 지점`, 매장이 없으면 지점만 */
export const branchLabel = (b: Pick<Branch, 'store' | 'branch'>): string => (b.store ? `${b.store} ${b.branch}` : b.branch);

const clip = (s: string, n: number) => [...s.trim()].slice(0, n).join('');

/* 회차 → 고른 회차. 테마 키는 /api/schedule 의 테마 id 를 그대로 쓴다 — /api/themes 의 themeKey 와 같은 체계다
   (2026-10-20 운영 서버로 확인: 던전101 의 테마 id 가 모두 themeKey 목록에 있었다). 이름·지점은 저장 한도(40자)로 자른다. */
export function toPick(b: Pick<Branch, 'id' | 'store' | 'branch'>, date: string, th: ServerTheme, s: ServerSession): PickedSession {
  return {
    key: `${b.id}::${date}::${th.id}::${s.id}`,
    date,
    themeName: clip(th.name, 40),
    branchName: clip(branchLabel(b), 40),
    themeKey: th.id && cpLen(th.id) <= 80 ? th.id : null,
    t: s.t,
    dur: typeof th.dur === 'number' && th.dur > 0 ? th.dur : null,
  };
}

/* 고른 회차 → 구간 칸. 소요 시간을 모르면 끝은 비운다 — 틀리게 채우느니 안 채운다 */
export const segFromPick = (p: PickedSession): FormSeg => ({
  themeName: p.themeName, branchName: p.branchName, themeKey: p.themeKey,
  start: fmt(p.t), end: p.dur ? fmt(p.t + p.dur) : '',
});

const isBlank = (g: FormSeg) => !(g.themeName.trim() || g.branchName.trim() || g.start.trim() || g.end.trim());

/* 구간 칸들의 시각을 분으로(자정 넘김 채움). 끝을 못 읽으면 끝 없이, 순서가 틀렸거나 시작을 못 읽으면 null */
export function segRanges(segs: FormSeg[]): TimeRow[] | null {
  const rows: TimeRow[] = [];
  for (const g of segs) {
    const start = parseClock24(g.start);
    if (start === null) return null;
    rows.push({ start, end: g.end.trim() ? parseClock24(g.end) : null });
  }
  const r = rollDays(rows);
  if ('rows' in r) return r.rows;
  const starts = rollDays(rows.map((x) => ({ start: x.start, end: null })));
  return 'rows' in starts ? starts.rows : null;
}

/* 겹침 — 끝이 없으면 그 시각 한 점으로 본다 */
export function overlaps(a: TimeRow, b: TimeRow): boolean {
  const ae = a.end ?? a.start + 1, be = b.end ?? b.start + 1;
  return a.start < be && b.start < ae;
}

/* 카드 한 장의 소요 시간과 다음날 여부. 전체 순서로 자정 넘김을 채우고, 순서가 틀렸으면 그 카드만 본다 */
export function segMeta(segs: FormSeg[]): { dur: number | null; next: boolean }[] {
  const all = segs.every((g) => parseClock24(g.start) !== null) ? segRanges(segs) : null;
  return segs.map((g, i) => {
    if (all) {
      const r = all[i];
      const end = g.end.trim() && parseClock24(g.end) !== null ? r.end : null;
      return { dur: end === null ? null : end - r.start, next: r.start >= 1440 || (end ?? 0) >= 1440 };
    }
    const s = parseClock24(g.start), e = g.end.trim() ? parseClock24(g.end) : null;
    if (s === null || e === null) return { dur: null, next: false };
    const r = rollDays([{ start: s, end: e }]);
    if (!('rows' in r)) return { dur: null, next: false };
    const end = r.rows[0].end as number;
    return { dur: end - s, next: end >= 1440 };
  });
}

/* 남은 자리 — 완전히 빈 카드는 세지 않는다(찾아서 넣을 때 빈 카드는 치운다) */
export const roomLeft = (segs: FormSeg[]): number => MAX_SEGS - segs.filter((g) => !isBlank(g)).length;

const mdLabel = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

/* 고른 회차를 구간에 합친다.
   - 완전히 빈 카드는 치우고, 시작 시각 순으로 세운다(이미 있는 구간은 자정 넘김을 채운 분, 회차는 t). 이미 있는 구간을 못 읽으면 뒤에 붙인다.
   - 날짜 정하기: 찾은 날짜가 일정 날짜와 다르면 일정 날짜를 그 날로 바꾸고 알린다.
   - 구간이 회차뿐이고 첫 회차가 다음날(1440 이상)이면 날짜를 하루 뒤로 — 결과 카드에서 일정으로 만들 때(formFromSteps)와 같은 규칙.
   - 후보 여러 개: 후보·날짜 칸은 그대로 두고, 다음날 회차만 있을 때 같은 표시(dateMoved)만 한다. */
export function mergePicks(f: FormState, picks: PickedSession[], date: string): { form: FormState; note: string } {
  const kept = f.segs.filter((g) => !isBlank(g));
  const add = [...picks].sort((a, b) => a.t - b.t).slice(0, Math.max(0, MAX_SEGS - kept.length));
  if (add.length === 0) return { form: f, note: '' };
  const ranges = kept.length > 0 ? segRanges(kept) : [];
  const segs = ranges
    ? [...kept.map((g, i) => ({ g, at: ranges[i].start })), ...add.map((p) => ({ g: segFromPick(p), at: p.t }))]
      .sort((a, b) => a.at - b.at).map((x) => x.g)
    : [...kept, ...add.map(segFromPick)];
  const onlyPicks = kept.length === 0;
  const nextDay = onlyPicks && add[0].t >= 1440;
  const form: FormState = { ...f, segs, allDay: false };
  let note = '';
  if (f.dateMode === 'fixed') {
    if (date !== f.date) note = `일정 날짜를 ${mdLabel(date)} 로 맞췄어요.`;
    if (date !== f.date || onlyPicks) Object.assign(form, { date, dateMoved: false, origDate: undefined });
  } else if (onlyPicks) {
    Object.assign(form, { dateMoved: false, origDate: undefined });
  }
  if (nextDay) Object.assign(form, { date: addDays(date, 1), dateMoved: true, origDate: date });
  return { form, note };
}

/* 내가 해 본 테마인가 — 키가 같거나, 한쪽에 키가 없으면 이름이 같을 때(서버 판정과 같게, §4.9) */
export function playedByMe(th: Pick<ServerTheme, 'id' | 'name'>, mine: PlayedDto[]): boolean {
  const name = normalizeName(th.name);
  return mine.some((p) => (p.themeKey && th.id ? p.themeKey === th.id : normalizeName(p.themeName) === name));
}

/* 지점 찾기 — 매장·지점 이름 부분 일치(공백·대소문자 무시). 그날 시간표가 있는 지점을 먼저 */
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export function filterBranches(list: Branch[], q: string, date: string): Branch[] {
  const needle = squash(q);
  const hit = needle ? list.filter((b) => squash(branchLabel(b)).includes(needle)) : list;
  const has = (b: Branch) => (b.dates ?? []).includes(date);
  return [...hit.filter(has), ...hit.filter((b) => !has(b))];
}
