import { useMemo, useState } from 'react';
import type { MemberDto } from '../server';
import { formatKst, memberName, sameNicknameUids, splitMembers, type UseMembersReturn } from '../useMembers';

/* 멤버 관리 화면(기획 §4.54, 운영진 전용). 승인 대기 → 멤버 → 접힌 "지난 신청" 순.
   버튼을 숨기는 건 편의일 뿐이고 승인·운영진 여부는 서버가 모든 요청에서 다시 본다. */
export function MembersPage({ ctl, meUid }: { ctl: UseMembersReturn; meUid: string }) {
  const { list, err, busy, act, setRole } = ctl;
  const parts = useMemo(() => splitMembers(list ?? []), [list]);
  const dup = useMemo(() => sameNicknameUids(list ?? []), [list]);
  const [pastOpen, setPastOpen] = useState(false);

  /* 되돌릴 수 없는 처리는 한 번 더 묻는다 */
  const remove = (m: MemberDto) => {
    if (confirm(`${memberName(m)} 님을 내보낼까요?\n내보낸 계정은 다시 가입할 수 없어요.`)) void act(m, 'remove');
  };
  const demote = (m: MemberDto) => {
    if (confirm(`${memberName(m)} 님의 운영진을 해제할까요?\n멤버는 그대로 남아요.`)) void setRole(m, 'MEMBER');
  };

  return (
    <div className="mem">
      {err && <p className="mem-err" role="alert">{err}</p>}
      {list === null && !err && <p className="mem-empty">불러오는 중이에요…</p>}

      {list && (<>
        <section className="mem-sec">
          <h2>승인 대기 <span className="mem-n">{parts.pending.length}명</span></h2>
          {parts.pending.length === 0 ? <p className="mem-empty">기다리는 신청이 없어요.</p> : (
            <div className="mem-card">
              {parts.pending.map(m => (
                <div className="mem-row" key={m.uid}>
                  <b>{memberName(m)}</b>
                  <span className="mem-sub">{formatKst(m.createdAt)} 신청</span>
                  {dup.has(m.uid) && <span className="mem-warn">같은 닉네임 신청이 있어요</span>}
                  <span className="mem-btns">
                    <button className="btn mem-ok" type="button" disabled={busy.has(m.uid)} onClick={() => void act(m, 'approve')}>승인</button>
                    <button className="btn" type="button" disabled={busy.has(m.uid)} onClick={() => void act(m, 'reject')}>거절</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mem-sec">
          <h2>멤버 <span className="mem-n">{parts.members.length}명</span></h2>
          {parts.members.length === 0 ? <p className="mem-empty">아직 멤버가 없어요.</p> : (
            <div className="mem-card mem-scroll">
              <table className="mem-table">
                <thead><tr><th>닉네임</th><th>역할</th><th>알림 받는 기기</th><th>승인한 날</th><th /></tr></thead>
                <tbody>
                  {parts.members.map(m => {
                    const me = m.uid === meUid;
                    const admin = m.role === 'ADMIN';
                    const off = busy.has(m.uid);
                    return (
                      <tr key={m.uid}>
                        <td><b>{memberName(m)}</b></td>
                        <td>{admin ? <span className="chip-info role">운영진</span> : '멤버'}</td>
                        <td className={m.hasDevice ? 'mem-yes' : 'mem-no'}>{m.hasDevice ? '있음' : '없음'}</td>
                        <td className="mem-sub">{formatKst(m.decidedAt).split(' ').slice(0, 2).join(' ') || '—'}</td>
                        <td className="mem-act">
                          {me ? <span className="mem-sub">나</span> : (<>
                            {admin
                              ? <button className="btn" type="button" disabled={off} onClick={() => demote(m)}>운영진 해제</button>
                              : <button className="btn" type="button" disabled={off} onClick={() => void setRole(m, 'ADMIN')}>운영진으로 지정</button>}
                            <button className="btn mem-danger" type="button" disabled={off} onClick={() => remove(m)}>내보내기</button>
                          </>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mem-note">거절한 신청과 내보낸 계정은 아래 "지난 신청"에 남아요. 내보낸 계정은 다시 가입할 수 없어요.</p>
        </section>

        <section className="mem-sec">
          <button className="mem-fold" type="button" aria-expanded={pastOpen} onClick={() => setPastOpen(o => !o)}>
            <span className="mem-caret" aria-hidden="true">{pastOpen ? '▾' : '▸'}</span>
            지난 신청 <span className="mem-n">{parts.past.length}명</span>
          </button>
          {pastOpen && (parts.past.length === 0 ? <p className="mem-empty">지난 신청이 없어요.</p> : (
            <div className="mem-card">
              {parts.past.map(m => (
                <div className="mem-row" key={m.uid}>
                  <b>{memberName(m)}</b>
                  <span className={'chip-info ' + (m.status === 'REMOVED' ? 'danger' : 'muted')}>{m.status === 'REJECTED' ? '거절함' : '내보냄'}</span>
                  <span className="mem-sub">{formatKst(m.decidedAt) || formatKst(m.createdAt)}</span>
                  <span className="mem-btns">
                    {m.status === 'REJECTED'
                      ? <button className="btn mem-ok" type="button" disabled={busy.has(m.uid)} onClick={() => void act(m, 'approve')}>승인</button>
                      : <span className="mem-sub">다시 가입할 수 없어요</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      </>)}
    </div>
  );
}
