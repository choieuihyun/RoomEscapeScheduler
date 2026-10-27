/* F-16 백그라운드 푸시 수신용 서비스워커. GitHub Pages 프로젝트 서브패스에서
 * 서빙되므로(/RoomEscapeScheduler/) 이 파일도 그 밑(app/public/)에 둬야
 * 스코프가 앱 전체를 덮는다 — 배포.md §3 서브패스 규칙과 같은 이유다.
 *
 * ⚠️ firebase-config.js 값이 바뀌면 여기도 같이 고친다. 서비스워커는 window가
 * 없어 window.FIREBASE_CONFIG를 못 읽으므로 값을 그대로 하드코딩한다 —
 * 비밀 아님(firebase-config.js 상단 주석 참고).
 */

/* 앱 주소(스코프) — 알림을 누르면 이 밑의 링크만 연다 */
const ROOT = self.registration.scope;

/* 새 서비스워커를 바로 쓴다 — 캐시·fetch 처리가 없어 바꿔 끼워도 깨질 것이 없고,
   안 하면 고친 알림 처리가 앱 탭을 다 닫을 때까지 안 먹는다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* 알림을 누르면 그 일정(`#e=<id>`)을 연다 (작업명세서 §4.10).
   SDK(12.9.0)도 notificationclick 을 거는데, 같은 주소의 창을 앞으로 가져오기만 하고 링크로 옮기지 않는다.
   그래서 importScripts 보다 먼저 걸어 우리 것이 먼저 돌고, stopImmediatePropagation 으로 SDK 것을 막는다
   (안 막으면 창이 두 번 열리거나, 앞으로 온 창이 그 일정을 안 연다). */

// pickLink 시작 — app/src/swLink.ts 의 pickLink·clickTarget 과 똑같이 유지한다(swLink.test.ts 가 같은 표로 둘 다 돌린다)
function pickLink(data, root) {
  const bag = v => (v && typeof v === 'object' ? v : null);
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

/* 열린 창에서: 일정 링크가 아니면 null(앞으로 가져오기만), 지금 주소의 해시만 바꾼 주소(새로 불러오지 않는다),
   이미 그 해시면 'message' */
function clickTarget(clientUrl, link) {
  const i = link.indexOf('#');
  const hash = i < 0 ? '' : link.slice(i);
  if (!/^#e=(?!0+$)\d{1,15}$/.test(hash)) return null;
  const u = new URL(clientUrl);
  if (u.hash === hash) return 'message';
  u.hash = hash;
  return u.href;
}

/* 같은 앱 창이 여럿이면 누른 사람이 보고 있을 창을 고른다: 보이는(visible) 창 → 포커스된 창 → 아무 창 */
function pickClient(list, root) {
  const mine = list.filter(c => c.url.startsWith(root));
  return mine.find(c => c.visibilityState === 'visible') || mine.find(c => c.focused) || mine[0];
}
// pickLink 끝

async function openLink(link) {
  /* includeUncontrolled — 서비스워커를 처음 등록한 탭은 아직 이 워커 관할이 아니어도 찾아야 한다 */
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = pickClient(list, ROOT);
  if (!client) {
    await self.clients.openWindow(link);
    return;
  }
  /* 누른 직후에만 창을 앞으로 가져올 수 있어 focus 를 먼저 한다 */
  await client.focus().catch(() => {});
  const target = clickTarget(client.url, link);
  if (target === null) return;
  if (target !== 'message') {
    try {
      await client.navigate(target);
      return;
    } catch { /* 관할 밖 창은 navigate 가 거절된다 — 아래 메시지로 */ }
  }
  /* 앱이 이 메시지를 받아 #e= 로 연다(SchedulerPage) */
  client.postMessage({ type: 'open', link });
}

self.addEventListener('notificationclick', event => {
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(openLink(pickLink(event.notification.data, ROOT)));
});

importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDSmp0yCSN2fqc7jvlzgLh4LliFi-XwoAk',
  authDomain: 'roomescapescheduler.firebaseapp.com',
  projectId: 'roomescapescheduler',
  messagingSenderId: '13772151522',
  appId: '1:13772151522:web:b0ce0adfb766fa81845cbb',
});

const messaging = firebase.messaging();

/* 서버는 모든 알림(빈자리·동호회)에 notification 을 담아 보낸다 — 그러면 SDK 가 알아서 띄우므로
   여기서 또 띄우면 두 번 뜬다. notification 없이 data 만 온 메시지만 직접 띄우고, 누르면 열 링크를 data 에 싣는다. */
/* data.tag(일정 댓글 "ev-cmt-<id>", §4.16 — 2026-10-27)가 있으면 같은 tag 알림을 하나로 겹치고 다시 울린다(renotify).
   notification 이 실려 온 알림은 서버가 webpush.notification 에 같은 tag 를 넣어 브라우저가 겹친다 */
messaging.onBackgroundMessage(payload => {
  if (payload.notification) return;
  const data = payload.data || {};
  return self.registration.showNotification(data.title || '빈자리 알림', {
    body: data.body || '감시 중인 회차에 빈자리가 생겼어요.',
    icon: 'icon-192.png',
    data: { link: data.link || payload.fcmOptions?.link || ROOT },
    ...(data.tag ? { tag: data.tag, renotify: true } : {}),
  });
});
