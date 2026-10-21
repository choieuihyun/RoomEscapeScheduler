/* 테마 고르기 창(ThemePicker)의 순수 함수 — 일정 만들기의 "테마 찾아서 넣기"(회차 고르기)와
   시간표 계산의 "테마 불러오기"(테마째 고르기)가 같이 쓴다. 회차를 구간으로 바꾸고 이미 있는 구간과 합치는 것,
   고른 테마를 계산 카드로 바꾸는 것, 지점 찾기·지역. 고르기 창(지연 청크)만 쓴다 — eventForm.ts 는 진입 번들이라 여기에 둔다. */
import { fmt } from './core';
import { addDays, cpLen, parseClock24, rollDays, type TimeRow } from './clubEvents';
import { MAX_SEGS, type FormSeg, type FormState } from './eventForm';
import { normalizeName } from './played';
import { regionCounts, regionOf, type Region, type RegionPick } from './regions';
import { ago, toSessions, type Branch, type PlayedDto, type ServerSession, type ServerTheme } from './server';
import type { AddedTheme } from './scheduler/types';

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
const DAY = 1440;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export const SAME_NIGHT = '같은 날 밤까지의 회차만 넣을 수 있어요.';
const EVENING = '자정을 넘기는 일정은 저녁 6시 이후에 시작할 때만 이어서 넣을 수 있어요.';
const UNREAD = (n: number) => `${n}번째 테마의 시각을 먼저 확인해 주세요.`;

interface Item { g: FormSeg; start: number; end: number | null; late: boolean }

/* 이미 넣은 구간을 절대 분으로 — toInput 과 같은 해석.
   날짜 정하기: 일정 날짜(1970-01-01 부터 일수 × 1440) + 자정 넘김을 채운 분.
   후보 여러 개: 날짜가 없으니 "후보 날" 기준. 옮겨 둔 표시(dateMoved)가 있고 첫 시각이 06시 전이면 +1440(toInput 의 보정).
   late = 전날 밤 회차로 들어온 첫 구간(옮겨 둔 표시가 가리키는 것). 시각을 못 읽거나 순서가 틀렸으면 그 번호(1부터) */
function placedAbs(f: FormState, fallbackDate: string): Item[] | number {
  const kept = f.segs.filter((g) => !isBlank(g));
  const rows: TimeRow[] = [];
  for (const [i, g] of kept.entries()) {
    const start = parseClock24(g.start);
    const end = g.end.trim() ? parseClock24(g.end) : null;
    if (start === null || (g.end.trim() && end === null)) return i + 1;
    rows.push({ start, end });
  }
  if (rows.length === 0) return [];
  const r = rollDays(rows);
  if (!('rows' in r)) return r.index + 1;
  const late = f.dateMoved && r.rows[0].start < 6 * 60;
  const off = f.dateMode === 'candidates' ? (late ? DAY : 0) : dayNum(f.date || fallbackDate) * DAY;
  return kept.map((g, i) => ({
    g, start: r.rows[i].start + off, end: r.rows[i].end === null ? null : (r.rows[i].end as number) + off, late: i === 0 && late,
  }));
}

/* 찾기 창의 겹침 표시용 — 이미 넣은 구간을 보고 있는 날짜(date) 기준 분으로. 후보 여러 개는 후보 날 기준 그대로 */
export function placedOn(f: FormState, date: string): TimeRow[] {
  const items = placedAbs(f, date);
  if (typeof items === 'number') return [];
  const off = f.dateMode === 'candidates' ? 0 : dayNum(date) * DAY;
  return items.map((x) => ({ start: x.start - off, end: x.end === null ? null : x.end - off }));
}

