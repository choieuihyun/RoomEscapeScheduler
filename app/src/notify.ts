/* F-16 웹 푸시 등록 — 서비스워커 등록 + FCM 토큰 발급 + 서버에 주소 올리기.
   cloud.ts는 토큰을 얻을 때만 지연 로드한다(로그인 전 0바이트 불변식, §4.34).
   server.ts는 이미 useLoadModal.ts가 정적 import해서 항상 번들에 있으므로
   여기서도 정적 import한다(동적으로 해봤자 청크가 안 갈린다). */
import { registerDevice } from './server';

let cloudMod: typeof import('./cloud') | null = null;
const cloud = async () => (cloudMod ??= await import('./cloud'));

/* 콘솔 → 프로젝트 설정 → Cloud Messaging → 웹 푸시 인증서. 비밀 아님
   (브라우저가 알림 주소를 만들 때 쓰는 공개키 — firebase-config.js의
   apiKey와 같은 성격). */
const VAPID_KEY = 'BLVEi-qgw6nf-6sx9m0XXyiOYZZaTE8-01xljL1dRhoqlGxoieMEm7FZKa88LH0zMNswWJ0S1eu3HU5D4I96mp0';

/* 아이폰 사파리는 홈 화면에 추가해 "설치된 앱"으로 열어야만 푸시가 온다
   (작업명세서 §4.5 ㉡, iOS 16.4+). 크롬/안드로이드/데스크톱은 해당 없음. */
export function needsIOSInstall(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && !standalone;
}

export type PushResult = { ok: true } | { ok: false; reason: string };

async function registerAndSend(authToken: string): Promise<PushResult> {
  try {
    /* base(§3 서브패스) 밑에서 서빙되므로 BASE_URL을 붙인다 — 안 그러면
       흰 화면 버그와 같은 종류의 404가 재발한다. */
    const swReg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`);
    const C = await cloud();
    const deviceToken = await C.getMessagingToken(VAPID_KEY, swReg);
    if (!deviceToken) return { ok: false, reason: '알림 주소를 만들지 못했습니다.' };
    await registerDevice(deviceToken, authToken);
    return { ok: true };
  } catch (e) {
    console.warn('푸시 등록 실패:', e);
    return { ok: false, reason: '푸시 등록에 실패했습니다.' };
  }
}

/* 감시를 처음 걸 때(=벨을 처음 누를 때)만 부른다. 페이지를 열자마자 물으면
   대부분 거절하고 브라우저가 다시 안 물어본다 — 그래서 이 함수는 반드시
   버튼 클릭 콜백 안에서만 호출한다. */
export async function requestPushPermission(authToken: string): Promise<PushResult> {
  if (needsIOSInstall()) return { ok: false, reason: '아이폰은 홈 화면에 추가해야 알림이 옵니다.' };
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, reason: '이 브라우저는 푸시 알림을 지원하지 않습니다.' };
  }
  if (Notification.permission === 'denied') {
    return { ok: false, reason: '알림이 차단돼 있어요 — 브라우저 설정에서 허용해 주세요.' };
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: '알림을 허용해야 빈자리를 알려드릴 수 있어요.' };
  return registerAndSend(authToken);
}

/* 이미 허용돼 있으면 앱을 열 때마다 조용히 토큰을 다시 올린다 — 토큰은
   브라우저가 알아서 갱신하므로 "한 번 등록하고 끝" 이면 어느 날부터
   알림이 조용히 끊긴다(작업명세서 §4.5 ㉡). 권한을 새로 묻지는 않는다. */
export async function silentlyRefreshPush(authToken: string): Promise<void> {
  if (needsIOSInstall()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  await registerAndSend(authToken);
}
