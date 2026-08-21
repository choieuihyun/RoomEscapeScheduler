/* 계정과 일정 보관 — Firebase Auth + Firestore.
 *
 * 이 파일은 로그인 버튼을 누르기 전까지 한 바이트도 내려가지 않는다(동적 import).
 * 즉 로그인을 안 쓰는 사람에게는 앱이 예전과 완전히 같다 — 네트워크 요청도 늘지 않는다.
 * 대신 로그인 기능만은 인터넷과 CDN 을 탄다. 조합 계산·이미지 인식은 여전히 오프라인.
 *
 * 아이디/비밀번호를 쓰지만 비밀번호를 우리가 저장하지는 않는다.
 * Firebase Auth 가 해시해서 보관하고, 우리 쪽 코드는 비밀번호를 어디에도 남기지 않는다.
 * 직접 만들면 반드시 틀리는 부분이라 남에게 맡긴다.
 */

const VER = '12.9.0';
const CDN = `https://www.gstatic.com/firebasejs/${VER}/`;

/* 실제로 메일이 오가지 않는 도메인. Firebase Auth 는 이메일 형태를 요구하지만
   확인 메일을 보내지 않으므로, 아이디를 여기에 얹어 "아이디 로그인" 처럼 쓴다.
   대신 비밀번호 재설정 메일도 못 보낸다 — 잊으면 복구가 없다(README 에 명시). */
const DOMAIN = 'user.resched';
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/;
export const ID_HINT = '영문·숫자 3~20자 (밑줄, 점, 붙임표 가능)';
const toEmail = id => id.toLowerCase() + '@' + DOMAIN;
export const toId = email => String(email||'').replace('@' + DOMAIN, '');

export function configured(){
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && c.appId);
}

let ready = null, A = null, F = null, auth = null, db = null;

/* 두 번 불러도 한 번만 받아온다 */
function boot(){
  if(ready) return ready;
  ready = (async () => {
    if(!configured()) throw new Error('NOT_CONFIGURED');
    const [appMod, authMod, fsMod] = await Promise.all([
      import(CDN + 'firebase-app.js'),
      import(CDN + 'firebase-auth.js'),
      import(CDN + 'firebase-firestore.js'),
    ]);
    A = authMod; F = fsMod;
    const app = appMod.initializeApp(window.FIREBASE_CONFIG);
    auth = A.getAuth(app);
    db   = F.getFirestore(app);
    /* 탭을 닫아도 로그인이 유지되게. 이게 없으면 새로고침마다 다시 로그인해야 한다 */
    try{ await A.setPersistence(auth, A.browserLocalPersistence); }catch{}
    return true;
  })().catch(err => { ready = null; throw err; });
  return ready;
}

/* ── 계정 ────────────────────────────────────────────── */

export async function watch(cb){
  await boot();
  return A.onAuthStateChanged(auth, u => cb(u ? { uid:u.uid, id:toId(u.email) } : null));
}

export async function signUp(id, pw){
  await boot();
  const c = await A.createUserWithEmailAndPassword(auth, toEmail(id), pw);
  return { uid:c.user.uid, id };
}

export async function signIn(id, pw){
  await boot();
  const c = await A.signInWithEmailAndPassword(auth, toEmail(id), pw);
  return { uid:c.user.uid, id };
}

export async function signOut(){
  await boot();
  return A.signOut(auth);
}

/* Firebase 오류코드는 그대로 보여주면 아무도 못 읽는다 */
export function say(err){
  const code = (err && err.code || '').replace('auth/','');
  return ({
    'email-already-in-use' : '이미 있는 아이디입니다.',
    'invalid-credential'   : '아이디 또는 비밀번호가 맞지 않습니다.',
    'invalid-login-credentials':'아이디 또는 비밀번호가 맞지 않습니다.',
    'wrong-password'       : '아이디 또는 비밀번호가 맞지 않습니다.',
    'user-not-found'       : '없는 아이디입니다.',
    'weak-password'        : '비밀번호는 6자 이상이어야 합니다.',
    'invalid-email'        : '아이디에 쓸 수 없는 문자가 있습니다.',
    'too-many-requests'    : '시도가 너무 잦습니다. 잠시 뒤에 다시 해주세요.',
    'network-request-failed':'네트워크에 연결하지 못했습니다.',
    'operation-not-allowed': '이메일/비밀번호 로그인이 아직 켜져 있지 않습니다 (Firebase 콘솔).',
  })[code] || (err && err.message === 'NOT_CONFIGURED'
    ? '로그인이 아직 설정되지 않았습니다 (firebase-config.js).'
    : '문제가 생겼습니다: ' + (err && err.message || err));
}

/* ── 일정 ────────────────────────────────────────────── */
/* users/{uid}/plans/{자동id} — 남의 것은 규칙에서 막힌다(firestore.rules) */

function mine(){
  const u = auth && auth.currentUser;
  if(!u) throw new Error('로그인이 필요합니다.');
  return F.collection(db, 'users', u.uid, 'plans');
}

export async function listPlans(){
  await boot();
  const snap = await F.getDocs(F.query(mine(), F.orderBy('date','desc')));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function savePlan(plan){
  await boot();
  const ref = await F.addDoc(mine(), { ...plan, createdAt:F.serverTimestamp() });
  return ref.id;
}

export async function patchPlan(id, patch){
  await boot();
  const u = auth.currentUser;
  return F.updateDoc(F.doc(db, 'users', u.uid, 'plans', id), patch);
}

export async function removePlan(id){
  await boot();
  const u = auth.currentUser;
  return F.deleteDoc(F.doc(db, 'users', u.uid, 'plans', id));
}
