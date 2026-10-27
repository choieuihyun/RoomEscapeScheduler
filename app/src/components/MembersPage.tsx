import { useMemo } from 'react';
import { MemberLink } from '../clubStore';
import { lifeLabel, personLine } from '../memberProfile';
import type { MemberDto, ProfileDto } from '../server';
import { formatKst, memberName, sameNicknameUids, splitMembers, type UseMembersReturn } from '../useMembers';

/* 멤버 관리 화면(기획 §4.54, 운영진 전용). 승인 대기 → 멤버 순("지난 신청" 칸은 2026-10-22 사용자 요청으로 뺐다).
   버튼을 숨기는 건 편의일 뿐이고 승인·운영진 여부는 서버가 모든 요청에서 다시 본다. */
/* 프로필 한 줄(§4.11 — MemberDto.profile 은 운영진 멤버 관리에도 보인다). 승인할 때 맞춰 보라고 대기 줄에도 둔다.
   서버가 프로필을 모르면(undefined) 아무것도, 안 채웠으면 "프로필 없음" */
function ProfLine({ p }: { p: ProfileDto | null | undefined }) {
  if (p === undefined) return null;
  if (p === null) return <span className="mem-prof none">프로필 없음</span>;
  return (
    <span className="mem-prof">
      {p.realName} · {personLine(p)} · {p.genres.join('·')} · 인생 테마 {lifeLabel(p.lifeTheme)}
    </span>
  );
}

export function MembersPage({ ctl, meUid, onBack }: { ctl: UseMembersReturn; meUid: string; onBack: () => void }) {
  const { list, err, busy, act, setRole } = ctl;
  const parts = useMemo(() => splitMembers(list ?? []), [list]);
  const dup = useMemo(() => sameNicknameUids(list ?? []), [list]);

  /* 되돌릴 수 없는 처리는 한 번 더 묻는다 */
  const remove = (m: MemberDto) => {
    if (confirm(`${memberName(m)} 님을 내보낼까요?\n걸어 둔 빈자리 알림도 지워져요. 다시 가입 신청은 할 수 있어요.`)) void act(m, 'remove');
  };
  const demote = (m: MemberDto) => {
    if (confirm(`${memberName(m)} 님의 운영진을 해제할까요?\n멤버는 그대로 남아요.`)) void setRole(m, 'MEMBER');
  };

  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>멤버 관리</h1>
      <p>가입 신청을 오픈채팅 닉네임과 맞춰 보고 승인해 주세요. 한 사람이 계정을 여러 개 만들었으면 하나만 승인하면 돼요.</p>
    </header>
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
                  <ProfLine p={m.profile} />
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
                        <td><b><MemberLink uid={m.uid} name={memberName(m)} /></b><ProfLine p={m.profile} /></td>
                        <td>{admin ? <span className="chip-info role">운영진</span> : '멤버'}</td>
                        <td className={m.hasDevice ? 'mem-yes' : 'mem-no'}>{m.hasDevice ? '있음' : '없음'}</td>
                        <td className="mem-sub">{formatKst(m.decidedAt).split(' ').slice(0, 2).join(' ') || '-'}</td>
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
          <p className="mem-note">내보내면 걸어 둔 빈자리 알림도 지워져요. 거절하거나 내보낸 사람도 다시 가입 신청은 할 수 있어요.</p>
        </section>

      </>)}
    </div>
  </>);
}
