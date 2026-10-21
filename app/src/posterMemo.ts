/* 테마 사진 주소를 이 기기에 따로 기억한다(2026-10-22) — 서버 테마 키(테마 id) → posterUrl.
   사진은 자동 저장·공유 링크(serialize.ts)에 싣지 않으므로(그 바이트는 옛 링크와 같아야 한다),
   새로 고침·자동 저장 복원·공유 링크로 연 카드는 이 지도에서 사진을 찾는다. 최근 MAX 개만, 저장이 막히면 조용히 이번에만 */
const KEY = 'flod.posters';
export const POSTER_MAX = 300;
type Memo = [string, string][];   // [테마 키, 주소] — 앞이 오래된 것

/* 새 항목을 맨 뒤(가장 최근)로 — 같은 키는 옮기고 주소는 새 값, 넘치면 오래된 것부터 버린다. 키·주소가 없는 항목은 건너뛴다 */
export function addPosters(memo: Memo, items: readonly { themeKey?: string; posterUrl?: string }[], max = POSTER_MAX): Memo {
  const m = new Map(memo);
  for (const it of items) {
    if (!it.themeKey || !it.posterUrl) continue;
    m.delete(it.themeKey);
    m.set(it.themeKey, it.posterUrl);
  }
  return [...m].slice(-max);
}

/* 읽은 값이 깨졌으면 빈 지도 */
export function parseMemo(raw: string | null): Memo {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') : [];
  } catch { return []; }
}

const read = (): Memo => { try { return parseMemo(localStorage.getItem(KEY)); } catch { return []; } };

export function rememberPosters(items: readonly { themeKey?: string; posterUrl?: string }[]): void {
  if (!items.some((it) => it.themeKey && it.posterUrl)) return;
  try { localStorage.setItem(KEY, JSON.stringify(addPosters(read(), items))); } catch { /* 시크릿 창·저장공간 꽉 참 — 이번에만 안 남는다 */ }
}

/* 테마 키마다 기억한 사진 주소를 찾는 함수 — 한 번 읽어 여러 카드에 쓴다 */
export function posterLookup(): (themeKey?: string) => string | undefined {
  const m = new Map(read());
  return (k) => (k ? m.get(k) : undefined);
}
