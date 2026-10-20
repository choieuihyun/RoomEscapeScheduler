/* 해 본 사람을 이름으로 — 도우미 테마 줄·일정 상세 구간의 "이름 + 색 점", 홈·캘린더 칩의 짧은 글.
   played.ts 와 따로 둔 까닭은 playedView.ts 와 같다(진입 청크에 붙지 않게). */
import type { EventDto } from './server';

export type WhoDot = { uid: string; name: string; played: boolean };

/* 참여자 전원을 참여 순서 그대로, 해 봤는지와 함께. 참여자가 없으면 빈 배열(아무것도 안 그린다) */
export function playedDots(playedBy: readonly string[] | undefined, people: EventDto['participants']): WhoDot[] {
  const by = new Set(playedBy ?? []);
  return people.map((p) => ({ uid: p.uid, name: p.nickname, played: by.has(p.uid) }));
}

/* 이 일정 테마를 하나라도 해 본 참여자 이름 — 참여 순서, 구간이 겹쳐도 한 번 */
export function playedWho(ev: Pick<EventDto, 'segments' | 'participants'>): string[] {
  const by = new Set<string>();
  for (const s of ev.segments) for (const u of s.playedBy ?? []) by.add(u);
  return ev.participants.filter((p) => by.has(p.uid)).map((p) => p.nickname);
}

/* 좁은 줄의 칩 글 — 둘까지는 이름, 셋부터 "철수 외 2명". 없으면 '' */
export function playedWhoLabel(names: readonly string[]): string {
  if (names.length === 0) return '';
  return (names.length <= 2 ? names.join(', ') : `${names[0]} 외 ${names.length - 1}명`) + ' 해 봄';
}

/* 칩에 다 못 쓴 이름은 title 로 */
export const playedWhoTitle = (names: readonly string[]): string => (names.length ? `해 본 사람: ${names.join(', ')}` : '');
