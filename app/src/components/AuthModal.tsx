import { useEffect, useRef } from 'react';
import type { UseAuthReturn } from '../useAuth';

/* 로그인 모달 — index.html의 #authModal + openAuth()/submitAuth() 이식. */
export function AuthModal({ auth }: { auth: UseAuthReturn }) {
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (auth.open) setTimeout(() => idRef.current?.focus(), 30);
  }, [auth.open]);

  return (
    <div
      className={'modal' + (auth.open ? ' on' : '')}
      onClick={e => { if (e.target === e.currentTarget) auth.closeAuth(); }}
    >
      <div className="mbox">
        <h3>로그인</h3>
        <p className="msub">
          아이디와 비밀번호를 넣어 주세요.
        </p>
        <div className="mrow">
          <label>아이디</label>
          <input
            ref={idRef}
            autoComplete="username" autoCapitalize="off" spellCheck={false} placeholder="englishman"
            value={auth.id} onChange={e => auth.setId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') pwRef.current?.focus(); }}
          />
        </div>
        <div className="mrow">
          <label>비밀번호 <span>(6자 이상)</span></label>
          <input
            ref={pwRef}
            type="password" autoComplete="current-password" placeholder="••••••"
            value={auth.pw} onChange={e => auth.setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') auth.submit(); }}
          />
        </div>
        <p className="merr">{auth.err}</p>
        <div className="mbtns">
          <button className="btn-go" type="button" disabled={auth.busy} onClick={auth.submit}>
            {auth.busy ? '잠시만…' : '로그인'}
          </button>
          <button className="btn" type="button" onClick={auth.closeAuth}>닫기</button>
        </div>
        <p className="mnote"><b>비밀번호를 잊어버리면 찾을 방법이 없어요.</b> 다른 곳에서 쓰는 비밀번호는 쓰지 마세요.</p>
      </div>
    </div>
  );
}
