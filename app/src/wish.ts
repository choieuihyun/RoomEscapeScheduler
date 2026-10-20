/* 같이 갈 사람 찾기(작업명세서 §4.12) — 화면 규칙을 순수 함수로. 지연 청크(같이 가요 화면·하고 싶어요 단추)만 쓴다. */
import { cpLen, sortKeyDate } from './clubEvents';
import { emptyForm, type FormState } from './eventForm';
import { normalizeName } from './played';
import { regionOf, type RegionPick } from './regions';
import type { EventDto, WishGroupDto } from './server';

export type WishRef = { themeKey: string | null; themeName: string; branchName?: string | null };

/* 같은 테마인가 — 해 본 테마(§4.9)와 같은 규칙: 둘 다 키가 있으면 키, 한쪽이라도 없으면 정리한 이름 */
export function sameTheme(a: WishRef, b: WishRef): boolean {
  return a.themeKey && b.themeKey ? a.themeKey === b.themeKey : normalizeName(a.themeName) === normalizeName(b.themeName);
}

/* 단추 하나를 가리키는 열쇠(누르는 중 표시) — 키가 없으면 정리한 이름 */
export const wishKey = (r: WishRef): string => r.themeKey || '~' + normalizeName(r.themeName);

/* 매장·지점 한 줄. 지점 칸에 이미 매장 이름이 들어 있으면(일정 구간·직접 적기의 "키이스케이프 강남점") 다시 붙이지 않는다 */
export function placeLabel(r: { storeName?: string | null; branchName?: string | null }): string {
  const s = (r.storeName ?? '').trim(), b = (r.branchName ?? '').trim();
  if (!s) return b;
  if (!b || b.startsWith(s)) return b || s;
  return `${s} ${b}`;
}

export type WishPick = 'all' | 'two' | 'mine';
export const WISH_PICKS: { id: WishPick; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'two', label: '2명 이상' }, { id: 'mine', label: '내가 원하는 것' },
];

const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const regionOfGroup = (g: WishGroupDto) => regionOf(g.storeName ?? '', g.branchName ?? '');

export const isMine = (g: WishGroupDto, meUid: string): boolean => g.wanters.some((w) => w.uid === meUid);

export function inPick(g: WishGroupDto, pick: WishPick, meUid: string): boolean {
  return pick === 'all' || (pick === 'two' ? g.wanters.length >= 2 : isMine(g, meUid));
}

/* 고른 칩·찾기 글자(테마·매장·지점·원하는 사람 별명)·지역으로 거른다. 순서는 서버가 세운 그대로(많은 순 → 최근 순) */
export function filterGroups(list: WishGroupDto[], o: { pick: WishPick; q: string; region: RegionPick; meUid: string }): WishGroupDto[] {
  const needle = squash(o.q);
  return list.filter((g) => inPick(g, o.pick, o.meUid)
    && (o.region === '전체' || regionOfGroup(g) === o.region)
    && (!needle || squash(`${g.themeName} ${g.storeName ?? ''} ${g.branchName ?? ''} ${g.wanters.map((w) => w.nickname).join(' ')}`).includes(needle)));
}

/* 원하는 사람 칩 — 나는 맨 앞에 "나"로, 나머지는 받은 순서(오래된 순) */
export function wanterChips(g: WishGroupDto, meUid: string): { uid: string; name: string; me: boolean }[] {
  const me = g.wanters.filter((w) => w.uid === meUid).map((w) => ({ uid: w.uid, name: '나', me: true }));
  return [...me, ...g.wanters.filter((w) => w.uid !== meUid).map((w) => ({ uid: w.uid, name: w.nickname, me: false }))];
}

/* 이 테마가 든 다가오는 일정 — 앱이 받아 둔 목록에서. 날짜(미정이면 오늘 이후 가장 이른 후보)가 오늘 이후인 것 중 가장 이른 것 */
export function upcomingWith(g: WishRef, events: EventDto[], today: string): { ev: EventDto; date: string } | null {
  let best: { ev: EventDto; date: string } | null = null;
  for (const ev of events) {
    if (!ev.segments.some((s) => sameTheme(s, g))) continue;
    const date = sortKeyDate(ev, today);
    if (date < today) continue;
    if (!best || date < best.date || (date === best.date && ev.id < best.ev.id)) best = { ev, date };
  }
  return best;
}

const clip = (s: string, n: number) => (cpLen(s) <= n ? s : [...s].slice(0, n).join(''));

/* "이 사람들과 일정 만들기" — 제목 "{테마} 같이 가요", 테마 구간 하나(시각은 비움), 후보 날짜 모드.
   참여자는 넣지 않는다(각자 참여). 구간의 지점 칸은 일정 구간과 같은 "매장 지점"(40자) */
export function wishForm(g: WishRef & { storeName?: string | null }, today: string): FormState {
  const name = clip(g.themeName.trim(), 40);
  return {
    ...emptyForm(today),
    title: clip(`${name} 같이 가요`, 60),
    allDay: false,
    dateMode: 'candidates',
    segs: [{ themeName: name, branchName: clip(placeLabel(g), 40), themeKey: g.themeKey && cpLen(g.themeKey) <= 80 ? g.themeKey : null, start: '', end: '' }],
  };
}
