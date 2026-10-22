/* 멤버 프로필·멤버 목록·랭킹의 화면 규칙 — 순수 함수 (작업명세서 §4.11).
   지연 청크 전용이다(가입 창·프로필 창·멤버 목록·랭킹·더보기·내 정보만 가져다 쓴다). 진입 청크 파일에서 가져오지 않는다 —
   가져오면 이 파일 전체가 진입에 붙는다. 진입에서 필요한 판정은 profileGate.ts. */
import type { ClubMemberDto, Genre, LifeTheme, Mbti, ProfileDto, RankMonthDto, ThemeRef } from './server';

/* 계약 순서 그대로. 빼면 그 장르를 저장한 사람이 다시 저장할 때 400 이 난다(§4.11 "장르 목록 바꾸기") */
export const GENRES: readonly Genre[] = ['공포', '스릴러', '추리', '미스터리', '감성', '드라마', '코믹', '판타지', 'SF', '어드벤처', '잠입', '액션', '기타'];
export const GENRE_MAX = 5;

/* 4×4 — 계약에 적힌 순서(흔히 보는 16유형 표) 그대로 네 개씩 */
export const MBTI_ROWS: readonly (readonly Mbti[])[] = [
  ['ISTJ', 'ISFJ', 'INFJ', 'INTJ'],
  ['ISTP', 'ISFP', 'INFP', 'INTP'],
  ['ESTP', 'ESFP', 'ENFP', 'ENTP'],
  ['ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'],
];
export const mbtiLabel = (m: Mbti): string => (m === 'UNKNOWN' ? '잘 몰라요' : m);

export const NAME_MAX = 20;      // 별명·이름(코드 포인트)
export const THEME_MAX = 40;     // 인생 테마 이름·매장
export const ROOM_MAX = 9999;
export const RESIDENCE_MAX = 20; // 거주지역(코드 포인트, 앞뒤 공백 지운 뒤)
export const BIRTH_MIN = '1940-01-01';

const cp = (s: string) => [...s].length;
const clip = (s: string, n: number) => [...s.trim()].slice(0, n).join('');

/* ── 생일 ── */

/* 숫자만 쳐도 점이 들어간다: 1997 → 1997, 19970 → 1997.0, 199706 → 1997.06, 19970628 → 1997.06.28.
   숫자 말고는 버리고 8자리에서 자른다 — 1997-06-28 을 붙여 넣어도, 점을 지워도 같은 모양이 된다. */
export function maskBirth(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}

export type BirthCheck = { ok: true; iso: string } | { ok: false; why: 'empty' | 'partial' | 'invalid' | 'range' };

/* 1997.06.28 → 1997-06-28. 다 안 쳤으면 partial, 없는 날짜(2월 30일 등)면 invalid, 1940-01-01 ~ 오늘(KST) 밖이면 range */
export function checkBirth(masked: string, today: string): BirthCheck {
  const d = masked.replace(/\D/g, '');
  if (!d) return { ok: false, why: 'empty' };
  if (d.length < 8) return { ok: false, why: 'partial' };
  const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6, 8);
  /* 1940 전 해(0001 같은 아주 작은 해 포함)는 범위 문구로 — Date.UTC 는 0~99 년을 1900 년대로 읽어 "없는 날짜"가 됐다 */
  if (y < +BIRTH_MIN.slice(0, 4)) return { ok: false, why: 'range' };
  const t = new Date(Date.UTC(y, m - 1, day));
  if (m < 1 || m > 12 || t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== day) return { ok: false, why: 'invalid' };
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (iso < BIRTH_MIN || iso > today) return { ok: false, why: 'range' };
  return { ok: true, iso };
}

export const BIRTH_ERR: Record<'empty' | 'partial' | 'invalid' | 'range', string> = {
  empty: '생일을 적어 주세요.',
  partial: '1997.06.28 처럼 여덟 자리로 적어 주세요.',
  invalid: '없는 날짜예요.',
  range: '1940년부터 오늘까지의 날짜만 돼요.',
};

