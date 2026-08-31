import type { UseAuthReturn } from '../useAuth';

/* 헤더 계정 줄 — index.html의 renderAcct() 이식. */
export function AcctWidget({ auth }: { auth: UseAuthReturn }) {
  if (!auth.cloudOn) {
    return (
      <span title="firebase-config.js가 비어 있습니다. README의 '계정 만들고 일정 저장하기' 참고">
        일정 저장 꺼짐
      </span>
    );
  }
  return auth.me ? (
    <>
      <span><b>{auth.me.id}</b> 님</span>
      <button className="btn" type="button" onClick={auth.logout}>로그아웃</button>
    </>
  ) : (
    <>
      <span>일정을 저장해 두려면</span>
      <button className="btn" type="button" onClick={() => auth.openAuth('in')}>로그인</button>
    </>
  );
}
