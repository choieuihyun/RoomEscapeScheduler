import { useEffect, useRef, useState } from 'react';
import { eventStatus, eventTitle, isUndecided, kakaoPost, longDayLabel, rangeLabel, STATUS_LABEL, timeLabel } from '../clubEvents';
import { eventLink } from '../eventLink';
import { playedPerPerson } from '../played';
import { playedDots } from '../playedWho';
import { listClubMembers, sayClub, type ClubMemberDto, type EventDto } from '../server';
import { showToast } from '../toast';
import type { UseClubEventsReturn } from '../useClubEvents';
import type { AddedTheme } from '../useLoadModal';
import { EventHelper } from './EventHelper';
import { EventTalk, EventTalkDone } from './EventTalk';
import { PlayedDots } from './PlayedDots';
import { SettlePanel } from './SettlePanel';

/* 캘린더 오른쪽 패널의 동호회 일정 상세 (계획 Task E6, 목업 "캘린더 + 일정 상세").
   보이는 일정은 늘 목록(useClubEvents)에서 꺼낸 최신 값이다 — 정원 초과 뒤 다시 불러온 값,
   수정 창에서 저장한 값이 그대로 여기 나온다. 고른 일정이 바뀌면 부르는 쪽이 key 로 새로 그린다. */

/* "대신 넣기" 고를 승인 멤버 목록 — 처음 펼칠 때 한 번만 받는다 */
async function loadMembers(): Promise<ClubMemberDto[]> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return listClubMembers(t);
}

export function EventPanel({ ev, club, meUid, onClose, onEdit, onCalcWindow, onPicked, onCalcThemes }: {
  ev: EventDto; club: UseClubEventsReturn; meUid: string; onClose: () => void; onEdit: (ev: EventDto) => void;
  /* 정해진 날짜에 다 같이 되는 시간으로 조합 계산 조건을 채우고 계산 화면으로(계산 화면이 이 일정을 기억한다) */
  onCalcWindow?: (w: { start: number; end: number }, ev: EventDto) => void;
  /* 정하기·다시 미정으로 뒤 캘린더에서 그 날짜를 고른다 */
  onPicked?: (date: string) => void;
  /* 협의 도우미에서 고른 테마를 계산 화면에 넣고 그리로(계산 화면이 이 일정을 기억한다) */
  onCalcThemes?: (items: AddedTheme[], ev: EventDto) => void;
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
  const perPerson = playedPerPerson(ev);
  /* 협의 도우미 — 협의 중·예약 전 일정의 참여자만(예약 완료면 테마가 이미 정해졌다). 날짜 미정이면 "언제 될까요?" 바로 아래, 정해진 날이면 후보 기록 아래 */
  const helper = ev.joined && (undecided || !ev.booked) && onCalcThemes ? <EventHelper ev={ev} onCalcThemes={(items) => onCalcThemes(items, ev)} /> : null;

  /* 내 응답 시간 칸에 적는 중에 패널의 다른 단추(정하기·참여 취소·예약 등)를 누르면, 칸의 blur 커밋이 먼저 요청을 보내
     단추가 busy 로 잠기고 누른 동작이 사라진다. 그때만 누르는 순간 포커스를 옮기지 않는다(터치도 pointerdown 으로).
     적던 시간은 칸에 남아 칸을 벗어날 때 보낸다. */
  const keepTimeFocus = (e: React.PointerEvent | React.MouseEvent) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.classList.contains('evt-my-time') && (e.target as Element).closest('button')) e.preventDefault();
  };

  /* 닫기(×)는 칸이 같이 사라져 blur 가 오지 않으니, 적던 시간을 먼저 보낸다 — 요청은 창이 닫힌 뒤에도 이어진다 */
  const flushTime = () => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.classList.contains('evt-my-time')) a.blur();
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

  const panelRef = useRef<HTMLDivElement>(null);
  /* 포커스가 어디에도 없을 때(앱 안 알림 띠의 "열기"가 사라지며 body 로 떨어진 뒤 등) 일정이 열리면 패널 자체(tabIndex=-1, 제목을 읽어 줌)로 옮긴다 — 사파리에서 스크롤이 튀지 않게 preventScroll —
     클릭한 칸 등 포커스가 이미 있으면 건드리지 않는다 */
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) panelRef.current?.focus({ preventScroll: true });
  }, [ev.id]);

  const inIds = new Set(ev.participants.map((p) => p.uid));
  const candidates = (members ?? []).filter((m) => !inIds.has(m.uid));

  return (
    <div className="evp" ref={panelRef} tabIndex={-1} aria-labelledby="evp-title" onPointerDown={keepTimeFocus} onMouseDown={keepTimeFocus}>
      <div className="evp-head">
        <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>
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
          <button type="button" className="btn-x" aria-label="닫기" onClick={() => { flushTime(); onClose(); }}>×</button>
        </span>
      </div>

      <div>
        <h2 className="evp-title" id="evp-title">{eventTitle(ev)}</h2>
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
            /* 구간(테마)마다 참여자 전원을 이름 + 색 점으로 — 안 해 봄 초록, 해 봄 빨강. 참여자가 없으면 카드만 */
            const dots = playedDots(g.playedBy, ev.participants);
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
                {dots.length === 0 ? card : (
                  <div className="evp-seg-who">
                    {card}
                    <p className="evp-seg-ppl"><PlayedDots dots={dots} /></p>
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

      {/* 정산(§4.13) — 참여자 목록·예약 아래. 참여자·운영진·만든 사람(정산이 있으면 항목에 든 사람도) */}
      <SettlePanel key={ev.id} ev={ev} club={club} meUid={meUid} />

      {!undecided && ev.candidates.length > 0 && <EventTalkDone ev={ev} club={club} onCalcWindow={onCalcWindow && ((w) => onCalcWindow(w, ev))} onPicked={onPicked} />}
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