/* 1997-06-28 → 1997.06.28 (폼에 다시 채울 때) */
export const birthDots = (iso: string): string => iso.replaceAll('-', '.');

/* 나이 표기 — "만 29세" 대신 "97년생"(2026-10-21 사용자 결정, §4.11). 태어난 해 끝 두 자리 + "년생"(2000 → "00년생") */
export const yearLabel = (birth: string): string => `${birth.slice(2, 4)}년생`;

/* 방 수 "312방" · "1,234방"(방탈출에서 세는 말 — 2026-10-22 사용자 요청, 전엔 "방 312개") */
export const roomsLabel = (n: number): string => `${n.toLocaleString('ko-KR')}방`;

/* 생일 표시 — 계약의 "월.일", 입력 칸(1997.06.28)과 같은 모양으로 "06.28" */
export const birthLabel = (iso: string): string => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;

/* ── 장르 ── */

/* 누르면 넣거나 뺀다. 이미 다섯 개인데 하나 더 누르면 그대로 두고 blocked — 화면이 안내한다 */
export function toggleGenre(list: readonly Genre[], g: Genre): { list: Genre[]; blocked: boolean } {
  if (list.includes(g)) return { list: list.filter((x) => x !== g), blocked: false };
  if (list.length >= GENRE_MAX) return { list: [...list], blocked: true };
  return { list: [...list, g], blocked: false };
}

/* ── 방 수 ── 숫자만, 앞의 0 은 떼고, 9999 넘으면 자른다(칸에 그대로 보인다) */
export function cleanRooms(input: string): string {
  const d = input.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 4);
  return d;
}

/* ── 인생 테마 ── */

const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
/* 서버의 이름 정리(글자·숫자만 남김) 뒤 비면 BAD_PROFILE — 미리 막는다 */
const hasLetters = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').length > 0;

/* 서버 테마 목록에서 이름·매장·지점 부분 일치, 최대 20개(해 본 테마 찾기와 같은 규칙) */
export function searchLife(all: readonly ThemeRef[], q: string): ThemeRef[] {
  const needle = squash(q);
  if (!needle) return [];
  const out: ThemeRef[] = [];
  for (const ref of all) {
    if (!squash(`${ref.themeName} ${ref.storeName} ${ref.branchName}`).includes(needle)) continue;
    out.push(ref);
    if (out.length >= 20) break;
  }
  return out;
}

/* 찾아서 고른 테마 → 저장 모양. 매장 칸에는 "매장 지점"을 40자로(일정 구간의 지점 칸과 같은 규칙) —
   멤버 목록에서 테마 목록을 다시 받지 않고 "인생 테마: 메모리컴퍼니 (키이스케이프 강남점)"으로 보이게 */
export function lifeFromRef(ref: ThemeRef): LifeTheme {
  const where = ref.storeName ? `${ref.storeName} ${ref.branchName}` : ref.branchName;
  return { themeName: clip(ref.themeName, THEME_MAX), branchName: clip(where, THEME_MAX) || null, themeKey: cp(ref.themeKey) <= 80 ? ref.themeKey : null };
}

/* 직접 적은 테마 — 키 없음, 매장은 비면 null */
export const lifeManual = (name: string, branch: string): LifeTheme =>
  ({ themeName: name.trim(), branchName: branch.trim() || null, themeKey: null });

export const lifeLabel = (t: LifeTheme): string => (t.branchName ? `${t.themeName} (${t.branchName})` : t.themeName);

/* ── 폼 ── */

export interface Draft {
  nickname: string;
  realName: string;
  birth: string;     // 화면 칸 그대로(1997.06.28)
  mbti: Mbti | null;
  rooms: string;     // 화면 칸 그대로(숫자만)
  genres: Genre[];
  life: LifeTheme | null;
  residence: string; // 화면 칸 그대로
}
export type Field = 'nickname' | 'realName' | 'birth' | 'residence' | 'mbti' | 'rooms' | 'genres' | 'life';
export const FIELDS: readonly Field[] = ['nickname', 'realName', 'birth', 'residence', 'mbti', 'rooms', 'genres', 'life'];