/* 고른 회차를 구간에 합친다 — 이미 있는 구간과 회차를 모두 절대 시각으로 바꿔 합치고 시작 순으로 세운 뒤,
   가장 이른 구간의 날짜를 일정 날짜로 다시 정하고 칸 글자를 새로 만든다(같은 순간이 그대로 저장된다).
   - 완전히 빈 카드는 치운다. 이미 있는 구간의 시각을 못 읽으면 넣지 않고 그 번호를 알린다.
   - 첫 구간이 전날 밤 회차(다음날 00:30 처럼 1440 이상으로 온 것)면 결과 카드에서 올릴 때(formFromSteps)처럼 그 날짜에 두고 "옮김" 표시 —
     날짜 정하기는 날짜 칸이 그 날, 후보 여러 개는 toInput 이 1440 을 더해 보낸다.
   - 첫 구간에서 24시간 안(§4.7 범위)이 아니거나, 18시 전에 시작해 자정을 넘으면 넣지 않는다.
   - 날짜 정하기에서 일정 날짜가 바뀌면 실제 날짜로 한 번 알린다(옮김 안내는 이 안내가 대신한다). */
export function mergePicks(f: FormState, picks: PickedSession[], date: string): { form: FormState; note: string; error?: string } {
  const placed = placedAbs(f, date);
  if (typeof placed === 'number') return { form: f, note: '', error: UNREAD(placed) };
  const add = [...picks].sort((a, b) => a.t - b.t).slice(0, Math.max(0, MAX_SEGS - placed.length));
  if (add.length === 0) return { form: f, note: '' };
  const cand = f.dateMode === 'candidates';
  const base = cand ? 0 : dayNum(date) * DAY;
  const all: Item[] = [
    ...placed,
    ...add.map((p) => ({ g: segFromPick(p), start: base + p.t, end: p.dur ? base + p.t + p.dur : null, late: p.t >= DAY })),
  ].sort((a, b) => a.start - b.start);

  const day0 = Math.floor(all[0].start / DAY);
  const shift = day0 * DAY;
  const first = all[0].start - shift;
  /* 후보 여러 개는 "후보 날 / 그 다음날 06시 전" 두 가지만 나타낼 수 있다(toInput 보정) */
  if (cand && (day0 < 0 || day0 > 1 || (day0 === 1 && first >= 6 * 60))) return { form: f, note: '', error: SAME_NIGHT };
  if (all.some((x) => x.start - shift >= first + DAY || (x.end !== null && x.end - shift >= first + DAY))) return { form: f, note: '', error: SAME_NIGHT };

  const segs = all.map((x) => ({ ...x.g, start: fmt(x.start - shift), end: x.end === null ? '' : fmt(x.end - shift) }));
  /* 칸 글자를 toInput 처럼 다시 읽어 같은 분이 나오는지. 걸리는 경우는 둘이다 —
     모두 다음날 06시 전 안이면 18시 전에 시작해 자정을 넘긴 것(저녁 6시 안내),
     아니면 22:00 구간 뒤 다음날 13:00 처럼 같은 밤을 벗어난 것(같은 날 밤 안내) */
  const back = rollDays(segs.map((g) => ({ start: parseClock24(g.start) as number, end: g.end ? parseClock24(g.end) : null })));
  if (!('rows' in back)) {
    const night = all.every((x) => x.start - shift < DAY + 6 * 60 && (x.end === null || x.end - shift <= DAY + 6 * 60));
    return { form: f, note: '', error: night ? EVENING : SAME_NIGHT };
  }
  if (back.rows.some((r, i) => r.start !== all[i].start - shift || r.end !== (all[i].end === null ? null : (all[i].end as number) - shift))) {
    return { form: f, note: '', error: SAME_NIGHT };
  }

  const moved = all[0].late && first < 6 * 60;
  const form: FormState = { ...f, segs, allDay: false };
  let note = '';
  if (!cand) {
    const d = isoOf(day0);
    Object.assign(form, { date: d, dateMoved: moved, origDate: moved ? isoOf(day0 - 1) : undefined });
    if (d !== f.date) note = moved ? `자정이 지난 회차라 일정 날짜를 ${mdLabel(d)} 로 맞췄어요.` : `일정 날짜를 ${mdLabel(d)} 로 맞췄어요.`;
  } else if (moved) {
    /* 날짜 칸(후보 모드에선 안 보임)은 날짜 정하기로 돌아갈 때 쓴다 — 옮긴 날로 */
    Object.assign(form, f.dateMoved ? {} : { date: addDays(date, 1), dateMoved: true, origDate: date });
  } else {
    Object.assign(form, { date: f.dateMoved && f.origDate ? f.origDate : f.date, dateMoved: false, origDate: undefined });
  }
  return { form, note };
}

