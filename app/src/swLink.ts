/* 알림을 눌렀을 때 열 주소 (작업명세서 §4.10, 계획 Task 10).
   서비스 워커(public/firebase-messaging-sw.js)는 번들 밖의 그냥 JS 라 이 파일을 불러올 수 없다 —
   같은 pickLink 를 그 파일에 그대로 옮겨 두고, swLink.test.ts 가 두 쪽을 같은 표로 돌려 어긋나지 않게 지킨다. */
import { readEventHash } from './eventLink';

type Bag = Record<string, unknown>;
const bag = (v: unknown): Bag | null => (v && typeof v === 'object' ? (v as Bag) : null);

/* 알림의 data 에서 링크를 찾는다. 차례: 우리가 띄운 알림의 data.link → SDK 가 띄운 알림(data.FCM_MSG)의
   data.link → fcmOptions.link → notification.click_action. 앱 주소(root) 밖이거나 없으면 root. */
export function pickLink(data: unknown, root: string): string {
  const d = bag(data);
  const fcm = bag(d?.FCM_MSG);
  const tries = [
    d?.link,
    bag(fcm?.data)?.link,
    bag(fcm?.fcmOptions)?.link,
    bag(fcm?.notification)?.click_action,
  ];
  for (const t of tries) {
    if (typeof t !== 'string' || !t) continue;
    try {
      const url = new URL(t, root).href;
      if (url.startsWith(root)) return url;
    } catch { /* 못 읽는 주소는 건너뛴다 */ }
  }
  return root;
}

/* 서비스 워커가 창을 옮기지 못했을 때(navigate 거절) 보내는 `{ type: 'open', link }` 에서 일정 id 를 꺼낸다.
   Firebase SDK 도 창에 메시지를 보내므로 type 이 다르면 무시한다. */
export function swOpenId(msg: unknown): number | null {
  const m = bag(msg);
  if (m?.type !== 'open' || typeof m.link !== 'string') return null;
  const i = m.link.indexOf('#');
  return i < 0 ? null : readEventHash(m.link.slice(i));
}
