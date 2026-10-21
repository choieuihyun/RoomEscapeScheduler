/* 계정과 일정 보관 — Firebase Auth + Firestore. index.html의 cloud.js 이식.
 *
 * 로그인을 쓰는 함수(watch/signUp/signIn/...)를 처음 부를 때까지 Firebase SDK가
 * 한 바이트도 내려가지 않는다(동적 import) — §4.18 "로그인 없이 완결된다".
 *
 * 아이디/비밀번호를 쓰지만 비밀번호를 우리가 저장하지는 않는다.
 * Firebase Auth가 해시해서 보관하고, 우리 쪽 코드는 비밀번호를 어디에도 남기지 않는다.
 */

const VER = '12.9.0';
const CDN = `https://www.gstatic.com/firebasejs/${VER}/`;

/* 실제로 메일이 오가지 않는 도메인. Firebase Auth는 이메일 형태를 요구하지만
   확인 메일을 보내지 않으므로, 아이디를 여기에 얹어 "아이디 로그인"처럼 쓴다.
   대신 비밀번호 재설정 메일도 못 보낸다 — 잊으면 복구가 없다. */
const DOMAIN = 'user.resched';
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/;
export const ID_HINT = '영문·숫자 3~20자 (밑줄, 점, 붙임표 가능)';
const toEmail = (id: string) => id.toLowerCase() + '@' + DOMAIN;
/* 아이디 계정(@user.resched)만 아이디가 있다. 소셜 계정은 ''(표시 이름은 멤버 닉네임). */
export const toId = (email: string) => {
  const m = String(email || '');
  return m.endsWith('@' + DOMAIN) ? m.slice(0, -('@' + DOMAIN).length) : '';
};

declare global {
  interface Window {
    FIREBASE_CONFIG?: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string; messagingSenderId?: string };
  }
}

export function configured(): boolean {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && c.appId);
}

/* photo: 구글 프로필 사진 주소(없으면 없음) — 좁은 화면 위쪽 막대·더보기의 아바타(§4.60) */
export interface Me { uid: string; id: string; photo?: string }

/* 아이디 계정에 구글을 붙이면 currentUser.photoURL 은 비어 있고 구글 쪽 providerData 에만 사진이 있다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const photoOf = (u: any): string | undefined =>
  u?.photoURL || u?.providerData?.find((p: { providerId: string; photoURL?: string | null }) => p.providerId === 'google.com')?.photoURL || undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const meOf = (u: any, id: string): Me => ({ uid: u.uid, id, photo: photoOf(u) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let A: any = null, F: any = null, M: any = null, app: any = null, auth: any = null, db: any = null;
let ready: Promise<boolean> | null = null;

/* 두 번 불러도 한 번만 받아온다 */
function boot(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    if (!configured()) throw new Error('NOT_CONFIGURED');
    const [appMod, authMod, fsMod] = await Promise.all([
      import(/* @vite-ignore */ CDN + 'firebase-app.js'),
      import(/* @vite-ignore */ CDN + 'firebase-auth.js'),
      import(/* @vite-ignore */ CDN + 'firebase-firestore.js'),
    ]);
    A = authMod; F = fsMod;
    app = appMod.initializeApp(window.FIREBASE_CONFIG);
    auth = A.getAuth(app);
    db = F.getFirestore(app);
    /* 탭을 닫아도 로그인이 유지되게. 이게 없으면 새로고침마다 다시 로그인해야 한다 */
    try { await A.setPersistence(auth, A.browserLocalPersistence); } catch { /* noop */ }
    return true;
  })().catch(err => { ready = null; throw err; });
  return ready;
}

/* F-16 푸시 토큰 발급. auth/firestore와 달리 감시를 실제로 걸 때만 쓰이므로
   boot()의 Promise.all에 안 끼워 넣고 따로 지연 로드한다 — 로그인만 하고
   감시는 안 거는 사람에게 messaging SDK 바이트를 안 보내려는 목적. */
let messagingReady: Promise<boolean> | null = null;
function bootMessaging(): Promise<boolean> {
  if (messagingReady) return messagingReady;
  messagingReady = (async () => {
    await boot();
    M = await import(/* @vite-ignore */ CDN + 'firebase-messaging.js');
    return true;
  })().catch(err => { messagingReady = null; throw err; });
  return messagingReady;
}

