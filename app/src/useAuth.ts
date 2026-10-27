import { hist } from './backStack';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Me } from './cloud';
import { handleKakaoReturn } from './authFlow';
import { appRedirectUri, isKakaoInApp, kakaoAuthUrl, readKakaoReturn } from './kakao';
import { beginKakaoTrip, endKakaoTrip } from './kakaoTrip';
import { getMe, joinClub, kakaoLink, kakaoLogin, type MeDto, type ProfileDto } from './server';

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

/* 알림 권한이 이미 허용돼 있으면 이 기기를 서버에 조용히 다시 올린다. 실패는 조용히 */
async function refreshPushQuietly(): Promise<void> {
  try {
    const token = await (await cloud()).idToken();
    if (token) await (await import('./notify')).silentlyRefreshPush(token);
  } catch { /* 실패는 조용히 */ }
}

function cloudConfigured(): boolean {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && c.appId);
}

export function useAuth() {
  const cloudOn = useRef(cloudConfigured()).current;
  const wasSeen = useRef(cloudOn && !!localStorage.getItem(SEEN_KEY)).current;
  /* 일정 링크(#e=)·공지 알림(#notice)으로 들어왔다 — "로그인한 적 있음" 표시(SEEN_KEY)가 없어도 저장된 로그인을 먼저 찾아본다.
     표시가 지워졌는데 Firebase 의 로그인은 남아 있으면(저장소 일부만 지워짐 등) 그동안 복원 없이 로그인 창부터 떴다
     — "알림·링크로 들어오면 자동 로그인이 안 된다"(2026-10-27 사용자 보고). 로그인 안 한 사람은 어차피 로그인에 SDK 가 필요하다 */
  const linkEntry = useRef(cloudOn && /^#(e=\d|notice$)/.test(location.hash)).current;
  const wake = wasSeen || linkEntry;
  /* 카카오에서 막 돌아온 주소면 토큰으로 로그인하는 동안도 "복원 중"이다 */
  /* cloudOn 과 무관 — Firebase 설정이 없어도 돌아온 code·state 는 주소에서 지운다 */
  const kakaoBack = useRef((readKakaoReturn(location.search) !== null || new URLSearchParams(location.search).has('code'))).current;
  const inKakaoApp = useRef(isKakaoInApp(navigator.userAgent)).current;
  const [me, setMe] = useState<Me | null>(null);
  /* 동호회 멤버 상태 — 서버가 이 기능을 모르면(404) 계속 null 이고 화면은 동호회를 숨긴다 */
  const [member, setMember] = useState<MeDto | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  /* 이 uid 의 멤버 확인이 한 번 끝났다(성공·실패·404 모두). 로그인 직후 첫 렌더엔 false — memberLoading 은 effect 뒤에야 켜져 그 틈을 못 막는다. */
  const [checkedUid, setCheckedUid] = useState('');
  const [legacyOpen, setLegacyOpen] = useState(false);
  const kakaoHandled = useRef(false);
  const pushedFor = useRef('');
  /* Firebase가 저장된 로그인 상태를 IndexedDB에서 복원하는 동안(수백ms~1초)
     me는 아직 null이지만 "로그인 안 함"과는 다르다 — 이 구분이 없으면
     새로고침 직후 잠깐 "로그인" 버튼이 떴다가 돌아오는 깜빡임이 실제로
     "로그아웃됐다"는 오해를 준다. 예전에 로그인한 적 있을 때만(SEEN_KEY)
     로딩 상태로 시작한다 — 한 번도 로그인 안 한 사람은 애초에 기다릴 게 없다. */
  const [authLoading, setAuthLoading] = useState(wake || kakaoBack);
  /* 저장된 로그인을 찾다가 SDK 를 못 받았다(느린 망·차단) — 링크로 들어온 사람에게 로그인 창 대신 "다시 열어 주세요"를 보이게 */
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* 계정 자리의 "카카오·구글 연결" 실패 문구 — 로그인 창의 err 와 섞이지 않게 따로 둔다 */
  const [linkErr, setLinkErr] = useState('');
  /* 연결(link) 왕복에서 돌아와 되살릴 화면 — SchedulerPage 가 한 번 받아 그 화면으로 옮긴다 */
  const [returnView, setReturnView] = useState<{ view: string } | null>(null);
  /* 이 계정에 붙은 로그인 수단('password'·'google.com') — 아이디 계정인지, 구글이 붙었는지 */
  const [providerIds, setProviderIds] = useState<string[]>([]);
  /* 방금 로그인했다 — 멤버 상태가 오면 가입 신청 단계를 로그인 창 안에서 이어서 보여 준다 */
  const afterLogin = useRef(false);

  /* 예전에 로그인한 적이 있을 때만 SDK를 미리 깨운다 — 한 번도 안 쓴 사람에게
     짐을 지우지 않기 위해서다 (index.html의 SEEN_KEY 가드). */
  useEffect(() => {
    if (!wake) return;
    cloud().then(C => C.watch(u => {
      setMe(u); setAuthLoading(false);
      /* 복원된 로그인이 있으면 표시도 맞춘다 — 다음부터는 링크가 아니어도 바로 복원한다 */
      if (u) { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* 시크릿 창 등 */ } }
    }))
      .catch(e => { console.warn('로그인 복귀 실패:', e); setRestoreFailed(true); setAuthLoading(false); });
  }, [wake]);

  /* 멤버 상태 — 로그인 상태가 바뀔 때마다 서버에 묻는다. 실패·404 는 조용히 null */
  const loadMember = useCallback(async (): Promise<MeDto | null> => {
    try {
      const token = await (await cloud()).idToken();
      return token ? await getMe(token) : null;
    } catch (e) {
      console.warn('가입 상태 불러오기 실패:', e);
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
        /* 창 기록(투어 등)이 이미 쌓였어도 그 아래 기록까지 정리되게 backStack 으로 */
        replaceUrl: url => hist.replace(null, url),
        endTrip: endKakaoTrip,
        kakaoLogin,
        kakaoLink,
        signInWithCustom: t => cloud().then(C => C.signInWithCustom(t)).then(m => { afterLogin.current = true; setMe(m); return m; }),
        idToken: () => cloud().then(C => C.idToken()),
        redirectUri: appRedirectUri(location),
        cloudOn,
      });
      if ((r.kind === 'linked' || r.kind === 'error') && r.view) setReturnView({ view: r.view });
      if (r.kind === 'signedIn') {
        localStorage.setItem(SEEN_KEY, '1');
        /* 이후 다른 탭의 로그아웃 등도 따라가도록 상태 구독을 건다 */
        cloud().then(C => C.watch(u => setMe(u))).catch(() => { /* noop */ });
      } else if (r.kind === 'linked') {
        setMember(await loadMember());
        cloud().then(C => C.providers()).then(setProviderIds).catch(() => { /* noop */ });
      } else if (r.kind === 'error') {
        /* 연결 실패, 또는 이미 로그인한 사람의 실패는 로그인 창이 아니라 계정 자리 연결 상자에 보인다 */
        if (r.mode === 'link' || (!r.mode && !!localStorage.getItem(SEEN_KEY))) setLinkErr(r.message);
        else { setErr(r.message); setOpen(true); }
      }
      setAuthLoading(false);
    })();
  }, [kakaoBack, cloudOn, loadMember]);

  const uid = me?.uid ?? '';
  useEffect(() => {
    if (!uid) { setMember(null); setMemberLoading(false); pushedFor.current = ''; return; }
    let live = true;
    setMemberLoading(true);
    loadMember().then(m => {
      if (!live) return;
      setMember(m); setMemberLoading(false); setCheckedUid(uid);
      if (afterLogin.current) {
        /* 승인됐거나 서버가 동호회를 모르면 창을 닫고, 아니면 가입·대기 안내로 이어 간다 */
        afterLogin.current = false;
        setOpen(!!m && m.status !== 'APPROVED');
      }
    });
    cloud().then(C => C.providers()).then(p => { if (live) setProviderIds(p); }).catch(() => { /* noop */ });
    /* 기기 등록 — 권한이 이미 허용된 경우에만 조용히 올린다. 로그인당 한 번 */
    if (pushedFor.current !== uid) {
      pushedFor.current = uid;
      void refreshPushQuietly();
    }
    return () => { live = false; };
  }, [uid, loadMember]);

  /* 승인 직후에도 조용히 등록한다(§4.10 "기기 등록 시점") — 로그인 때 올린 건 승인 전이었다.
     같은 사람의 상태가 승인 전(대기 등) → 승인으로 바뀔 때만. 처음 받은 상태가 승인이면(null → 승인) 위의 로그인 때 등록이 맡는다 */
  const memberStatus = member?.status ?? null;
  const prevStatus = useRef<{ uid: string; status: MeDto['status'] | null }>({ uid: '', status: null });
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = { uid, status: memberStatus };
    if (!uid || memberStatus !== 'APPROVED' || prev.uid !== uid || prev.status === null || prev.status === 'APPROVED') return;
    void refreshPushQuietly();
  }, [uid, memberStatus]);

  /* 로그인 창이 열리면 Firebase SDK 를 미리 깨운다 — 구글 팝업이 클릭 직후 열려야 막히지 않는다 */
  useEffect(() => {
    if (!open || !cloudOn) return;
    void cloud().then(C => C.warm()).catch(() => { /* 준비 실패는 클릭할 때 다시 안내한다 */ });
  }, [open, cloudOn]);

  const refreshMember = useCallback(async () => {
    setMemberLoading(true);
    setMember(await loadMember());
    setMemberLoading(false);
  }, [loadMember]);

  /* 로딩 표시 없이 조용히 다시 묻는다 — memberLoading 을 켜면 로그인 창·화면이 "확인 중"으로 깜빡이고
     대기 패널이 사라진다. 실패(null)면 이전 member 를 그대로 두고, 성공 응답만 반영한다. */
  const recheckMember = useCallback(async (): Promise<MeDto | null> => {
    const m = await loadMember();
    if (m) setMember(m);
    return m;
  }, [loadMember]);

  /* 승인 대기 중에는 창으로 돌아올 때마다 다시 묻는다 — 운영진이 승인해도 새로 고치기 전엔 몰랐다 */
  const pending = member?.status === 'PENDING';
  useEffect(() => {
    if (!pending) return;
    /* 보이게 되면서 포커스도 오니 두 이벤트가 겹쳐도 한 번만 묻는다 */
    let inflight = false;
    const check = () => {
      if (inflight) return;
      inflight = true;
      void recheckMember().finally(() => { inflight = false; });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const onFocus = check;
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [pending, recheckMember]);

  const openAuth = useCallback(() => {
    setErr(''); setOpen(true);
  }, []);
  /* 닫으면 "로그인 직후 이어 열기"도 취소한다 — 안 그러면 member 가 늦게 와서 다시 튀어나온다 */
  const closeAuth = useCallback(() => { afterLogin.current = false; setOpen(false); setPw(''); }, []);

  const submit = useCallback(async () => {
    const cleanId = id.trim().toLowerCase();
    setId(cleanId);
    const C = await cloud().catch(() => null);
    if (!C) { setErr('로그인을 준비하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    if (!C.ID_RE.test(cleanId)) { setErr('아이디 형식이 맞지 않아요. ' + C.ID_HINT); return; }
    if (pw.length < 6) { setErr('비밀번호는 6자 이상으로 해 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      const result = await C.signIn(cleanId, pw);
      afterLogin.current = true;
      setMe(result);
      setAuthLoading(false);
      localStorage.setItem(SEEN_KEY, '1');
      setPw('');
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
    setLinkErr('');
    if (!cloudOn) { setLinkErr('로그인이 아직 설정되지 않았어요.'); return; }
    const clientId = window.KAKAO_CLIENT_ID;
    if (!clientId) { setLinkErr('카카오 로그인이 아직 설정되지 않았어요.'); return; }
    const state = beginKakaoTrip('link', location.hash, undefined, new URLSearchParams(location.search).get('view') ?? '');
    location.assign(kakaoAuthUrl(clientId, appRedirectUri(location), state));
  }, [cloudOn]);

  const loginGoogle = useCallback(async () => {
    /* 이미 받아 둔 모듈이면 await 없이 바로 가서 클릭의 사용자 활성화가 살아 있게 한다 */
    const C = cloudMod ?? await cloud().catch(() => null);
    if (!C) { setErr('로그인을 준비하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      const result = await C.signInWithGoogle();
      afterLogin.current = true;
      setMe(result);
      setAuthLoading(false);
      localStorage.setItem(SEEN_KEY, '1');
      setPw('');
    } catch (e) {
      setErr(C.say(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const linkGoogle = useCallback(async () => {
    const C = await cloud().catch(() => null);
    if (!C) { setLinkErr('로그인을 준비하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
    setLinkErr('');
    try {
      await C.linkGoogle();
      setProviderIds(await C.providers());
    } catch (e) {
      setLinkErr(C.say(e));
    }
  }, []);

  /* 동호회 가입 신청(프로필 함께, §4.11). 실패는 호출한 화면이 sayClub 으로 보여 주도록 그대로 던진다 */
  const join = useCallback(async (nickname: string, profile: ProfileDto) => {
    const token = await (await cloud()).idToken();
    if (!token) throw new Error('로그인해 주세요.');
    setMember(await joinClub(nickname, profile, token));
  }, []);

  const logout = useCallback(async () => {
    try { (await cloud()).signOut(); } catch { /* noop */ }
    localStorage.removeItem(SEEN_KEY);
    setMe(null);
    setProviderIds([]); setLinkErr('');
    setAuthLoading(false);
  }, []);

  return {
    cloudOn, me, authLoading, open, id, setId, pw, setPw, err, busy, openAuth, closeAuth, submit, logout,
    member, memberLoading, memberChecked: !!uid && checkedUid === uid, refreshMember, recheckMember, loginKakao, loginGoogle, linkKakao, linkGoogle, join,
    /* 프로필 고치기(§4.11) 창이 서버가 준 MeDto 를 넣는다 — 요청은 그 창(지연 청크)이 한다 */
    adoptMember: setMember,
    inKakaoApp, legacyOpen, setLegacyOpen, linkErr, returnView, providerIds: uid ? providerIds : [],
    restoreFailed,
  };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
