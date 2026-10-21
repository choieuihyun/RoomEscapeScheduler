/* 멤버 카드(어디서든 이름을 누르면)의 화면 규칙 — 순수 함수. 지연 청크 전용(카드·테스트만 가져다 쓴다).
   서버는 바꾸지 않았다 — 멤버 목록(§4.11)·남의 해 본 테마(§4.9)·위시 묶음(§4.12)·앱이 받아 둔 일정으로 만든다. */
import { sortKeyDate } from './clubEvents';
import { mbtiLabel, yearLabel } from './memberProfile';
import type { EventDto, ProfileDto, WishGroupDto } from './server';
import { placeLabel, wishKey } from './wish';

/* 프로필 줄 "97년생 · ENFP · 방 312개 · 서울 마포구" — 모르는 MBTI 는 카드에선 "MBTI 잘 몰라요"(멤버 목록의 "잘 몰라요"만으론 무엇을 모르는지 안 보인다) */
export const cardLine = (p: ProfileDto): string =>
  `${yearLabel(p.birthDate)} · ${p.mbti === 'UNKNOWN' ? 'MBTI 잘 몰라요' : mbtiLabel(p.mbti)} · 방 ${p.roomCount.toLocaleString('ko-KR')}개${p.residence ? ` · ${p.residence}` : ''}`;

/* 해 본 날 — 올해면 "10.12", 다른 해면 "2025.10.12", 없으면 '' */
export function playedDate(iso: string | null, today: string): string {
  if (!iso) return '';
  const md = `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? md : `${iso.slice(0, 4)}.${md}`;
}

/* 함께한 일정 — 받아 둔 일정(겹치면 한 번) 중 나와 그 사람이 둘 다 참여한 것.
   다가오는 것: 날짜가 오늘 이후이거나 날짜 미정(협의 중). 지난 것: 날짜가 오늘 전.
   recent: 다가오는 것 가까운 순 → 지난 것 최근 순으로 앞의 n개 */
export function togetherWith(lists: readonly (readonly EventDto[] | null | undefined)[], meUid: string, uid: string, today: string, n = 2):
  { upcoming: number; past: number; recent: EventDto[] } {
  const seen = new Set<number>();
  const both: EventDto[] = [];
  for (const list of lists) {
    for (const e of list ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.participants.some((p) => p.uid === meUid) && e.participants.some((p) => p.uid === uid)) both.push(e);
    }
  }
  const up = both.filter((e) => e.date === null || e.date >= today)
    .sort((a, b) => sortKeyDate(a, today).localeCompare(sortKeyDate(b, today)) || a.id - b.id);
  const past = both.filter((e) => e.date !== null && e.date < today)
    .sort((a, b) => (b.date as string).localeCompare(a.date as string) || b.id - a.id);
  return { upcoming: up.length, past: past.length, recent: [...up, ...past].slice(0, n) };
}

export type WishChip = { key: string; name: string; place: string; also: boolean };

/* 그 사람이 하고 싶은 테마 — 위시 묶음 중 wanters 에 그 uid 가 있는 것(서버 순서 = 원하는 사람 많은 순), 최대 max 개 + 나머지 수.
   also: 나도 그 테마를 원한다(내 카드가 아닐 때만) */
export function wishesOf(groups: readonly WishGroupDto[], uid: string, meUid: string, max = 6): { chips: WishChip[]; more: number } {
  const mine = groups.filter((g) => g.wanters.some((w) => w.uid === uid));
  return {
    chips: mine.slice(0, max).map((g) => ({
      key: wishKey(g), name: g.themeName, place: placeLabel(g), also: uid !== meUid && g.wanters.some((w) => w.uid === meUid),
    })),
    more: Math.max(0, mine.length - max),
  };
}
