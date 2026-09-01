import { useCallback, useEffect, useRef, useState } from 'react';
import type { Me } from './cloud';

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
  const [me, setMe] = useState<Me | null>(null);
  /* Firebase가 저장된 로그인 상태를 IndexedDB에서 복원하는 동안(수백ms~1초)
     me는 아직 null이지만 "로그인 안 함"과는 다르다 — 이 구분이 없으면
     새로고침 직후 잠깐 "로그인" 버튼이 떴다가 돌아오는 깜빡임이 실제로
     "로그아웃됐다"는 오해를 준다. 예전에 로그인한 적 있을 때만(SEEN_KEY)
     로딩 상태로 시작한다 — 한 번도 로그인 안 한 사람은 애초에 기다릴 게 없다. */
  const [authLoading, setAuthLoading] = useState(wasSeen);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'in' | 'up'>('in');
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

  const openAuth = useCallback((m: 'in' | 'up') => {
    setMode(m); setErr(''); setOpen(true);
  }, []);
  const closeAuth = useCallback(() => { setOpen(false); setPw(''); }, []);

  const submit = useCallback(async () => {
    const cleanId = id.trim().toLowerCase();
    setId(cleanId);
    const C = await cloud().catch(() => null);
    if (!C) { setErr('로그인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); return; }
    if (!C.ID_RE.test(cleanId)) { setErr('아이디 형식이 맞지 않습니다 — ' + C.ID_HINT); return; }
    if (pw.length < 6) { setErr('비밀번호는 6자 이상이어야 합니다.'); return; }
    setBusy(true); setErr('');
    try {
      const result = mode === 'up' ? await C.signUp(cleanId, pw) : await C.signIn(cleanId, pw);
      setMe(result);
      setAuthLoading(false);
      localStorage.setItem(SEEN_KEY, '1');
      setOpen(false); setPw('');
    } catch (e) {
      setErr(C.say(e));
    } finally {
      setBusy(false);
    }
  }, [id, pw, mode]);

  const logout = useCallback(async () => {
    try { (await cloud()).signOut(); } catch { /* noop */ }
    localStorage.removeItem(SEEN_KEY);
    setMe(null);
    setAuthLoading(false);
  }, []);

  return { cloudOn, me, authLoading, open, mode, id, setId, pw, setPw, err, busy, openAuth, closeAuth, submit, logout };
}

export type UseAuthReturn = ReturnType<typeof useAuth>;
