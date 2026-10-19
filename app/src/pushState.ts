/* 이 기기에서 알림을 받을 수 있는지와 상태 글자 (작업명세서 §4.10, 계획 Task 10·11).
   브라우저 값은 부르는 쪽(notify.ts pushEnv)이 모아 넘기고, 여기는 판단만 한다 — 단위 테스트용. */
import { isKakaoInApp } from './kakao';

export type PushSupport = 'ok' | 'ios-install' | 'kakao-inapp' | 'unsupported';

export interface PushEnv {
  ua: string;
  /* 홈 화면에 추가한 앱으로 열렸는지(navigator.standalone 또는 display-mode: standalone) */
  standalone: boolean;
  hasNotification: boolean;
  hasSW: boolean;
  /* 아이패드 사파리는 맥 UA 를 보낸다 — 터치 지점 수로 가려낸다. 없으면 0 */
  touchPoints?: number;
}

export const isIOS = (ua: string, touchPoints = 0): boolean =>
  /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && touchPoints > 1);

/* 차례가 중요하다: 카카오톡 안 브라우저면 아이폰이어도 먼저 "다른 브라우저로 열기",
   아이폰 사파리 탭엔 Notification 이 아예 없어서 기능 검사보다 홈 화면 안내를 먼저 본다. */
export function pushSupport(env: PushEnv): PushSupport {
  if (isKakaoInApp(env.ua)) return 'kakao-inapp';
  if (isIOS(env.ua, env.touchPoints) && !env.standalone) return 'ios-install';
  if (!env.hasNotification || !env.hasSW) return 'unsupported';
  return 'ok';
}

export type PermissionLabel = '켜짐' | '꺼짐' | '거부됨';

/* 켜짐 = 허용 + 서버에 이 기기가 등록됨. 허용만 됐고 등록이 안 됐으면 꺼짐이다(알림이 안 온다). */
export function permissionLabel(perm: NotificationPermission, registered: boolean): PermissionLabel {
  if (perm === 'denied') return '거부됨';
  return perm === 'granted' && registered ? '켜짐' : '꺼짐';
}
