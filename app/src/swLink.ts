/* 알림을 눌렀을 때 열 주소 (작업명세서 §4.10, 계획 Task 10).
   서비스 워커(public/firebase-messaging-sw.js)는 번들 밖의 그냥 JS 라 이 파일을 불러올 수 없다 —
   같은 pickLink·clickTarget 을 그 파일에 그대로 옮겨 두고, swLink.test.ts 가 두 쪽을 같은 표로 돌려 어긋나지 않게 지킨다. */
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

/* 이미 열린 앱 창에서 링크를 어떻게 열지. 링크를 그대로 navigate 하면 지금 주소(`?view=calc` 등)와 달라 새로 불러온다 —
   - 일정 링크(`#e=<id>`)가 아니면(빈자리 = 앱 주소) null: 창을 앞으로 가져오기만(예전 SDK 동작과 같다).
   - 지금 주소의 해시만 바꾼 주소: 새로 불러오지 않고 hashchange 로 연다.
   - 이미 그 해시면 'message': navigate 해도 아무 일이 없어 앱에 메시지로 알린다. */
export function clickTarget(clientUrl: string, link: string): string | 'message' | null {
  const i = link.indexOf('#');
  const hash = i < 0 ? '' : link.slice(i);
  if (!/^#e=\d{1,15}$/.test(hash)) return null;
  const u = new URL(clientUrl);
  if (u.hash === hash) return 'message';
  u.hash = hash;
  return u.href;
}

/* 서비스 워커가 창을 옮기지 못했을 때(navigate 거절) 보내는 `{ type: 'open', link }` 에서 일정 id 를 꺼낸다.
   Firebase SDK 도 창에 메시지를 보내므로 type 이 다르면 무시한다. */
export function swOpenId(msg: unknown): number | null {
  const m = bag(msg);
  if (m?.type !== 'open' || typeof m.link !== 'string') return null;
  const i = m.link.indexOf('#');
  return i < 0 ? null : readEventHash(m.link.slice(i));
}

/* 앱 탭이 보이는 동안 온 푸시(onMessage)를 앱 안 띠로 보일 내용. 서버가 보내는 알림은 notification 에 제목·본문을 담고,
   data 만 온 메시지는 서비스 워커(onBackgroundMessage)와 같은 기본 문구를 쓴다. 링크(data.link → fcmOptions.link)에
   `#e=<id>` 가 있으면 그 일정 id — "열기" 단추가 붙는다. 보일 글이 하나도 없으면 null. */
export interface PushBannerData { title: string; body: string; eventId: number | null }
export function bannerOf(payload: unknown): PushBannerData | null {
  const p = bag(payload);
  if (!p) return null;
  const n = bag(p.notification), d = bag(p.data), o = bag(p.fcmOptions);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const title = n ? str(n.title) : str(d?.title) || '빈자리 알림';
  const body = n ? str(n.body) : str(d?.body) || '감시 중인 회차에 빈자리가 생겼어요.';
  if (!title && !body) return null;
  let eventId: number | null = null;
  for (const link of [d?.link, o?.link]) {
    if (typeof link !== 'string') continue;
    const i = link.indexOf('#');
    eventId = i < 0 ? null : readEventHash(link.slice(i));
    if (eventId !== null) break;
  }
  return { title: title || '알림', body, eventId };
}
