/* 7단계 공유 상태 — 내 하고 싶은 테마(§4.12). 같이 가요 화면·테마 도우미·테마 찾기·해 본 테마 찾기가 같은 목록을 본다.
   지연 청크끼리 나눠 쓰는 모듈이라 진입 청크(SchedulerPage)는 동적 import 로 startClub 만 부른다 —
   서버가 이 API 를 아는지(본문 없는 404 면 모름) 알려 주면 메뉴를 켠다.
   "하고 싶어요" 단추(WishToggle)도 여기서 다시 내보낸다. */
import { useSyncExternalStore } from 'react';
import { addWish, deleteWish, isMissingApi, listMyWishes, sayClub, type WishDto } from './server';
import { showToast } from './toast';
import { sameTheme, wishKey, type WishRef } from './wish';

export type Api = 'unknown' | 'on' | 'missing';
export interface ClubState {
  uid: string;
  wishApi: Api;
  /* 내 위시(최근 순). 못 받았으면 null */
  wishes: WishDto[] | null;
  wishErr: string;
  /* 지금 보내는 중인 테마(wishKey) — 같은 단추를 두 번 누르지 않게 */
  busy: ReadonlySet<string>;
}

const blank = (uid: string): ClubState => ({ uid, wishApi: 'unknown', wishes: null, wishErr: '', busy: new Set() });
let st: ClubState = blank('');
const subs = new Set<() => void>();
/* SchedulerPage 가 메뉴를 켜고 끄는 데 쓰는 신호 — 1: 같이 가요 */
let onFlags: ((f: number) => void) | null = null;
export const flagsOf = (s: ClubState): number => (s.wishApi === 'on' ? 1 : 0);

function set(patch: Partial<ClubState>) {
  st = { ...st, ...patch };
  subs.forEach((f) => f());
  onFlags?.(flagsOf(st));
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useClubStore = (): ClubState => useSyncExternalStore(subscribe, () => st);
export const clubState = (): ClubState => st;

async function token(): Promise<string> {
  const t = await (await import('./cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return t;
}

/* 받는 중인 요청이 사람이 바뀐 뒤(로그아웃·다른 계정) 돌아오면 버린다 */
const same = (uid: string) => st.uid === uid;

/* 서버가 이 기능을 모르면(본문 없는 404) 이 접속 동안 숨긴다. 그 밖의 오류는 기능은 켠 채 다시 시도할 수 있게 */
export async function reloadWishes(): Promise<void> {
  const uid = st.uid;
  try {
    const list = await listMyWishes(await token());
    if (same(uid)) set({ wishApi: 'on', wishes: list, wishErr: '' });
  } catch (e) {
    if (!same(uid)) return;
    if (isMissingApi(e)) set({ wishApi: 'missing', wishes: null });
    else set({ wishApi: st.wishApi === 'missing' ? 'missing' : 'on', wishErr: sayClub(e) });
  }
}

/* 승인 멤버이고 일정 API 가 켜지면 SchedulerPage 가 부른다. 사람이 바뀌면 처음부터, 같은 사람이면 조용히 새로 받는다 */
export function startClub(uid: string, flags: (f: number) => void): void {
  onFlags = flags;
  if (st.uid !== uid) st = blank(uid);
  flags(flagsOf(st));
  if (st.wishApi !== 'missing') void reloadWishes();
}

const busyWith = (k: string, on: boolean) => {
  const n = new Set(st.busy);
  if (on) n.add(k); else n.delete(k);
  set({ busy: n });
};

/* 기능을 모르는 서버(404)면 숨기고 알린다. 그 밖엔 서버 문구 */
function fail(e: unknown) {
  if (isMissingApi(e)) {
    set({ wishApi: 'missing', wishes: null });
    showToast('서버가 아직 같이 가요를 몰라요. 잠시 뒤 다시 열어 주세요.');
  } else showToast(sayClub(e));
}

/* 내 위시 중 이 테마 — 서버가 묶을 때와 같은 판정 */
export const myWish = (list: WishDto[] | null, r: WishRef): WishDto | undefined => list?.find((w) => sameTheme(w, r));

/* 하고 싶어요 올리기 — 이미 있으면(같은 테마) 서버가 그 행을 돌려준다. 성공하면 true */
export async function addWishFor(r: WishRef): Promise<boolean> {
  const k = wishKey(r), uid = st.uid;
  if (st.busy.has(k)) return false;
  busyWith(k, true);
  try {
    const w = await addWish({ themeKey: r.themeKey, themeName: r.themeName.trim(), branchName: r.branchName?.trim() || null }, await token());
    if (same(uid)) set({ wishes: [w, ...(st.wishes ?? []).filter((x) => x.id !== w.id)] });
    return true;
  } catch (e) {
    if (same(uid)) fail(e);
    return false;
  } finally {
    if (same(uid)) busyWith(k, false);
  }
}

/* 내리기 — 받아 둔 목록에 없으면(다른 기기에서 올렸다) 새로 받아 찾는다 */
export async function removeWishFor(r: WishRef): Promise<boolean> {
  const k = wishKey(r), uid = st.uid;
  if (st.busy.has(k)) return false;
  busyWith(k, true);
  try {
    let w = myWish(st.wishes, r);
    if (!w) { await reloadWishes(); w = myWish(st.wishes, r); }
    if (!w) return true;
    const id = w.id;
    await deleteWish(id, await token());
    if (same(uid)) set({ wishes: (st.wishes ?? []).filter((x) => x.id !== id) });
    return true;
  } catch (e) {
    if (same(uid)) fail(e);
    return false;
  } finally {
    if (same(uid)) busyWith(k, false);
  }
}

export const toggleWishFor = (r: WishRef): Promise<boolean> => (myWish(st.wishes, r) ? removeWishFor(r) : addWishFor(r));

/* "하고 싶어요" 단추도 이 모듈을 거쳐 가져간다 — 따로 가져가면 청크가 하나 더 생겨 진입 청크의 미리 받기 목록이 길어진다(진입 크기 한도) */
export { WishToggle } from './components/WishToggle';
