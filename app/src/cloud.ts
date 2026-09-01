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
export const toId = (email: string) => String(email || '').replace('@' + DOMAIN, '');

declare global {
  interface Window {
    FIREBASE_CONFIG?: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string; messagingSenderId?: string };
  }
}

export function configured(): boolean {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && c.appId);
}

export interface Me { uid: string; id: string }

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

/* ── 계정 ── */

export async function watch(cb: (me: Me | null) => void) {
  await boot();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return A.onAuthStateChanged(auth, (u: any) => cb(u ? { uid: u.uid, id: toId(u.email) } : null));
}

export async function signUp(id: string, pw: string): Promise<Me> {
  await boot();
  const c = await A.createUserWithEmailAndPassword(auth, toEmail(id), pw);
  return { uid: c.user.uid, id };
}

export async function signIn(id: string, pw: string): Promise<Me> {
  await boot();
  const c = await A.signInWithEmailAndPassword(auth, toEmail(id), pw);
  return { uid: c.user.uid, id };
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
  const u = auth?.currentUser;
  return u ? u.getIdToken() : null;
}

/* Firebase 오류코드는 그대로 보여주면 아무도 못 읽는다 */
export function say(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const code = (e?.code || '').replace('auth/', '');
  const known: Record<string, string> = {
    'email-already-in-use': '이미 있는 아이디입니다.',
    'invalid-credential': '아이디 또는 비밀번호가 맞지 않습니다.',
    'invalid-login-credentials': '아이디 또는 비밀번호가 맞지 않습니다.',
    'wrong-password': '아이디 또는 비밀번호가 맞지 않습니다.',
    'user-not-found': '없는 아이디입니다.',
    'weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'invalid-email': '아이디에 쓸 수 없는 문자가 있습니다.',
    'too-many-requests': '시도가 너무 잦습니다. 잠시 뒤에 다시 해주세요.',
    'network-request-failed': '네트워크에 연결하지 못했습니다.',
    'operation-not-allowed': '이메일/비밀번호 로그인이 아직 켜져 있지 않습니다 (Firebase 콘솔).',
    /* Authentication을 아예 시작하지 않은 프로젝트에서 나온다. */
    'configuration-not-found': 'Firebase 콘솔에서 Authentication을 아직 시작하지 않았습니다.',
  };
  if (known[code]) return known[code];
  if (e?.message === 'NOT_CONFIGURED') return '로그인이 아직 설정되지 않았습니다 (firebase-config.js).';
  return '문제가 생겼습니다: ' + (e?.message || String(err));
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
  minGap: number | null;
  snapshot: string;
  createdAt?: unknown;
}

function mine() {
  const u = auth?.currentUser;
  if (!u) throw new Error('로그인이 필요합니다.');
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
