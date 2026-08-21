/* Firebase 접속 정보.
 *
 * 여기 값들은 비밀이 아니다 — 브라우저에 그대로 내려가는 "어느 프로젝트인가" 주소다.
 * 실제 보호는 firestore.rules 가 한다 (남의 문서는 규칙에서 막힌다).
 * 그러니 이 파일은 저장소에 그대로 커밋해도 된다.
 *
 * 채우는 법은 README 의 "계정 만들고 일정 저장하기" 참고.
 * 비워 두면 앱은 그대로 동작하고 로그인 기능만 꺼진다.
 *
 * measurementId(애널리틱스)는 쓰지 않으므로 넣지 않는다.
 */
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDSmp0yCSN2fqc7jvlzgLh4LliFi-XwoAk",
  authDomain:        "roomescapescheduler.firebaseapp.com",
  projectId:         "roomescapescheduler",
  appId:             "1:13772151522:web:a4ec3801e170a78a845cbb",
};
