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
  /* 로그인 상태를 아직 복원 중이면 "로그인" 버튼을 잠깐 보여줬다 되돌리지
     않는다 — 실제론 로그아웃된 적 없는데 로그아웃된 것처럼 보이는 깜빡임. */
  if (auth.authLoading) return <span>확인 중…</span>;

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
