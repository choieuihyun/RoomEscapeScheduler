import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { eventStatus, eventTitle, isUndecided, kakaoPost, rangeLabel, STATUS_LABEL, timeLabel, todayKst } from '../clubEvents';
import { useBackClose } from '../backStack';
import { googleCalUrl, icsText } from '../calExport';
import { eventLink } from '../eventLink';
import { dDay, monthDayLabel, peopleLabel, placeLabel, talkSummary } from '../eventView';
import { MemberLink } from '../clubStore';
import { playedPerPerson } from '../played';
import { playedDots } from '../playedWho';
import { listClubMembers, sayClub, type ClubMemberDto, type EventDto } from '../server';
import { showToast } from '../toast';
import type { UseClubEventsReturn } from '../useClubEvents';
import type { AddedTheme } from '../scheduler/types';
import { EventComments } from './EventComments';
import { EventHelper } from './EventHelper';
import { EventTalk, EventTalkDone } from './EventTalk';
import { AvaText } from './Avatar';
import { Fold } from './Fold';
import { PlayedDots } from './PlayedDots';
import { SettlePanel } from './SettlePanel';

/* 캘린더의 동호회 일정 상세 (계획 Task E6 → 2026-10-21 개편, 승인 목업 MobileEvent·DesktopEvent).
   위에서부터: 상태 칩(누르면 예약 전/완료) + 제목 → 언제·어디·몇 명(시간 크게) → 코스 → 참여자 →
   접힌 줄(정산·날짜 협의·테마 도우미) → 아래 막대 [카톡 글 복사][참여하기/참여 취소](좁은 화면은 탭 위에 붙는다).
   수정·삭제는 ⋯ 메뉴. "카톡 글 보기" 메뉴는 2026-10-22 사용자 요청으로 뺐다 — 글은 [카톡 글 복사]로 가져가고,
   복사가 막힌 브라우저에서만 글을 펼쳐 보여 준다.
   보이는 일정은 늘 목록(useClubEvents)에서 꺼낸 최신 값이다 — 정원 초과 뒤 다시 불러온 값,
   수정 창에서 저장한 값이 그대로 여기 나온다. 고른 일정이 바뀌면 부르는 쪽이 key 로 새로 그린다. */

/* "대신 넣기" 고를 승인 멤버 목록 — 처음 펼칠 때 한 번만 받는다 */
async function loadMembers(): Promise<ClubMemberDto[]> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return listClubMembers(t);
}

