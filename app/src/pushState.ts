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

/* 내 정보 "이 기기 알림" 카드의 상태(§4.10 화면 쪽 약속: 켜짐 / 꺼짐 / 이 브라우저에선 불가).
   알림을 받을 수 없는 브라우저면 그 까닭(pushSupport), 아니면 permissionLabel. 허용됐는데 등록 여부를 아직 모르면 null(확인 중).
   perm 은 Notification 이 없으면 null(그땐 support 가 이미 'ok' 가 아니다). */
export type PushCard = PermissionLabel | Exclude<PushSupport, 'ok'>;
export function pushCard(support: PushSupport, perm: NotificationPermission | null, registered: boolean | null): PushCard | null {
  if (support !== 'ok') return support;
  if (perm === 'granted' && registered === null) return null;
  return permissionLabel(perm ?? 'default', registered ?? false);
}

/* 알림 켜기 안내(PushGuide)에 보일 내용. 카카오톡 안이면 "다른 브라우저로 열기"부터(아이폰이면 이어서 홈 화면 단계),
   아이폰 사파리 탭이면 홈 화면 세 단계, 거부됐으면 설정 안내, 그 밖엔 "알림 켜기" 하나. */
export type GuideVariant = 'kakao' | 'ios' | 'unsupported' | 'denied' | 'enable';
export function guideVariant(support: PushSupport, perm: NotificationPermission | null): GuideVariant {
  if (support === 'kakao-inapp') return 'kakao';
  if (support === 'ios-install') return 'ios';
  if (support === 'unsupported') return 'unsupported';
  return perm === 'denied' ? 'denied' : 'enable';
}

/* 안내를 저절로 띄울지 — 이 기기에서 한 번(seen), 알림이 켜져 있을 것 같지 않을 때만.
   허용돼 있으면 로그인할 때 조용히 등록되므로(silentlyRefreshPush) 켜짐으로 보고 띄우지 않는다 —
   이 판단에 기기 토큰·서버 확인을 쓰지 않는다(그러려면 앱을 열자마자 메시징 SDK 를 받아야 한다). */
export function shouldAutoGuide(seen: boolean, support: PushSupport, perm: NotificationPermission | null): boolean {
  return !seen && !(support === 'ok' && perm === 'granted');
}
