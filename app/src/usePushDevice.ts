import { useCallback, useEffect, useRef, useState } from 'react';
import { currentDeviceToken, currentPushSupport, PUSH_READY_EVT, requestPushPermission } from './notify';
import { guideVariant, isIOS, pushCard, shouldAutoGuide, type GuideVariant, type PushCard } from './pushState';
import { deviceStatus, isMissingApi, pushTest, pushTestMessage, sayClub } from './server';
import { showToast } from './toast';

/* 이 기기 알림 (작업명세서 §4.10, 계획 Task 11) — 내 정보 카드와 알림 켜기 안내(PushGuide)가 같이 쓴다.
   기기 토큰·서버 확인은 내 정보 화면에 들어왔을 때만 한다(그러려면 메시징 SDK 를 받아야 한다). */

const SEEN_KEY = 'flod.pushguide.seen';
const readSeen = (): boolean => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* 시크릿 창 등 — 이번에만 안 남는다 */ } };
const permNow = (): NotificationPermission | null => ('Notification' in window ? Notification.permission : null);
const idToken = async () => (await import('./cloud')).idToken();

export function usePushDevice(on: boolean, active: boolean) {
  /* 브라우저 종류는 페이지가 떠 있는 동안 바뀌지 않는다 */
  const [support] = useState(currentPushSupport);
  const [ios] = useState(() => isIOS(navigator.userAgent, navigator.maxTouchPoints || 0));
  const [perm, setPerm] = useState(permNow);
  /* 서버에 이 기기가 등록돼 있는지. null = 아직 모름 */
  const [registered, setRegistered] = useState<boolean | null>(null);
  /* 5단계 전 서버(본문 없는 404)면 'off' — 테스트 알림 단추를 숨기고 상태는 권한만으로 본다 */
  const [api, setApi] = useState<'on' | 'off'>('on');
  const [busy, setBusy] = useState<'enable' | 'test' | null>(null);
  const [guide, setGuide] = useState<GuideVariant | null>(null);

  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const my = ++seq.current;
    const p = permNow();
    setPerm(p);
    if (support !== 'ok' || p !== 'granted') { setRegistered(null); return; }
    const dev = await currentDeviceToken();
    const t = dev ? await idToken() : null;
    if (my !== seq.current) return;
    if (!dev || !t) { setRegistered(false); return; }
    try {
      const r = await deviceStatus(dev, t);
      if (my === seq.current) { setRegistered(r.registered); setApi('on'); }
    } catch (e) {
      if (my !== seq.current) return;
      /* 서버가 모르거나(404) 잠깐 안 되면 등록 여부를 알 수 없다 — 허용돼 있으면 로그인 때 조용히 등록했으니 켜짐으로 본다 */
      if (isMissingApi(e)) setApi('off');
      else console.warn('기기 알림 상태 확인 실패:', e);
      setRegistered(true);
    }
  }, [support]);

  /* 내 정보 화면에 들어올 때, 그 화면에서 탭으로 돌아올 때(브라우저 설정에서 권한을 바꿨을 수 있다), 등록이 끝났을 때 다시 본다 */
  useEffect(() => {
    if (!on || !active) return;
    void Promise.resolve().then(refresh); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onReady = () => void refresh();
    document.addEventListener('visibilitychange', onVis);
    addEventListener(PUSH_READY_EVT, onReady);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener(PUSH_READY_EVT, onReady);
    };
  }, [on, active, refresh]);

  /* 반드시 단추 클릭 안에서 부른다 — 권한 창은 사용자 동작 안에서만 뜬다 */
  const enable = useCallback(async (): Promise<boolean> => {
    setBusy('enable');
    try {
      const t = await idToken();
      if (!t) { showToast('로그인해 주세요.'); return false; }
      const r = await requestPushPermission(t);
      setPerm(permNow());
      if (!r.ok) { showToast(r.reason); return false; }
      showToast('알림을 켰어요.');
      setRegistered(true);
      return true;
    } finally {
      setBusy(null);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy('test');
    try {
      const t = await idToken();
      if (!t) { showToast('로그인해 주세요.'); return; }
      const r = await pushTest(t);
      showToast(pushTestMessage(r));
      if (r.devices === 0 || r.delivered === 0) void refresh();
    } catch (e) {
      if (isMissingApi(e)) setApi('off');
      else showToast(sayClub(e)); // 429 TOO_SOON 은 서버 문구 그대로
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  /* 저절로 띄우기(이 기기에서 한 번) — 부르는 쪽이 다른 창·링크와 겹치지 않을 때 부른다 */
  const autoShown = useRef(false);
  const maybeAutoGuide = useCallback(() => {
    if (autoShown.current || !shouldAutoGuide(readSeen(), support, permNow())) return;
    autoShown.current = true;
    markSeen();
    setGuide(guideVariant(support, permNow()));
  }, [support]);
  const openGuide = useCallback((v?: GuideVariant) => setGuide(v ?? guideVariant(support, permNow())), [support]);
  const closeGuide = useCallback(() => setGuide(null), []);

  const card: PushCard | null = pushCard(support, perm, registered);
  return { support, ios, card, api, busy, enable, test, guide, openGuide, closeGuide, maybeAutoGuide };
}

export type UsePushDeviceReturn = ReturnType<typeof usePushDevice>;