export async function getMessagingToken(vapidKey: string, swRegistration: ServiceWorkerRegistration): Promise<string | null> {
  await bootMessaging();
  const messaging = M.getMessaging(app);
  try {
    return await M.getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
  } catch (e) {
    console.warn('푸시 토큰 발급 실패:', e);
    return null;
  }
}

/* 앱 탭이 보이는 동안 온 푸시(서비스 워커가 창으로 넘긴 것). SDK 는 이때 알림을 띄우지 않는다. 끊는 함수를 돌려준다.
   SDK 의 onMessage 는 인스턴스에 받는 쪽을 하나만 두고, 돌려주는 끊기는 지금 받는 쪽이 누구든 지운다 —
   SDK 를 받는 중에 다시 걸면(등록 알림 등) 늦게 끝난 앞 구독의 끊기가 새 받는 쪽까지 지운다(헤드리스로 재현).
   그래서 SDK 에는 페이지마다 한 번만 걸고, 여기서 받는 쪽만 바꿔 끼운다. 끊기는 자기 것일 때만 지운다. */
let fgCb: ((payload: unknown) => void) | null = null;
let fgHooked = false;
export async function onForegroundMessage(cb: (payload: unknown) => void): Promise<() => void> {
  await bootMessaging();
  if (!fgHooked) {
    M.onMessage(M.getMessaging(app), (p: unknown) => fgCb?.(p));
    fgHooked = true;
  }
  fgCb = cb;
  return () => { if (fgCb === cb) fgCb = null; };
}

/* ── 계정 ── */

export async function watch(cb: (me: Me | null) => void) {
  await boot();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return A.onAuthStateChanged(auth, (u: any) => cb(u ? meOf(u, toId(u.email)) : null));
}

export async function signUp(id: string, pw: string): Promise<Me> {
  await boot();
  const c = await A.createUserWithEmailAndPassword(auth, toEmail(id), pw);
  return meOf(c.user, id);
}

export async function signIn(id: string, pw: string): Promise<Me> {
  await boot();
  const c = await A.signInWithEmailAndPassword(auth, toEmail(id), pw);
  return meOf(c.user, id);
}

/* ── 소셜 로그인 ── 구글은 서버를 거치지 않고 Firebase 가 처리한다(작업명세서 §4.6). */

/* 로그인 창이 열릴 때 SDK 를 미리 받아 둔다 — 클릭 뒤에 받기 시작하면 사용자 활성화가 끝나
   Safari 등에서 팝업이 막힐 수 있다. */
export const warm = (): Promise<void> => boot().then(() => {});

export async function signInWithGoogle(): Promise<Me> {
  /* 이미 준비됐으면 await 없이 바로 팝업을 연다(클릭의 사용자 활성화 안에서 부르려고) */
  if (!auth) await boot();
  const c = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
  return meOf(c.user, toId(c.user.email));
}

/* 로그인한 기존 계정에 구글을 붙인다 — uid 가 그대로라 일정·알림이 끊기지 않는다 */
export async function linkGoogle(): Promise<void> {
  await boot();
  if (!auth.currentUser) throw new Error('로그인해 주세요.');
  await A.linkWithPopup(auth.currentUser, new A.GoogleAuthProvider());
}

/* 서버가 카카오 인가 코드와 맞바꿔 준 customToken 으로 로그인 */
export async function signInWithCustom(token: string): Promise<Me> {
  await boot();
  const c = await A.signInWithCustomToken(auth, token);
  return meOf(c.user, toId(c.user.email));
}

/* 현재 사용자에게 붙은 로그인 수단('password'·'google.com' 등) */
export async function providers(): Promise<string[]> {
  await boot();
  return auth.currentUser?.providerData.map((p: { providerId: string }) => p.providerId) ?? [];
}

export async function signOut() {
  await boot();
  return A.signOut(auth);
}

/* F-16 감시 API가 요구하는 Authorization: Bearer 값. 서버는 이 토큰을
   구글 공개키로 서명만 검증하고 우리 서버 코드는 관여하지 않는다
   (작업명세서 §4.5). 로그인 안 돼 있으면 null. */
