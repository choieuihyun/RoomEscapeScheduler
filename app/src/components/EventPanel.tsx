import { useState } from 'react';
import { eventStatus, eventTitle, kakaoPost, longDayLabel, rangeLabel, STATUS_LABEL, timeLabel } from '../clubEvents';
import { eventLink } from '../eventLink';
import { listClubMembers, sayClub, type ClubMemberDto, type EventDto } from '../server';
import { showToast } from '../toast';
import type { UseClubEventsReturn } from '../useClubEvents';

/* 캘린더 오른쪽 패널의 동호회 일정 상세 (계획 Task E6, 목업 "캘린더 + 일정 상세").
   보이는 일정은 늘 목록(useClubEvents)에서 꺼낸 최신 값이다 — 정원 초과 뒤 다시 불러온 값,
   수정 창에서 저장한 값이 그대로 여기 나온다. 고른 일정이 바뀌면 부르는 쪽이 key 로 새로 그린다. */

/* "대신 넣기" 고를 승인 멤버 목록 — 처음 펼칠 때 한 번만 받는다 */
async function loadMembers(): Promise<ClubMemberDto[]> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return listClubMembers(t);
}

export function EventPanel({ ev, club, onClose, onEdit }: {
  ev: EventDto; club: UseClubEventsReturn; onClose: () => void; onEdit: (ev: EventDto) => void;
}) {
  const st = eventStatus(ev);
  const busy = club.busyIds.has(ev.id);
  const full = ev.capacity !== null && ev.count >= ev.capacity;
  const [picking, setPicking] = useState(false);
  const [members, setMembers] = useState<ClubMemberDto[] | null>(null);
  const [pickErr, setPickErr] = useState('');
  const post = kakaoPost(ev, eventLink(ev.id, location));

  const time = ev.segments.length === 0 ? (timeLabel(ev) || '하루 종일') : '';
  const left = ev.capacity === null ? '' : full ? '마감' : `${ev.capacity - ev.count}자리 남음`;

  async function openPick() {
    if (picking) { setPicking(false); return; }
    setPicking(true);
    if (members) return;
    setPickErr('');
    try { setMembers(await loadMembers()); } catch (e) { setPickErr(sayClub(e)); }
  }

  async function copyPost() {
    try {
      await navigator.clipboard.writeText(post);
      showToast('카톡에 붙여 넣으세요.');
    } catch {
      showToast('복사가 안 돼요. 아래 글을 길게 눌러 복사해 주세요.');
    }
  }

  const inIds = new Set(ev.participants.map((p) => p.uid));
  const candidates = (members ?? []).filter((m) => !inIds.has(m.uid));

  return (
    <div className="evp" aria-label="일정 상세">
      <div className="evp-head">
        <span className={'st-badge ' + st}>{STATUS_LABEL[st]}</span>
        <span className="evp-tools">
          {ev.canManage && (
            <>
              <button type="button" className="btn evp-sm" disabled={busy} onClick={() => onEdit(ev)}>수정</button>
              <button
                type="button" className="btn evp-sm evp-del" disabled={busy}
                onClick={() => { if (confirm('이 일정을 지울까요? 참여한 사람들 화면에서도 사라져요.')) void club.remove(ev.id); }}
              >삭제</button>
            </>
          )}
          <button type="button" className="btn-x" aria-label="닫기" onClick={onClose}>×</button>
        </span>
      </div>

      <div>
        <h2 className="evp-title">{eventTitle(ev)}</h2>
        <p className="evp-sub">
          {longDayLabel(ev.date)}{time && ` ${time}`} · 만든 사람 {ev.createdBy.nickname}
        </p>
      </div>

      {ev.segments.length > 0 && (
        <div className="evp-segs">
          {ev.segments.map((g, i) => {
            const prev = i > 0 ? ev.segments[i - 1] : null;
            /* 사이 이동 시간 = 다음 시작 − 이전 끝. 이전 끝을 모르면 적지 않는다 */
            const move = prev && prev.endMin !== null ? g.startMin - prev.endMin : null;
            return (
              <div key={i} className="evp-segwrap">
                {move !== null && move >= 0 && <div className="evp-move">이동 {move}분</div>}
                <div className="evp-seg">
                  <b>{rangeLabel(g.startMin, g.endMin)}</b>
                  <span className="evp-seg-n">{g.themeName}</span>
                  {g.branchName && <span className="evp-seg-b">{g.branchName}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="evp-people">
        <div className="evp-ph">
          <h3>참여 {ev.capacity === null ? `${ev.count}명` : `${ev.count}/${ev.capacity}`}</h3>
          {left && <span className={full ? 'full' : ''}>{left}</span>}
        </div>
        <div className="evp-chips">
          {ev.participants.map((p) => (
            <span key={p.uid} className="evp-chip">
              {p.nickname}
              {p.uid === ev.createdBy.uid && <i>만든 사람</i>}
              {ev.canManage && (
                <button
                  type="button" aria-label={`${p.nickname} 빼기`} disabled={busy}
                  onClick={() => { if (confirm(`${p.nickname} 님을 이 일정에서 뺄까요?`)) void club.removePerson(ev.id, p.uid); }}
                >×</button>
              )}
            </span>
          ))}
          {ev.canManage && (
            <button type="button" className="evp-add" aria-expanded={picking} disabled={busy || (full && !picking)}
              onClick={() => void openPick()}>+ 대신 넣기</button>
          )}
        </div>
        {picking && (
          <div className="evp-pick">
            {pickErr ? <p className="merr">{pickErr}</p>
              : !members ? <p className="evp-hint">멤버를 불러오는 중…</p>
              : candidates.length === 0 ? <p className="evp-hint">더 넣을 수 있는 멤버가 없어요.</p>
              : candidates.map((m) => (
                <button
                  key={m.uid} type="button" className="evp-pick-m" disabled={busy || full}
                  onClick={() => { setPicking(false); void club.addPerson(ev.id, m.uid); }}
                >{m.nickname}</button>
              ))}
          </div>
        )}
        {ev.joined ? (
          <button type="button" className="btn evp-join" disabled={busy} onClick={() => void club.leave(ev.id)}>참여 취소</button>
        ) : full ? (
          <button type="button" className="btn evp-join" disabled>마감</button>
        ) : (
          <button type="button" className="btn-go evp-join" disabled={busy} onClick={() => void club.join(ev.id)}>참여하기</button>
        )}
      </div>

      {ev.segments.length > 0 && (ev.joined || ev.canManage) && (
        <div className="evp-book">
          <div className="evp-row">
            <span className="evp-lbl">예약</span>
            <span className="evp-toggle" role="group" aria-label="예약 상태">
              <button type="button" className={ev.booked ? '' : 'on before'} aria-pressed={!ev.booked} disabled={busy}
                onClick={() => { if (ev.booked) void club.setBooked(ev.id, false); }}>예약 전</button>
              <button type="button" className={ev.booked ? 'on done' : ''} aria-pressed={ev.booked} disabled={busy}
                onClick={() => { if (!ev.booked) void club.setBooked(ev.id, true); }}>예약 완료</button>
            </span>
          </div>
          <p className="evp-hint">참여한 사람, 만든 사람, 운영진이 바꿀 수 있어요.</p>
        </div>
      )}

      {ev.location && (
        <div className="evp-text">
          <span className="evp-lbl">위치</span>
          <p>{ev.location}</p>
        </div>
      )}
      {ev.memo && (
        <div className="evp-text">
          <span className="evp-lbl">메모</span>
          <p>{ev.memo}</p>
        </div>
      )}

      <div className="evp-kakao">
        <button type="button" className="evp-kakao-btn" onClick={() => void copyPost()}>카톡에 올릴 글 복사</button>
        <code className="evp-post">{post}</code>
      </div>
    </div>
  );
}