/* 선 아이콘(앱 관용 — 24 상자, 1.75 선). 뜻은 옆 글이나 aria-label 이 전한다 */
const Ic = ({ size = 18, children }: { size?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const X = () => <Ic size={16}><path d="M6 6l12 12M18 6 6 18" /></Ic>;

/* 작은 띄움 메뉴(⋯·예약 상태) — 밖을 누르거나 Esc 면 닫는다. Esc 는 이 메뉴만 닫고 연 단추로 포커스를 돌려준다 */
function useDismiss(open: boolean, close: () => void, box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
      box.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key, true); };
  }, [open, close, box]);
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
  const [menu, setMenu] = useState(false);
  const [stMenu, setStMenu] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const post = kakaoPost(ev, eventLink(ev.id, location));
  const calUrl = googleCalUrl(ev, eventLink(ev.id, location));
  /* .ics 받기 — 아이폰 사파리는 파일을 열면 "캘린더에 추가"를, 안드로이드·PC 는 내려받은 파일을 캘린더 앱으로 연다 */
  const saveIcs = () => {
    const text = icsText(ev, eventLink(ev.id, location), new Date());
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `floduler-${ev.date}-${ev.id}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const undecided = isUndecided(ev);
  /* 시간 — 큰 시작 + 작은 끝. 날짜 미정이면 "날짜 미정"을 크게, 시간이 없으면 "하루 종일" */
  const time = timeLabel(ev);
  const [t0, t1] = time ? time.split('–') : ['', ''];
  const ppl = peopleLabel(ev);
  const place = placeLabel(ev);
  const perPerson = playedPerPerson(ev);
  /* 예약 상태는 구간이 있는 일정에서 참여한 사람·만든 사람·운영진이 바꾼다(개편 전 "예약" 줄과 같은 조건) */
  const canBook = ev.segments.length > 0 && (ev.joined || ev.canManage);
  /* 협의 도우미 — 협의 중·예약 전 일정의 참여자만(예약 완료면 테마가 이미 정해졌다) */
  const helper = ev.joined && (undecided || !ev.booked) && onCalcThemes ? <EventHelper ev={ev} onCalcThemes={(items) => onCalcThemes(items, ev)} /> : null;
  const hasTalk = undecided || ev.candidates.length > 0;
  /* 날짜 미정이면 협의가 할 일의 전부라 처음부터 펼친다 */
  const [talkOpen, setTalkOpen] = useState(undecided);

  /* 내 응답 시간 칸에 적는 중에 패널의 다른 단추(정하기·참여 취소·예약 등)를 누르면, 칸의 blur 커밋이 먼저 요청을 보내
     단추가 busy 로 잠기고 누른 동작이 사라진다. 그때만 누르는 순간 포커스를 옮기지 않는다(터치도 pointerdown 으로).
     적던 시간은 칸에 남아 칸을 벗어날 때 보낸다. */
  const keepTimeFocus = (e: React.PointerEvent | React.MouseEvent) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.classList.contains('evt-my-time') && (e.target as Element).closest('button')) e.preventDefault();
  };

  /* 닫기(×·뒤로)는 칸이 같이 사라져 blur 가 오지 않으니, 적던 시간을 먼저 보낸다 — 요청은 창이 닫힌 뒤에도 이어진다 */
  const flushTime = () => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && a.classList.contains('evt-my-time')) a.blur();
  };
  const close = () => { flushTime(); onClose(); };

  async function openPick() {
    if (picking) { setPicking(false); return; }
    setPicking(true);
    if (members) return;
    setPickErr('');
    try { setMembers(await loadMembers()); } catch (e) { setPickErr(sayClub(e)); }
  }

  const postRef = useRef<HTMLElement>(null);
  async function copyPost() {
    try {
      await navigator.clipboard.writeText(post);
      showToast('카톡에 붙여 넣으세요.');
    } catch {
      /* 복사가 막힌 브라우저 — 글을 펼쳐 길게 눌러 복사하게 한다 */
      setShowPost(true);
      requestAnimationFrame(() => postRef.current?.scrollIntoView({ block: 'center' }));
      showToast('복사가 안 돼요. 펼친 글을 길게 눌러 복사해 주세요.');
    }
  }

  const panelRef = useRef<HTMLDivElement>(null);
  /* 포커스가 어디에도 없을 때(앱 안 알림 띠의 "열기"가 사라지며 body 로 떨어진 뒤 등) 일정이 열리면 패널 자체(tabIndex=-1, 제목을 읽어 줌)로 옮긴다 — 사파리에서 스크롤이 튀지 않게 preventScroll —
     클릭한 칸 등 포커스가 이미 있으면 건드리지 않는다.
     한 칸 화면(≤1100)에선 상세가 달력 자리를 차지하니(CSS) 맨 위부터 보이게 올린다 — 뒤로 가기 기록(useBackClose, 마이크로태스크)을
     쌓은 뒤에 올린다. 먼저 올리면 브라우저가 달력 기록의 스크롤을 맨 위로 적어 두어, 닫을 때 달력이 맨 위로 돌아간다 */
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body) panelRef.current?.focus({ preventScroll: true });
    if (matchMedia('(max-width:1100px)').matches) queueMicrotask(() => window.scrollTo({ top: 0 }));
  }, [ev.id]);

  const menuBox = useRef<HTMLSpanElement>(null);
  const stBox = useRef<HTMLSpanElement>(null);
  useDismiss(menu, () => setMenu(false), menuBox);
  useDismiss(stMenu, () => setStMenu(false), stBox);
  /* 메뉴가 열린 채 뒤로 가기 — 메뉴만 닫는다(상세는 layer 0, 메뉴는 그 위) */
  useBackClose(menu, () => setMenu(false));
  useBackClose(stMenu, () => setStMenu(false));

  const inIds = new Set(ev.participants.map((p) => p.uid));
  const candidates = (members ?? []).filter((m) => !inIds.has(m.uid));
  const book = (booked: boolean) => { setStMenu(false); if (ev.booked !== booked) void club.setBooked(ev.id, booked); };

  const talk = hasTalk && (
    <Fold key="talk" name="날짜 협의" sum={talkSummary(ev)} open={talkOpen} onOpen={setTalkOpen} className="evp-talk">
      {undecided ? <EventTalk ev={ev} club={club} meUid={meUid} onPicked={onPicked} />
        : <EventTalkDone ev={ev} club={club} onCalcWindow={onCalcWindow && ((w) => onCalcWindow(w, ev))} onPicked={onPicked} />}
    </Fold>
  );
  /* 정산(§4.13) — 참여자·운영진·만든 사람(정산이 있으면 항목에 든 사람도). 접힌 줄은 SettlePanel 이 그린다(정산 값을 그쪽이 든다) */
  const settle = <SettlePanel key={'stl' + ev.id} ev={ev} club={club} meUid={meUid} />;

  return (
    <div className="evp evp2" ref={panelRef} tabIndex={-1} aria-labelledby="evp-title" onPointerDown={keepTimeFocus} onMouseDown={keepTimeFocus}>
      <div className="evp-top">
        {/* 한 칸 화면에선 상세가 화면을 차지한다 — 캘린더로 돌아가는 단추(닫기와 같다). 넓은 화면은 × */}
        <button type="button" className="evp-back" onClick={close}>
          <Ic size={20}><path d="m15 6-6 6 6 6" /></Ic>캘린더
        </button>
        <span className="evp-tools" ref={menuBox}>
          {/* 메뉴에 남은 건 수정·삭제뿐이라 고칠 수 있는 사람에게만 ⋯ 를 보인다 */}
          {ev.canManage && (
            <button type="button" className="evp-more" aria-label="더 보기 메뉴" title="더 보기" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" /></svg>
            </button>
          )}
          {menu && ev.canManage && (
            <div className="evp-menu" role="menu" aria-label="일정 메뉴">
              <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenu(false); onEdit(ev); }}>
                <Ic><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Ic>수정
              </button>
              <span className="evp-menu-sep" role="separator" />
              <button
                type="button" role="menuitem" className="danger" disabled={busy}
                onClick={() => { setMenu(false); if (confirm('이 일정을 지울까요? 참여한 사람들 화면에서도 사라져요.')) void club.remove(ev.id); }}
              >
                <Ic><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Ic>삭제
              </button>
            </div>
          )}
          <button type="button" className="btn-x evp-x" aria-label="닫기" onClick={close}>×</button>
        </span>
      </div>

      <div className="evp-hd">
        {canBook ? (
          <span className="evp-st-w" ref={stBox}>
            <button
              type="button" className={'chip-st evp-st ' + st} disabled={busy}
              aria-haspopup="menu" aria-expanded={stMenu} aria-label={`예약 상태 바꾸기: 지금 ${ev.booked ? '예약 완료' : '예약 전'}`}
              onClick={() => setStMenu(!stMenu)}
            >
              {STATUS_LABEL[st]}<Ic size={14}><path d="m6 9 6 6 6-6" /></Ic>
            </button>
            {stMenu && (
              <div className="evp-menu evp-st-menu" role="menu" aria-label="예약 상태">
                <button type="button" role="menuitemradio" aria-checked={!ev.booked} disabled={busy} onClick={() => book(false)}>
                  <i className="cal-dot before" />예약 전
                </button>
                <button type="button" role="menuitemradio" aria-checked={ev.booked} disabled={busy} onClick={() => book(true)}>
                  <i className="cal-dot done" />예약 완료
                </button>
              </div>
            )}
          </span>
        ) : <span className={'chip-st ' + st}>{STATUS_LABEL[st]}</span>}
        {/* 누가 바꿀 수 있는지 — 메뉴(role=menu) 밖, 칩 바로 아래 작은 글 */}
        {canBook && <p className="evp-st-hint">참여한 사람, 만든 사람, 운영진이 바꿀 수 있어요.</p>}
        <h2 className="evp-title" id="evp-title">{eventTitle(ev)}</h2>
      </div>

      {/* 주 단추 — 넓은 화면은 제목 바로 아래, 한 칸 화면은 맨 아래 막대(CSS order·sticky). 읽는 순서는 제목 다음 */}
      <div className="evp-bar">
        <button type="button" className="btn evp-copy" onClick={() => void copyPost()}>
          <Ic size={18}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Ic>카톡 글 복사
        </button>
        {ev.joined ? (
          <button type="button" className="btn evp-join" disabled={busy} onClick={() => void club.leave(ev.id)}>참여 취소</button>
        ) : full ? (
          <button type="button" className="btn evp-join" disabled>마감</button>
        ) : (
          <button type="button" className="btn-go evp-join" disabled={busy} onClick={() => void club.join(ev.id)}>참여하기</button>
        )}
      </div>

      <section className="evp-facts" aria-label="언제, 어디, 몇 명">
        <span className="evp-when">
          {undecided ? `후보 날짜 ${ev.candidates.length}개` : `${monthDayLabel(ev.date as string)} · ${dDay(ev.date as string, todayKst())}`}
        </span>
        <span className="evp-time">
          {undecided ? <>날짜 미정{time && <small> {time}</small>}</>
            : t0 ? <>{t0}{t1 && <small> – {t1}</small>}</>
            : '하루 종일'}
        </span>
        <div className="evp-facts-rows">
          {place && (
            <div className="evp-fact">
              <Ic size={20}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Ic>
              <span className="sr-only">어디: </span><span className="evp-fact-v">{place}</span>
            </div>
          )}
          <div className="evp-fact">
            <Ic size={20}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.2 2.5 3.5 5.2" /></Ic>
            <span className="sr-only">몇 명: </span><b className="evp-fact-n">{ppl.n}</b>
            {ppl.left && <span className={'evp-fact-s' + (full ? ' full' : '')}>· {ppl.left}</span>}
          </div>
          <div className="evp-fact sub">
            <Ic size={20}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Ic>
            <span>만든 사람 <MemberLink uid={ev.createdBy.uid} name={ev.createdBy.nickname} /></span>
          </div>
          {/* 내 캘린더에 넣기(2026-10-23) — 날짜가 정해진 일정만. 구글은 새 탭의 일정 추가 화면, 애플·기타는 .ics 파일 */}
          {calUrl && (
            <div className="evp-fact sub evp-cal">
              <Ic size={20}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4" /></Ic>
              <span>내 캘린더에 넣기</span>
              <a className="evp-cal-b" href={calUrl} target="_blank" rel="noopener noreferrer">구글</a>
              <button type="button" className="evp-cal-b" onClick={saveIcs}>애플·기타</button>
            </div>
          )}
        </div>
      </section>

      {ev.segments.length > 0 && (
        <section className="evp-course" aria-labelledby="evp-course-h">
          <h3 className="evp-h" id="evp-course-h">코스</h3>
          <ol className="evp-segs">
            {ev.segments.map((g, i) => {
              const prev = i > 0 ? ev.segments[i - 1] : null;
              /* 사이 이동 시간 = 다음 시작 − 이전 끝. 이전 끝을 모르면 적지 않는다 */
              const move = prev && prev.endMin !== null ? g.startMin - prev.endMin : null;
              /* 구간(테마)마다 참여자 전원을 이름 + 색 점으로 — 안 해 봄 초록, 해 봄 빨강 */
              const dots = playedDots(g.playedBy, ev.participants);
              const [s0, s1] = rangeLabel(g.startMin, g.endMin).split('–');
              const dur = g.endMin !== null ? g.endMin - g.startMin : null;
              return (
                <li key={i} className="evp-seg2">
                  {move !== null && move >= 0 && <div className="evp-move"><i aria-hidden="true" />이동 {move}분</div>}
                  <div className="evp-seg-row">
                    <span className="evp-seg-t"><b>{s0}</b>{s1 && <span>~{s1}</span>}</span>
                    <span className="evp-seg-m">
                      <span className="evp-seg-n">{g.themeName}</span>
                      {(g.branchName || dur) && <span className="evp-seg-b">{[g.branchName, dur ? `${dur}분` : ''].filter(Boolean).join(' · ')}</span>}
                    </span>
                  </div>
                  {dots.length > 0 && <p className="evp-seg-ppl"><PlayedDots dots={dots} link /></p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {undecided && <div className="evp-folds">{talk}{helper}</div>}

      <section className="evp-people" aria-labelledby="evp-ppl-h">
        <div className="evp-ph">
          <h3 className="evp-h" id="evp-ppl-h">참여자 <span>{ev.capacity === null ? ev.count : `${ev.count}/${ev.capacity}`}</span></h3>
          {ev.canManage && (
            <button type="button" className="evp-add" aria-expanded={picking} disabled={busy || (full && !picking)}
              onClick={() => void openPick()}><Ic size={16}><path d="M12 5v14M5 12h14" /></Ic>대신 넣기</button>
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
        <ul className="evp-plist">
          {ev.participants.map((p) => (
            <li key={p.uid} className={'evp-pr' + (perPerson.has(p.uid) ? ' played' : '')}>
              <span className="evp-pa" aria-hidden="true"><AvaText name={p.nickname} /></span>
              <span className="evp-pn">
                <MemberLink uid={p.uid} name={p.nickname} />
                {p.uid === ev.createdBy.uid && <i>만든 사람</i>}
                {perPerson.has(p.uid) && <em>해 봄 {perPerson.get(p.uid)}</em>}
              </span>
              {ev.canManage && (
                <button
                  type="button" className="evp-px" aria-label={`${p.nickname} 빼기`} title={`${p.nickname} 빼기`} disabled={busy}
                  onClick={() => { if (confirm(`${p.nickname} 님을 이 일정에서 뺄까요?`)) void club.removePerson(ev.id, p.uid); }}
                ><X /></button>
              )}
            </li>
          ))}
          {ev.participants.length === 0 && <li className="evp-pr evp-pr-empty"><span className="evp-pa" aria-hidden="true" /><span className="evp-pn">아직 참여한 사람이 없어요</span></li>}
          {ev.capacity !== null && ev.capacity > ev.count && ev.participants.length > 0 && (
            <li className="evp-pr evp-pr-empty"><span className="evp-pa" aria-hidden="true" /><span className="evp-pn">빈자리 {ev.capacity - ev.count}개</span></li>
          )}
        </ul>
      </section>

      {ev.memo && (
        <section className="evp-text" aria-labelledby="evp-memo-h">
          <h3 className="evp-h" id="evp-memo-h">메모</h3>
          <p>{ev.memo}</p>
        </section>
      )}

      {undecided ? <div className="evp-folds">{settle}</div> : <div className="evp-folds">{settle}{talk}{helper}</div>}

      {/* 일정 댓글(§4.16) — 서버가 모르면 숨는다 */}
      <EventComments key={'evc' + ev.id} eventId={ev.id} />

      {showPost && <code className="evp-post" ref={postRef}>{post}</code>}

    </div>
  );
}
