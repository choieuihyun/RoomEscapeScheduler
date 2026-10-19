import { useCallback, useEffect, useRef, useState } from 'react';
import type { Me } from './cloud';
import { handleKakaoReturn } from './authFlow';
import { appRedirectUri, isKakaoInApp, kakaoAuthUrl, readKakaoReturn } from './kakao';
import { beginKakaoTrip, endKakaoTrip } from './kakaoTrip';
import { getMe, joinClub, kakaoLink, kakaoLogin, type MeDto } from './server';

declare global {
  interface Window {
    /* F9 가 public/firebase-config.js 에 넣는다. 비면 카카오 로그인은 "설정 전"으로 다룬다 */
    KAKAO_CLIENT_ID?: string;
  }
}

/* 계정 로그인/가입 — index.html의 renderAcct/openAuth/submitAuth 이식.
   cloud.ts 자체도 동적 import로 불러온다 — 로그인 버튼을 누르기 전까지
   Firebase SDK는 물론 cloud.ts 청크조차 한 바이트도 안 내려간다 (§4.18, §4.31 스파이크). */
const SEEN_KEY = 'resched.signedin';

let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

function cloudConfigured(): boolean {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && c.appId);
}

export function useAuth() {
  const cloudOn = useRef(cloudConfigured()).current;
  const wasSeen = useRef(cloudOn && !!localStorage.getItem(SEEN_KEY)).current;
  /* 카카오에서 막 돌아온 주소면 토큰으로 로그인하는 동안도 "복원 중"이다 */
  /* cloudOn 과 무관 — Firebase 설정이 없어도 돌아온 code·state 는 주소에서 지운다 */
  const kakaoBack = useRef((readKakaoReturn(location.search) !== null || new URLSearchParams(location.search).has('code'))).current;
  const inKakaoApp = useRef(isKakaoInApp(navigator.userAgent)).current;
  const [me, setMe] = useState<Me | null>(null);
  /* 동호회 멤버 상태 — 서버가 이 기능을 모르면(404) 계속 null 이고 화면은 동호회를 숨긴다 */
  const [member, setMember] = useState<MeDto | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const kakaoHandled = useRef(false);
  const pushedFor = useRef('');
  /* Firebase가 저장된 로그인 상태를 IndexedDB에서 복원하는 동안(수백ms~1초)
     me는 아직 null이지만 "로그인 안 함"과는 다르다 — 이 구분이 없으면
     새로고침 직후 잠깐 "로그인" 버튼이 떴다가 돌아오는 깜빡임이 실제로
     "로그아웃됐다"는 오해를 준다. 예전에 로그인한 적 있을 때만(SEEN_KEY)
     로딩 상태로 시작한다 — 한 번도 로그인 안 한 사람은 애초에 기다릴 게 없다. */
  const [authLoading, setAuthLoading] = useState(wasSeen || kakaoBack);
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  /* 예전에 로그인한 적이 있을 때만 SDK를 미리 깨운다 — 한 번도 안 쓴 사람에게
     짐을 지우지 않기 위해서다 (index.html의 SEEN_KEY 가드). */
  useEffect(() => {
    if (!wasSeen) return;
    cloud().then(C => C.watch(u => { setMe(u); setAuthLoading(false); }))
      .catch(e => { console.warn('로그인 복귀 실패:', e); setAuthLoading(false); });
  }, [wasSeen]);

  /* 멤버 상태 — 로그인 상태가 바뀔 때마다 서버에 묻는다. 실패·404 는 조용히 null */
  const loadMember = useCallback(async (): Promise<MeDto | null> => {
    try {
      const token = await (await cloud()).idToken();
      return token ? await getMe(token) : null;
    } catch {
      return null;
    }
  }, []);

  /* 카카오 왕복에서 돌아왔으면 한 번만 처리한다 (endKakaoTrip 은 한 번만 열린다 — StrictMode 이중 실행 방지) */
  useEffect(() => {
    if (!kakaoBack || kakaoHandled.current) return;
    kakaoHandled.current = true;
    (async () => {
      /* handleKakaoReturn 을 먼저(동기로) 부른다 — 주소 정리가 SDK 로드·실패와 상관없이 끝나게.
         Firebase 가 필요한 의존성은 지연해서 넘긴다. */
      const r = await handleKakaoReturn({
        search: location.search,
        href: location.href,
        replaceUrl: url => history.replaceState(null, '', url),
        endTrip: endKakaoTrip,
        kakaoLogin,
        kakaoLink,
        signInWithCustom: t => cloud().then(C => C.signInWithCustom(t)).then(m => { setMe(m); return m; }),
        idToken: () => cloud().then(C => C.idToken()),
        redirectUri: appRedirectUri(location),
        cloudOn,
      });
      if (r.kind === 'signedIn') {
        localStorage.setItem(SEEN_KEY, '1');
        /* 이후 다른 탭의 로그아웃 등도 따라가도록 상태 구독을 건다 */
        cloud().then(C => C.watch(u => setMe(u))).catch(() => { /* noop */ });
      } else if (r.kind === 'linked') {
        setMember(await loadMember());
      } else if (r.kind === 'error') {
        setErr(r.message); setOpen(true);
      }
      setAuthLoading(false);
    })();
  }, [kakaoBack, cloudOn, loadMember]);

  const uid = me?.uid ?? '';
  useEffect(() => {
    if (!uid) { setMember(null); setMemberLoading(false); pushedFor.current = ''; return; }
    let live = true;
    setMemberLoading(true);
    loadMember().then(m => { if (live) { setMember(m); setMemberLoading(false); } });
    /* 기기 등록 — 권한이 이미 허용된 경우에만 조용히 올린다. 로그인당 한 번 */
    if (pushedFor.current !== uid) {
      pushedFor.current = uid;
      (async () => {
        try {
          const token = await (await cloud()).idToken();
          if (token) await (await import('./notify')).silentlyRefreshPush(token);
        } catch { /* 실패는 조용히 */ }
      })();
    }
    return () => { live = false; };
  }, [uid, loadMember]);

  const refreshMember = useCallback(async () => {
    setMemberLoading(true);
    setMember(await loadMember());
    setMemberLoading(false);
  }, [loadMember]);

  const openAuth = useCallback(() => {
    setErr(''); setOpen(true);
  }, []);
  const closeAuth = useCallback(() => { setOpen(false); setPw(''); }, []);

  const submit = useCallback(async () => {
    const cleanId = id.trim().toLowerCase();
    setId(cleanId);
    const C = await cloud().catch(() => null);
    if (!C) { setErr('로그인을 준비하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    if (!C.ID_RE.test(cleanId)) { setErr('아이디 형식이 맞지 않아요 — ' + C.ID_HINT); return; }
    if (pw.length < 6) { setErr('비밀번호는 6자 이상으로 해 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      const result = await C.signIn(cleanId, pw);
      setMe(result);
      setAuthLoading(false);
      localStorage.setItem(SEEN_KEY, '1');
      setOpen(false); setPw('');
    } catch (e) {
      setErr(C.say(e));
    } finally {
      setBusy(false);
    }
  }, [id, pw]);

  const loginKakao = useCallback(() => {
    if (!cloudOn) { setErr('로그인이 아직 설정되지 않았어요.'); return; }
    const clientId = window.KAKAO_CLIENT_ID;
    if (!clientId) { setErr('카카오 로그인이 아직 설정되지 않았어요.'); return; }
    const state = beginKakaoTrip('login', location.hash);
    location.assign(kakaoAuthUrl(clientId, appRedirectUri(location), state));
  }, [cloudOn]);

  /* 로그인한 계정에 카카오를 붙인다 — 갔다 오면 위의 돌아오기 처리가 link 로 마무리한다 */
  const linkKakao = useCallback(() => {
    if (!cloudOn) { setErr('로그인이 아직 설정되지 않았어요.'); return; }
    const clientId = window.KAKAO_CLIENT_ID;
    if (!clientId) { setErr('카카오 로그인이 아직 설정되지 않았어요.'); return; }
    const state = beginKakaoTrip('link', location.hash);
    location.assign(kakaoAuthUrl(clientId, appRedirectUri(location), state));
  }, [cloudOn]);

  const loginGoogle = useCallback(async () => {
    const C = await cloud().catch(() => null);
    if (!C) { setErr('로그인을 준비하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      setMe(await C.signInWithGoogle());
      setAuthLoading(false);
      localStorage.setItem(SEEN_KEY, '1');
      setOpen(false); setPw('');
    } catch (e) {
      setErr(C.say(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const linkGoogle = useCallback(async () => {
    const C = await cloud().catch(() => null);
    if (!C) { setErr('로그인을 준비하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    setErr('');
    try {
      await C.linkGoogle();
    } catch (e) {
      setErr(C.say(e));
    }
  }, []);

  /* 동호회 가입 신청. 실패는 호출한 화면이 sayClub 으로 보여 주도록 그대로 던진다 */
  const join = useCallback(async (nickname: string) => {
    const token = await (await cloud()).idToken();
    if (!token) throw new Error('로그인해 주세요.');
    setMember(await joinClub(nickname, token));
  }, []);

  const logout = useCallback(async () => {
    try { (await cloud()).signOut(); } catch { /* noop */ }
    localStorage.removeItem(SEEN_KEY);
    setMe(null);
    setAuthLoading(false);
  }, []);

  return {
    cloudOn, me, authLoading, open, id, setId, pw, setPw, err, busy, openAuth, closeAuth, submit, logout,
    member, memberLoading, refreshMember, loginKakao, loginGoogle, linkKakao, linkGoogle, join,
    inKakaoApp, legacyOpen, setLegacyOpen,
  };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
