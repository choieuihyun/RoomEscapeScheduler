/* 협의 도우미 "어떤 테마가 좋을까요?" — 지역 고르기·쪽 나누기를 순수 함수로.
   played.ts 는 진입 청크라(SchedulerPage 가 부른다) 도우미만 쓰는 코드는 여기 둔다 — 캘린더 지연 청크에만 붙는다. */

/* 고르는 순서 그대로 */
export const REGIONS = ['강남', '홍대', '건대', '부산', '대구', '대전', '수원', '김포', '용인', '기타'] as const;
export type Region = (typeof REGIONS)[number];

/* 지점 이름에 든 낱말로 안다. 위에서부터 먼저 걸린 것 */
const WORDS: [Region, string[]][] = [
  ['강남', ['강남', '역삼', '신논현']],
  ['홍대', ['홍대']],
  ['건대', ['건대']],
  ['부산', ['부산', '서면', '해운대']],
  ['대구', ['대구']],
  ['대전', ['대전']],
  ['수원', ['수원']],
  ['김포', ['김포']],
];

const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/* 이름만으로 모르는 지점 — "매장 지점" 을 붙여 공백을 뺀 것. 값만 고치면 된다.
   '기타' 로 둔 것은 사용자에게 아직 지역을 못 받은 지점이다(2026-10-20) */
const EXTRA: Record<string, Region> = {
  '키이스케이프에버랜드': '용인',
  '키이스케이프log_in1': '기타',
  '키이스케이프log_in2': '기타',
  '키이스케이프station': '기타',
  '키이스케이프더오름': '기타',
  '키이스케이프메모리컴퍼니': '기타',
  '키이스케이프우주라이크': '기타',
  '키이스케이프후즈데어': '기타',
  '다이아에그다이아에그': '기타',
  '다이아에그미스테리인': '기타',
};

export function regionOf(storeName: string, branchName: string): Region {
  const branch = squash(branchName ?? '');
  const extra = EXTRA[squash(storeName ?? '') + branch];
  if (extra) return extra;
  /* 지점 이름을 먼저 본다 — 매장 이름에 지역 낱말이 들어 있어도 지점이 이긴다 */
  for (const name of [branch, squash(storeName ?? '')]) {
    for (const [r, ws] of WORDS) if (ws.some((w) => name.includes(w))) return r;
  }
  return '기타';
}

type Placed = { storeName: string; branchName: string };

/* 결과에 실제로 있는 지역만, 지역 순서대로 개수와 함께 */
export function regionCounts(list: readonly Placed[]): { region: Region; n: number }[] {
  const m = new Map<Region, number>();
  for (const t of list) {
    const r = regionOf(t.storeName, t.branchName);
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return REGIONS.filter((r) => m.has(r)).map((r) => ({ region: r, n: m.get(r) as number }));
}

export type RegionPick = Region | '전체';

/* 고른 지역의 테마만 — 받은 순서("아무도 안 해 봄" 먼저)는 그대로 */
export const inRegion = <T extends Placed>(list: readonly T[], r: RegionPick): T[] =>
  r === '전체' ? [...list] : list.filter((t) => regionOf(t.storeName, t.branchName) === r);

export const PAGE_SIZE = 20;

/* page 는 0부터. 목록이 줄어 그 쪽이 없어졌으면 마지막 쪽으로 */
export function pageOf<T>(list: readonly T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pages: number; from: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: list.slice(p * size, p * size + size), page: p, pages, from: p * size };
}

/* 쪽 번호는 그 번호를 고른 목록(날짜·참여자·지역)에 묶는다 — 목록이 바뀌면 1쪽부터 */
export type PageAt = { at: string; page: number };
export const pageFor = (s: PageAt, at: string): number => (s.at === at ? s.page : 0);