export const emptyDraft = (nickname = ''): Draft =>
  ({ nickname, realName: '', birth: '', mbti: null, rooms: '', genres: [], life: null, residence: '' });

/* 이미 있는 프로필로 폼을 채운다(고치기·거절 뒤 다시 신청) */
export const draftFrom = (nickname: string | null, p: ProfileDto | null | undefined): Draft => (p ? {
  nickname: nickname ?? '', realName: p.realName, birth: birthDots(p.birthDate), mbti: p.mbti,
  rooms: String(p.roomCount), genres: [...p.genres], life: p.lifeTheme, residence: p.residence ?? '',
} : emptyDraft(nickname ?? ''));

/* 칸마다 틀린 까닭(맞으면 없음). 전부 필수(사용자 결정) */
export function draftIssues(d: Draft, today: string): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  const nick = cp(d.nickname.trim());
  if (nick === 0) out.nickname = '별명을 적어 주세요.';
  else if (nick > NAME_MAX) out.nickname = `별명은 ${NAME_MAX}자까지예요 (지금 ${nick}자).`;
  const name = cp(d.realName.trim());
  if (name === 0) out.realName = '이름을 적어 주세요.';
  else if (name > NAME_MAX) out.realName = `이름은 ${NAME_MAX}자까지예요 (지금 ${name}자).`;
  const b = checkBirth(d.birth, today);
  if (!b.ok) out.birth = BIRTH_ERR[b.why];
  /* 거주지역 — 서버는 선택이지만 화면은 필수(§4.11). 이미 있는 프로필이 null 이어도 고칠 때는 채워야 저장된다 */
  const res = cp(d.residence.trim());
  if (res === 0) out.residence = '거주지역을 적어 주세요. 예: 서울 마포구';
  else if (res > RESIDENCE_MAX) out.residence = `거주지역은 ${RESIDENCE_MAX}자까지예요 (지금 ${res}자).`;
  if (!d.mbti) out.mbti = 'MBTI 를 골라 주세요. 모르면 "잘 몰라요"를 골라 주세요.';
  if (d.rooms === '') out.rooms = '지금까지 한 방 수를 적어 주세요. 처음이면 0 이에요.';
  else if (+d.rooms > ROOM_MAX) out.rooms = `${ROOM_MAX}개까지 적을 수 있어요.`;
  if (d.genres.length === 0) out.genres = '좋아하는 장르를 하나 이상 골라 주세요.';
  if (!d.life) out.life = '인생 테마를 하나 골라 주세요.';
  else if (!hasLetters(d.life.themeName)) out.life = '테마 이름을 글자로 적어 주세요.';
  else if (cp(d.life.themeName) > THEME_MAX) out.life = `테마 이름은 ${THEME_MAX}자까지예요.`;
  else if (cp(d.life.branchName ?? '') > THEME_MAX) out.life = `매장·지점은 ${THEME_MAX}자까지예요.`;
  return out;
}

/* 다 맞으면 보낼 모양, 아니면 null */
export function toProfile(d: Draft, today: string): { nickname: string; profile: ProfileDto } | null {
  if (Object.keys(draftIssues(d, today)).length > 0) return null;
  const b = checkBirth(d.birth, today);
  if (!b.ok || !d.mbti || !d.life) return null;
  return {
    nickname: d.nickname.trim(),
    profile: { realName: d.realName.trim(), birthDate: b.iso, mbti: d.mbti, roomCount: +d.rooms, genres: [...d.genres], lifeTheme: d.life, residence: d.residence.trim() },
  };
}

/* ── 멤버 목록 ── */

export type PeopleSort = 'name' | 'rooms';