/* 내가 해 본 테마인가 — 키가 같거나, 한쪽에 키가 없으면 이름이 같을 때(서버 판정과 같게, §4.9) */
export function playedByMe(th: Pick<ServerTheme, 'id' | 'name'>, mine: PlayedDto[]): boolean {
  const name = normalizeName(th.name);
  return mine.some((p) => (p.themeKey && th.id ? p.themeKey === th.id : normalizeName(p.themeName) === name));
}

/* 지점 찾기 — 매장·지점 이름 부분 일치(공백·대소문자 무시)와 지역. 그날 시간표가 있는 지점을 먼저 */
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const branchRegion = (b: Branch): Region => regionOf(b.store, b.branch, b.id); // 지점 id 로 서버 지역을 먼저 찾는다
export function filterBranches(list: Branch[], q: string, date: string, region: RegionPick = '전체'): Branch[] {
  const needle = squash(q);
  const hit = list.filter((b) => (!needle || squash(branchLabel(b)).includes(needle)) && (region === '전체' || branchRegion(b) === region));
  const has = (b: Branch) => (b.dates ?? []).includes(date);
  return [...hit.filter(has), ...hit.filter((b) => !has(b))];
}

/* 지점 목록에 실제로 있는 지역만, 지역 순서대로 — 지역 칩 */
export const branchRegions = (list: Branch[]): Region[] =>
  regionCounts(list.map((b) => ({ storeName: b.store, branchName: b.branch, themeKey: b.id }))).map((x) => x.region);

/* ── 테마째 고르기(시간표 계산의 테마 불러오기) ── */

/* 고른 테마 하나 — 지점·날짜·테마 id 로 기억해야 지점·날짜를 넘나들어도 남는다(서버가 주는 테마 id 는 안정적이다) */
export interface PickedTheme {
  key: string;
  date: string;
  branchName: string;
  theme: ServerTheme;
  checkedAt: string | null;
}
export const themePickKey = (branchId: string, date: string, themeId: string): string => `${branchId}::${date}::${themeId}`;

/* 고른 테마 → 계산 카드. 회차는 전부(매진도 — 카드에 남고 계산에서 빠진다), 소요 시간을 모르면 70분(계산은 끝이 있어야 한다) */
export const toAdded = (p: PickedTheme): AddedTheme => ({
  name: p.theme.name, place: p.theme.place || '', dur: p.theme.dur || 70,
  sessions: toSessions(p.theme.sessions), fresh: ago(p.checkedAt), date: p.date, themeKey: p.theme.id,
});

/* 고르기·빼기 — 같은 키면 빼고 없으면 더한다. 다른 지점·날짜에서 고른 것은 그대로 */
export function togglePicked<T extends { key: string }>(m: Map<string, T>, p: T): Map<string, T> {
  const n = new Map(m);
  if (n.has(p.key)) n.delete(p.key); else n.set(p.key, p);
  return n;
}

/* 고른 것들의 날짜가 서로 다르면 그 날짜들(정렬) — 같은 날로 맞춰야 조합이 맞다(§4.41). 하나뿐이면 빈 목록 */
export function mixedDates(picks: Iterable<{ date: string }>): string[] {
  const ds = [...new Set([...picks].map((p) => p.date))].sort();
  return ds.length > 1 ? ds : [];
}

/* 인원이 맞는가 — 비었거나 숫자가 아니면 모두 맞는 것으로 */
export function fitsPeople(th: Pick<ServerTheme, 'minPeople' | 'maxPeople'>, people: string): boolean {
  const n = parseInt(people, 10);
  if (!n) return true;
  return (th.minPeople == null || n >= th.minPeople) && (th.maxPeople == null || n <= th.maxPeople);
}
