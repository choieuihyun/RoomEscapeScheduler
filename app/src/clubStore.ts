/* 7단계 공유 상태 — 내 하고 싶은 테마(§4.12). 같이 가요 화면·테마 도우미·테마 찾기·해 본 테마 찾기가 같은 목록을 본다.
   정산(§4.13) — 내 송금 정보, 받아 둔 정산(일정 상세가 고치면 홈 "보낼 돈" 띠도 같이 바뀐다).
   지연 청크끼리 나눠 쓰는 모듈이라 진입 청크(SchedulerPage)는 동적 import 로 startClub 만 부른다 —
   서버가 이 API 를 아는지(본문 없는 404 면 모름) 알려 주면 메뉴를 켠다.
   "하고 싶어요" 단추(WishToggle)도 여기서 다시 내보낸다. */
import { useSyncExternalStore } from 'react';
import {
  addWish, deleteWish, getPayInfo, getSettlement, isMissingApi, listMyWishes, myPastEvents, putPayInfo, sayClub,
  type EventDto, type PayInfoDto, type SettlementDto, type WishDto,
} from './server';
import { myDue } from './settle';
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
  /* 정산·송금 정보 API(§4.13) — 첫 송금 정보 요청으로 안다 */
  settleApi: Api;
  pay: PayInfoDto | null;
  /* 받아 둔 정산 — 일정 id → (받을 때의 settlementTotal 열쇠, 정산) */
  settles: ReadonlyMap<number, { key: string; dto: SettlementDto }>;
  /* 홈 "보낼 돈" 띠가 볼 일정(정산이 있는 내 일정, 최근 것 몇 개) */
  dueEvents: EventDto[];
}

const blank = (uid: string): ClubState => ({
  uid, wishApi: 'unknown', wishes: null, wishErr: '', busy: new Set(),
  settleApi: 'unknown', pay: null, settles: new Map(), dueEvents: [],
});
let st: ClubState = blank('');
const subs = new Set<() => void>();
/* SchedulerPage 가 메뉴를 켜고 끄는 데 쓰는 신호 — 1: 같이 가요, 2: 정산 */
let onFlags: ((f: number) => void) | null = null;
export const flagsOf = (s: ClubState): number => (s.wishApi === 'on' ? 1 : 0) | (s.settleApi === 'on' ? 2 : 0);

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
  if (st.uid !== uid) { st = blank(uid); dueAt = 0; }
  flags(flagsOf(st));
  if (st.wishApi !== 'missing') void reloadWishes();
  if (st.settleApi !== 'missing') void reloadPay();
}

/* 내 송금 정보 — 정산 API 를 아는지도 이것으로 안다(본문 없는 404 면 정산 칸·송금 정보 행을 숨긴다) */
export async function reloadPay(): Promise<void> {
  const uid = st.uid;
  try {
    const pay = await getPayInfo(await token());
    if (same(uid)) set({ settleApi: 'on', pay });
  } catch (e) {
    if (!same(uid)) return;
    if (isMissingApi(e)) set({ settleApi: 'missing', pay: null });
    else if (st.settleApi === 'unknown') set({ settleApi: 'on' }); // 잠깐의 오류로 기능을 숨기지 않는다 — 고칠 때 다시 받는다
  }
}

/* 정산 API 가 본문 없는 404 를 주면(서버가 모름) 이 접속 동안 숨긴다 */
export const settleMissing = () => set({ settleApi: 'missing', pay: null });

/* 송금 정보 저장 — 던지면 부르는 쪽이 문구를 보인다 */
export async function savePay(info: PayInfoDto): Promise<PayInfoDto> {
  const uid = st.uid;
  const pay = await putPayInfo(info, await token());
  if (same(uid)) set({ pay });
  return pay;
}

/* 받은 정산을 넣어 둔다(일정 상세가 받거나 고칠 때). key 는 그때의 settlementTotal */
export function keepSettle(dto: SettlementDto) {
  const n = new Map(st.settles);
  n.set(dto.eventId, { key: String(dto.items.length ? dto.total : null), dto });
  set({ settles: n });
}

/* 홈 "보낼 돈" — 정산이 있는 내 일정(받아 둔 목록 + 지난 일정 첫 쪽 — 정산은 보통 일정이 끝난 뒤에 한다)에서 최근 것
   몇 개만 정산을 받는다. 홈이 보일 때만 부르고, 5분에 한 번까지(목록 폴링마다 나가지 않게). 내가 정산 칸에서 고치거나
   체크한 것은 keepSettle 로 바로 반영된다 */
const DUE_EVENTS = 6;
export const DUE_EVERY_MS = 5 * 60_000;
let dueAt = 0;
let dueBusy = false;
export async function refreshDues(listed: EventDto[]): Promise<void> {
  if (st.settleApi !== 'on' || dueBusy || Date.now() - dueAt < DUE_EVERY_MS) return;
  const uid = st.uid;
  dueBusy = true;
  dueAt = Date.now();
  try {
    const t = await token();
    let past: EventDto[] = [];
    try { past = (await myPastEvents(null, 10, t)).events; } catch { /* 지난 일정을 못 받으면 받아 둔 목록만 */ }
    const byId = new Map<number, EventDto>();
    for (const e of [...listed.filter((x) => x.joined), ...past]) if (e.settlementTotal !== null && !byId.has(e.id)) byId.set(e.id, e);
    const evs = [...byId.values()].sort((a, b) => ((b.date ?? '') < (a.date ?? '') ? -1 : (b.date ?? '') > (a.date ?? '') ? 1 : b.id - a.id)).slice(0, DUE_EVENTS);
    for (const e of evs) {
      try {
        const dto = await getSettlement(e.id, t);
        if (!same(uid)) return;
        keepSettle(dto);
      } catch (err) {
        if (isMissingApi(err)) { settleMissing(); return; }
      }
    }
    if (same(uid)) set({ dueEvents: evs });
  } catch { /* 로그인 토큰을 못 받음 — 다음에 */ } finally {
    dueBusy = false;
  }
}

/* 홈 띠에 보일 것 — 내가 아직 안 보낸 돈이 있는 일정(최근 순) */
export function duesOf(s: ClubState): { ev: EventDto; amount: number }[] {
  return s.dueEvents.map((ev) => ({ ev, amount: myDue(s.settles.get(ev.id)?.dto, s.uid) })).filter((d) => d.amount > 0);
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
export { PayCard, PayForm } from './components/PayInfo';