/* 별명·이름 부분 일치(공백·대소문자 무시) */
export function matchPerson(m: Pick<ClubMemberDto, 'nickname' | 'profile'>, q: string): boolean {
  const needle = squash(q);
  return !needle || squash(m.nickname).includes(needle) || squash(m.profile?.realName ?? '').includes(needle);
}

const byName = (a: ClubMemberDto, b: ClubMemberDto) => a.nickname.localeCompare(b.nickname, 'ko');

/* 내 카드는 늘 맨 위. 나머지는 가나다(별명) 또는 방 수 많은 순(같으면 가나다, 프로필 없는 사람은 뒤) */
export function sortPeople(list: readonly ClubMemberDto[], sort: PeopleSort, meUid: string): ClubMemberDto[] {
  const rooms = (m: ClubMemberDto) => m.profile?.roomCount ?? -1;
  const rest = list.filter((m) => m.uid !== meUid)
    .sort(sort === 'rooms' ? (a, b) => rooms(b) - rooms(a) || byName(a, b) : byName);
  const me = list.filter((m) => m.uid === meUid);
  return [...me, ...rest];
}

/* 둘째 줄 "97년생 · ENFP · 312방 · 서울 마포구"(거주지역이 없으면 그 칸 없이) */
export const personLine = (p: ProfileDto): string =>
  `${yearLabel(p.birthDate)} · ${mbtiLabel(p.mbti)} · ${roomsLabel(p.roomCount)}${p.residence ? ` · ${p.residence}` : ''}`;

/* ── 랭킹 ── */

export const RANK_STEP = 3;      // 처음·더 보기마다 3달
export const RANK_SPAN_MAX = 12; // 서버가 한 번에 받는 달 수

/* YYYY-MM 에 n 달 더하기(빼기) */
export function addMonths(ym: string, n: number): string {
  const i = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
/* 받은 달이 모두 비었나(기록 없는 달만, 또는 하나도 안 옴) — 더 보기로 받은 3달이 이러면 더 옛날은 묻지 않는다 */
export const allEmpty = (got: RankMonthDto[]): boolean => got.every((m) => m.ranks.length === 0);
export const monthsBetween = (from: string, to: string): number =>
  (+to.slice(0, 4) * 12 + +to.slice(5, 7)) - (+from.slice(0, 4) * 12 + +from.slice(5, 7)) + 1;

/* 처음: 이번 달(KST)을 포함한 최근 3달 */
export const firstRange = (today: string): { from: string; to: string } =>
  ({ from: addMonths(today.slice(0, 7), 1 - RANK_STEP), to: today.slice(0, 7) });

/* 더 보기: 지금 받아 둔 가장 오래된 달 바로 앞 3달 — 한 번에 12달을 넘지 않는다 */
export function olderRange(oldest: string): { from: string; to: string } {
  const to = addMonths(oldest, -1);
  return { from: addMonths(to, 1 - Math.min(RANK_STEP, RANK_SPAN_MAX)), to };
}

/* 받은 달을 합친다 — 같은 달은 새것, 최신 달 먼저. 범위 안에 서버가 빠뜨린 달이 있으면 빈 달로 채운다(기록 없는 달도 카드가 있게) */
export function mergeMonths(had: readonly RankMonthDto[], got: readonly RankMonthDto[], range: { from: string; to: string }): RankMonthDto[] {
  const map = new Map(had.map((m) => [m.month, m]));
  for (const m of got) map.set(m.month, m);
  for (let ym = range.to; ym >= range.from; ym = addMonths(ym, -1)) if (!map.has(ym)) map.set(ym, { month: ym, ranks: [] });
  return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

/* "2026년 10월" */
export const monthLabel = (ym: string): string => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;

/* 순위 순(같은 순위는 서버 순서 = 가나다). 5등 밖은 서버가 안 주지만 혹시 와도 뺀다 */
export const topRanks = (m: RankMonthDto): RankMonthDto['ranks'] =>
  m.ranks.filter((r) => r.rank <= 5).sort((a, b) => a.rank - b.rank);
