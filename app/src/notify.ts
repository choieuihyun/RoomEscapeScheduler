/* F-16 웹 푸시 등록 — 서비스워커 등록 + FCM 토큰 발급 + 서버에 주소 올리기.
   cloud.ts는 토큰을 얻을 때만 지연 로드한다(로그인 전 0바이트 불변식, §4.34).
   server.ts는 이미 useLoadModal.ts가 정적 import해서 항상 번들에 있으므로
   여기서도 정적 import한다(동적으로 해봤자 청크가 안 갈린다). */
import { pushSupport, type PushEnv, type PushSupport } from './pushState';
import { registerDevice } from './server';

let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

/* 콘솔 → 프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서. 비밀 아님
   (브라우저가 알림 주소를 만들 때 쓰는 공개키 — firebase-config.js의
   apiKey와 같은 성격). */
const VAPID_KEY = 'BLVEi-qgw6nf-6sx9m0XXyiOYZZaTE8-01xljL1dRhoqlGxoieMEm7FZKa88LH0zMNswWJ0S1eu3HU5D4I96mp0';

/* 이 기기의 브라우저 값을 모아 pushState.ts 판단에 넘긴다(§4.10). 아이폰 사파리는 홈 화면에 추가해
   "설치된 앱"으로 열어야만 푸시가 오고(iOS 16.4+), 카카오톡 안 브라우저는 다른 브라우저로 열어야 한다. */
export function pushEnv(): PushEnv {
  return {
    ua: navigator.userAgent,
    standalone: (navigator as unknown as { standalone?: boolean }).standalone === true
      || window.matchMedia('(display-mode: standalone)').matches,
    hasNotification: 'Notification' in window,
    hasSW: 'serviceWorker' in navigator,
    touchPoints: navigator.maxTouchPoints || 0,
  };
}

export const currentPushSupport = (): PushSupport => pushSupport(pushEnv());

export type PushResult = { ok: true } | { ok: false; reason: string };

/* 이 기기가 서버에 알림 주소를 올리면 window 에 알린다 — 앱 안 알림(onMessage)을 다시 걸고, 내 정보 카드가 상태를 다시 본다.
   권한(Notification.permission)은 바뀌어도 알려 주지 않아서, "알림 켜기" 뒤 같은 화면에서 테스트 알림을 보내면 아무것도 안 뜬다. */
export const PUSH_READY_EVT = 'flod:push-ready';

/* 이번 페이지에서 받은 기기 토큰과, 진행 중인 등록. 로그인할 때의 조용한 등록과 내 정보 카드의 상태 확인이 동시에 돌면
   카드가 등록 전 상태(꺼짐)를 잠깐 보이거나 안내가 잘못 뜬다 — 카드는 진행 중인 등록을 기다린다. */
let lastToken: string | null = null;
let inflight: Promise<PushResult> | null = null;

/* base(§3 서브패스) 밑에서 서빙되므로 BASE_URL을 붙인다 — 안 그러면
   흰 화면 버그와 같은 종류의 404가 재발한다. 같은 주소로 다시 불러도 새로 깔지 않는다. */
const swRegister = () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`);

function registerAndSend(authToken: string): Promise<PushResult> {
  inflight ??= (async (): Promise<PushResult> => {
    try {
      const swReg = await swRegister();
      const C = await cloud();
      const deviceToken = await C.getMessagingToken(VAPID_KEY, swReg);
      if (!deviceToken) return { ok: false, reason: '알림 등록이 안 됐어요.' };
      await registerDevice(deviceToken, authToken);
      lastToken = deviceToken;
      dispatchEvent(new Event(PUSH_READY_EVT));
      return { ok: true };
    } catch (e) {
      console.warn('푸시 등록 실패:', e);
      return { ok: false, reason: '알림 등록이 안 됐어요.' };
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/* 이 기기의 FCM 토큰. 권한을 절대 묻지 않는다 — FCM getToken 은 권한이 'default' 면 스스로 물어서, 허용됐을 때만 부른다.
   받을 수 없는 브라우저·허용 안 됨·발급 실패면 null. */
export async function currentDeviceToken(): Promise<string | null> {
  if (currentPushSupport() !== 'ok' || Notification.permission !== 'granted') return null;
  if (inflight) await inflight;
  if (lastToken) return lastToken;
  try {
    return await (await cloud()).getMessagingToken(VAPID_KEY, await swRegister());
  } catch (e) {
    console.warn('기기 토큰 확인 실패:', e);
    return null;
  }
}

/* 앱 탭이 보이는 동안 온 푸시는 서비스 워커가 알림을 띄우지 않고 이 창에 넘긴다 — 받아서 앱 안 띠로 보인다.
   허용돼 있을 때만 메시징 SDK 를 받는다(부르는 쪽이 로그인 여부를 본다). 끊는 함수를 돌려준다. */
export async function listenForegroundPush(cb: (payload: unknown) => void): Promise<(() => void) | null> {
  if (currentPushSupport() !== 'ok' || Notification.permission !== 'granted') return null;
  return (await cloud()).onForegroundMessage(cb);
}

/* 감시를 처음 걸 때(=벨을 처음 누를 때)만 부른다. 페이지를 열자마자 물으면
   대부분 거절하고 브라우저가 다시 안 물어본다 — 그래서 이 함수는 반드시
   버튼 클릭 콜백 안에서만 호출한다. about 은 거절했을 때 문구를 고른다(기본 빈자리). */
export async function requestPushPermission(authToken: string, about: 'slot' | 'event' = 'slot'): Promise<PushResult> {
  const support = currentPushSupport();
  if (support === 'kakao-inapp') return { ok: false, reason: '카카오톡 안에서는 알림을 받을 수 없어요 — 다른 브라우저로 열어 주세요.' };
  if (support === 'ios-install') return { ok: false, reason: '아이폰은 홈 화면에 추가해야 알림이 와요.' };
  if (support === 'unsupported') return { ok: false, reason: '이 브라우저에선 알림을 받을 수 없어요.' };
  if (Notification.permission === 'denied') {
    return { ok: false, reason: '알림이 차단돼 있어요 — 브라우저 설정에서 허용해 주세요.' };
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  /* 부르는 쪽에 맞는 말 — 빈자리 벨은 빈자리를, 일정 알림 안내·내 정보 "알림 켜기"는 일정 소식을 */
  if (perm !== 'granted') return { ok: false, reason: `알림을 허용해야 ${about === 'event' ? '일정 소식을' : '빈자리를'} 알려드릴 수 있어요.` };
  return registerAndSend(authToken);
}

/* 이미 허용돼 있으면 앱을 열 때마다 조용히 토큰을 다시 올린다 — 토큰은
   브라우저가 알아서 갱신하므로 "한 번 등록하고 끝" 이면 어느 날부터
   알림이 조용히 끊긴다(작업명세서 §4.5 ㉡). 권한을 새로 묻지는 않는다. */
export async function silentlyRefreshPush(authToken: string): Promise<void> {
  if (currentPushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  await registerAndSend(authToken);
}
