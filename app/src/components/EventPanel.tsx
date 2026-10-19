import { useState } from 'react';
import { eventStatus, eventTitle, isUndecided, kakaoPost, longDayLabel, rangeLabel, STATUS_LABEL, timeLabel } from '../clubEvents';
import { eventLink } from '../eventLink';
import { playedCount, playedNames, playedPerPerson } from '../played';
import { listClubMembers, sayClub, type ClubMemberDto, type EventDto } from '../server';
import { showToast } from '../toast';
import type { UseClubEventsReturn } from '../useClubEvents';
import type { AddedTheme } from '../useLoadModal';
import { EventHelper } from './EventHelper';
import { EventTalk, EventTalkDone } from './EventTalk';

/* 캘린더 오른쪽 패널의 동호회 일정 상세 (계획 Task E6, 목업 "캘린더 + 일정 상세").
   보이는 일정은 늘 목록(useClubEvents)에서 꺼낸 최신 값이다 — 정원 초과 뒤 다시 불러온 값,
   수정 창에서 저장한 값이 그대로 여기 나온다. 고른 일정이 바뀌면 부르는 쪽이 key 로 새로 그린다. */

/* "대신 넣기" 고를 승인 멤버 목록 — 처음 펼칠 때 한 번만 받는다 */
async function loadMembers(): Promise<ClubMemberDto[]> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return listClubMembers(t);
}

/* 경고 세모 — 해 본 테마 줄 */
const WarnIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);

export function EventPanel({ ev, club, meUid, onClose, onEdit, onCalcWindow, onPicked, onCalcThemes }: {
  ev: EventDto; club: UseClubEventsReturn; meUid: string; onClose: () => void; onEdit: (ev: EventDto) => void;
  /* 정해진 날짜에 다 같이 되는 시간으로 조합 계산 조건을 채우고 계산 화면으로 */
  onCalcWindow?: (w: { start: number; end: number }) => void;
  /* 정하기·다시 미정으로 뒤 캘린더에서 그 날짜를 고른다 */
  onPicked?: (date: string) => void;
  /* 협의 도우미에서 고른 테마를 계산 화면에 넣고 그리로 */
  onCalcThemes?: (items: AddedTheme[]) => void;
}) {
  const st = eventStatus(ev);
  const busy = club.busyIds.has(ev.id);
  const full = ev.capacity !== null && ev.count >= ev.capacity;
  const [picking, setPicking] = useState(false);
  const [members, setMembers] = useState<ClubMemberDto[] | null>(null);
  const [pickErr, setPickErr] = useState('');
  const post = kakaoPost(ev, eventLink(ev.id, location));

  const undecided = isUndecided(ev);
  const time = ev.segments.length === 0 ? (timeLabel(ev) || (undecided ? '' : '하루 종일')) : '';
  /* 날짜 미정이면 한 날짜를 정해진 것처럼 보이지 않게 후보 수만 */
  const when = undecided ? `날짜 미정 · 후보 ${ev.candidates.length}개` : longDayLabel(ev.date as string);
  const left = ev.capacity === null ? '' : full ? '마감' : `${ev.capacity - ev.count}자리 남음`;
  const played = playedCount(ev);
  const perPerson = playedPerPerson(ev);
  /* 협의 도우미 — 참여자만. 날짜 미정이면 "언제 될까요?" 바로 아래, 정해진 날이면 후보 기록 아래 */
  const helper = ev.joined && onCalcThemes ? <EventHelper ev={ev} onCalcThemes={onCalcThemes} /> : null;

  /* 내 응답 시간 칸에 적는 중에 패널의 다른 단추(정하기·참여 취소·예약 등)를 누르면, 칸의 blur 커밋이 먼저 요청을 보내
     단추가 busy 로 잠기고 누른 동작이 사라진다. 그때만 누르는 순간 포커스를 옮기지 않는다(터치도 pointerdown 으로).
     적던 시간은 칸에 남아 칸을 벗어날 때 보낸다. */
  const keepTimeFocus = (e: React.PointerEvent | React.MouseEvent) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.classList.contains('evt-my-time') && (e.target as Element).closest('button')) e.preventDefault();
  };

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
    <div className="evp" aria-label="일정 상세" onPointerDown={keepTimeFocus} onMouseDown={keepTimeFocus}>
      <div className="evp-head">
        <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>
        {played > 0 && <span className="chip-info warn">해 봄 {played}</span>}
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
          {when}{time && (undecided ? ` · ${time}` : ` ${time}`)} · 만든 사람 {ev.createdBy.nickname}
        </p>
      </div>

      {undecided && <EventTalk ev={ev} club={club} meUid={meUid} onPicked={onPicked} />}
      {undecided && helper}

      {ev.segments.length > 0 && (
        <div className="evp-segs">
          {ev.segments.map((g, i) => {
            const prev = i > 0 ? ev.segments[i - 1] : null;
            /* 사이 이동 시간 = 다음 시작 − 이전 끝. 이전 끝을 모르면 적지 않는다 */
            const move = prev && prev.endMin !== null ? g.startMin - prev.endMin : null;
            const by = playedNames(g, ev);
            const card = (
              <div className="evp-seg">
                <b>{rangeLabel(g.startMin, g.endMin)}</b>
                <span className="evp-seg-n">{g.themeName}</span>
                {g.branchName && <span className="evp-seg-b">{g.branchName}</span>}
              </div>
            );
            return (
              <div key={i} className="evp-segwrap">
                {move !== null && move >= 0 && <div className="evp-move">이동 {move}분</div>}
                {by.length === 0 ? card : (
                  <div className="evp-seg-played">
                    {card}
                    <p className="evp-seg-warn">
                      <WarnIcon />
                      <span>이 테마는 {by.map((n, j) => <span key={j}>{j > 0 && ', '}<b>{n}</b></span>)} 님이 이미 해 봤어요</span>
                    </p>
                  </div>
                )}
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
            <span key={p.uid} className={'evp-chip' + (perPerson.has(p.uid) ? ' played' : '')}>
              {p.nickname}
              {p.uid === ev.createdBy.uid && <i>만든 사람</i>}
              {perPerson.has(p.uid) && <em>해 봄 {perPerson.get(p.uid)}</em>}
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
              <button type="button" className={'chip-pick' + (ev.booked ? '' : ' on')} aria-pressed={!ev.booked} disabled={busy}
                onClick={() => { if (ev.booked) void club.setBooked(ev.id, false); }}>예약 전</button>
              <button type="button" className={'chip-pick' + (ev.booked ? ' on' : '')} aria-pressed={ev.booked} disabled={busy}
                onClick={() => { if (!ev.booked) void club.setBooked(ev.id, true); }}>예약 완료</button>
            </span>
          </div>
          <p className="evp-hint">참여한 사람, 만든 사람, 운영진이 바꿀 수 있어요.</p>
        </div>
      )}

      {!undecided && ev.candidates.length > 0 && <EventTalkDone ev={ev} club={club} onCalcWindow={onCalcWindow} onPicked={onPicked} />}
      {!undecided && helper}

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