export async function idToken(): Promise<string | null> {
  await boot();
  /* 새로고침·카카오 왕복 직후엔 저장된 로그인이 복원되기 전이라 currentUser 가 잠깐 null 이다 —
     복원이 끝날 때까지 기다린 뒤 읽는다 */
  if (auth) {
    if (typeof auth.authStateReady === 'function') await auth.authStateReady();
    else await new Promise<void>(res => { const off = A.onAuthStateChanged(auth, () => { off(); res(); }); });
  }
  const u = auth?.currentUser;
  return u ? u.getIdToken() : null;
}

/* Firebase 오류코드는 그대로 보여주면 아무도 못 읽는다 */
export function say(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = (e?.code || '').replace('auth/', '');
  const known: Record<string, string> = {
    'email-already-in-use': '이미 있는 아이디예요.',
    'invalid-credential': '아이디나 비밀번호가 틀렸어요.',
    'invalid-login-credentials': '아이디나 비밀번호가 틀렸어요.',
    'wrong-password': '아이디나 비밀번호가 틀렸어요.',
    'user-not-found': '없는 아이디예요.',
    'weak-password': '비밀번호는 6자 이상으로 해 주세요.',
    'invalid-email': '아이디에 쓸 수 없는 글자가 있어요.',
    'too-many-requests': '너무 여러 번 시도했어요. 잠시 뒤에 다시 해 주세요.',
    'popup-closed-by-user': '로그인 창이 닫혔어요.',
    'credential-already-in-use': '이 구글 계정은 이미 다른 계정에 연결돼 있어요.',
    'popup-blocked': '팝업이 막혔어요. 팝업을 허용하고 다시 눌러 주세요.',
    'cancelled-popup-request': '로그인 창이 닫혔어요.',
    /* Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 이 주소가 없을 때 */
    'unauthorized-domain': '이 주소에서는 아직 구글 로그인을 쓸 수 없어요. 운영진에게 알려 주세요.',
    'network-request-failed': '인터넷 연결을 확인해 주세요.',
    'operation-not-allowed': '이메일/비밀번호 로그인이 아직 켜져 있지 않습니다 (Firebase 콘솔).',
    /* Authentication을 아예 시작하지 않은 프로젝트에서 나온다. */
    'configuration-not-found': 'Firebase 콘솔에서 Authentication을 아직 시작하지 않았습니다.',
  };
  if (known[code]) return known[code];
  if (e?.message === 'NOT_CONFIGURED') return '로그인이 아직 설정되지 않았습니다 (firebase-config.js).';
  return '문제가 생겼어요: ' + (e?.message || String(err));
}

/* ── 일정 ── */
/* users/{uid}/plans/{자동id} — 남의 것은 규칙에서 막힌다(firestore.rules) */

export interface PlanStep { name: string; dur: number; start: number; end: number }

export interface Plan {
  id?: string;
  date: string;
  status: 'wish' | 'done';
  memo: string;
  steps: PlanStep[];
  count: number;
  start: number;
  end: number;
  total: number;
  /* 이동 합(2026-10-21 검토) — 대기 = total − moveTotal. 옛 문서엔 없다(planWait.ts 가 snapshot 에서 다시 센다) */
  moveTotal?: number;
  minGap: number | null;
  snapshot: string;
  createdAt?: unknown;
}

function mine() {
  const u = auth?.currentUser;
  if (!u) throw new Error('로그인해 주세요.');
  return F.collection(db, 'users', u.uid, 'plans');
}

export async function listPlans(): Promise<Plan[]> {
  await boot();
  const snap = await F.getDocs(F.query(mine(), F.orderBy('date', 'desc')));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

export async function savePlan(plan: Omit<Plan, 'id' | 'createdAt'>): Promise<string> {
  await boot();
  const ref = await F.addDoc(mine(), { ...plan, createdAt: F.serverTimestamp() });
  return ref.id;
}

export async function patchPlan(id: string, patch: Partial<Plan>) {
  await boot();
  const u = auth.currentUser;
  return F.updateDoc(F.doc(db, 'users', u.uid, 'plans', id), patch);
}

export async function removePlan(id: string) {
  await boot();
  const u = auth.currentUser;
  return F.deleteDoc(F.doc(db, 'users', u.uid, 'plans', id));
}
