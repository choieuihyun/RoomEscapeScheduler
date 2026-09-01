/* F-16 백그라운드 푸시 수신용 서비스워커. GitHub Pages 프로젝트 서브패스에서
 * 서빙되므로(/RoomEscapeScheduler/) 이 파일도 그 밑(app/public/)에 둬야
 * 스코프가 앱 전체를 덮는다 — 배포.md §3 서브패스 규칙과 같은 이유다.
 *
 * ⚠️ firebase-config.js 값이 바뀌면 여기도 같이 고친다. 서비스워커는 window가
 * 없어 window.FIREBASE_CONFIG를 못 읽으므로 값을 그대로 하드코딩한다 —
 * 비밀 아님(firebase-config.js 상단 주석 참고).
 */
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

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '빈자리 알림';
  const body = payload.notification?.body || '감시 중인 회차에 빈자리가 생겼어요.';
  self.registration.showNotification(title, {
    body,
    icon: 'icon-192.png',
  });
});
