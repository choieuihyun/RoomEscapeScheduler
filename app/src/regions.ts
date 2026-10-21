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
   키이스케이프 강남 일곱 곳은 플레이방탈 강남 목록으로 확인(2026-10-21). '기타' 는 아직 지역을 모르는 지점이다 */
const EXTRA: Record<string, Region> = {
  '키이스케이프에버랜드': '용인',
  '키이스케이프log_in1': '강남',
  '키이스케이프log_in2': '강남',
  '키이스케이프station': '강남',
  '키이스케이프더오름': '강남',
  '키이스케이프메모리컴퍼니': '강남',
  '키이스케이프우주라이크': '강남',
  '키이스케이프후즈데어': '강남',
  '다이아에그다이아에그': '부산', // 서면
  '다이아에그미스테리인': '기타',
};

/* 서버가 지점마다 준 지역(/api/branches 의 region, 작업명세서 §4.4) — 있으면 이름 추측보다 먼저 쓴다.
   지점 목록을 받는 곳마다 setServerRegions 로 채운다. 목록 밖 값·null 은 모르는 것으로 보고 이름 추측으로 넘긴다 */
const fromServer = new Map<string, Region>();
let serverVer = 0;
const isRegion = (r: unknown): r is Region => typeof r === 'string' && (REGIONS as readonly string[]).includes(r);

export function setServerRegions(list: readonly { store: string; branch: string; region?: string | null }[]): void {
  for (const b of list) {
    const k = squash(b.store ?? '') + squash(b.branch ?? '');
    if (isRegion(b.region)) fromServer.set(k, b.region);
    else fromServer.delete(k);
  }
  serverVer += 1;
}
/* 받은 지역이 바뀌면 오르는 번호 — 화면이 다시 계산할 때 쓴다 */
export const serverRegionsVersion = (): number => serverVer;

export function regionOf(storeName: string, branchName: string): Region {
  const branch = squash(branchName ?? '');
  const key = squash(storeName ?? '') + branch;
  const server = fromServer.get(key);
  if (server) return server;
  const extra = EXTRA[key];
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
/* 목록 키가 바뀌면 그 키의 1쪽으로 갈아 끼운다(같으면 그대로 — 같은 객체). 옛 키로 돌아와도(강남 3쪽 → 홍대 → 강남)
   옛 쪽을 되살리지 않는다 */
export const pageAt = (s: PageAt, at: string): PageAt => (s.at === at ? s : { at, page: 0 });
