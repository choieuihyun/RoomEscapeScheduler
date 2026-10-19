import { useCallback, useEffect, useRef, useState } from 'react';
import { useScheduler } from './scheduler/useScheduler';
import { useTheme } from './useTheme';
import { useTour } from './useTour';
import { useLoadModal } from './useLoadModal';
import { useAuth } from './useAuth';
import { usePlans } from './usePlans';
import { useSaveModal } from './useSaveModal';
import { useWatches, buildWatchControl } from './useWatches';
import { useCalendar } from './useCalendar';
import { useView, decideFirstScreen } from './useView';
import { useClubEvents } from './useClubEvents';
import { addDays } from './clubEvents';
import { monthGrid, toISO, type SearchResultRow } from './core';
import { readEventHash } from './eventLink';
import { errorCode, getEvent, isMissingApi, sayClub, type EventDto } from './server';
import { isClubAdmin, memberName, useMembers } from './useMembers';
import { MembersPage } from './components/MembersPage';
import { HomePage } from './components/HomePage';
import { ThemeList } from './components/ThemeList';
import { ConditionsPanel } from './components/ConditionsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { LoadModal } from './components/LoadModal';
import { AuthModal } from './components/AuthModal';
import { SaveModal } from './components/SaveModal';
import { EventForm } from './components/EventForm';
import { useEventFormModal } from './useEventFormModal';
import { PlanSection } from './components/PlanSection';
import { WatchListModal } from './components/WatchListModal';
import { CalendarPage } from './components/CalendarPage';
import { SideNav } from './components/SideNav';
import { CalendarSide } from './components/CalendarSide';
import { Toaster } from './components/Toaster';
import { showToast } from './toast';

export function SchedulerPage() {
  const s = useScheduler();
  const theme = useTheme();
  const tour = useTour();
  const loadModal = useLoadModal(s.addServerThemes);
  const auth = useAuth();
  const plans = usePlans(auth.me);
  const saveModal = useSaveModal(auth, () => s.lastSnapshot.current || s.serializeNow(), () => {
    plans.reload();
    showToast('일정을 저장했어요.');
  });
  const watches = useWatches(auth.me);
  /* 빈자리 알림은 승인 멤버만. 다만 member 가 null 이면 서버가 동호회 기능을 아직 모르거나
     못 불러온 것이라 지금처럼 로그인만으로 허용한다 — 서버가 실제로 막으면 403 NOT_MEMBER
     문구가 그대로 나오므로 안전하다. 불러오는 중에는 승인 전과 같이 막는다. */
  const approved: boolean | 'loading' = auth.memberLoading ? 'loading'
    : auth.member === null ? true
    : auth.member.status === 'APPROVED';
  const watchCtl = auth.cloudOn ? buildWatchControl(watches, !!auth.me, approved) : undefined;
  const cal = useCalendar();
  const isAdmin = isClubAdmin(auth.member);
  /* 동호회 일정 목록은 여기서 한 번만 만든다 — 홈(E7)과 캘린더(E6)가 같이 쓴다. 승인 멤버만 부른다. */
  const clubOn = auth.cloudOn && auth.member?.status === 'APPROVED';
  const today = toISO(new Date());
  /* 캘린더 범위 — 월 보기는 보이는 달 칸(최대 42일), 주·일 보기는 고른 날이 든 달 칸. 홈 범위와 겹쳐도 병합이 중복을 없앤다. */
  const calMonth = cal.mode === 'month' ? cal.cursor : { y: +cal.selected.slice(0, 4), m: +cal.selected.slice(5, 7) - 1 };
  const calGrid = monthGrid(calMonth.y, calMonth.m);
  /* 홈 미니 달력이 보이는 달 — 그 달 칸도 범위에 넣어 다른 달로 넘겨도 일정 수가 보이게 한다(캘린더 범위와 같으면 뺀다) */
  const [homeMonth, setHomeMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const homeGrid = monthGrid(homeMonth.y, homeMonth.m);
  const calRange = { from: toISO(calGrid[0]), to: toISO(calGrid[calGrid.length - 1]) };
  const homeCalRange = { from: toISO(homeGrid[0]), to: toISO(homeGrid[homeGrid.length - 1]) };
  const club = useClubEvents(clubOn, [
    { from: today, to: addDays(today, 61) },
    calRange,
    ...(homeCalRange.from === calRange.from ? [] : [homeCalRange]),
  ]);
  const stepHomeMonth = (dir: 1 | -1) => setHomeMonth(c => {
    const d = new Date(c.y, c.m + dir, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  /* 새 API 가 아직 없는 서버(404)면 홈 메뉴·홈 화면을 숨기고 나머지는 그대로 돈다 */
  const homeOn = clubOn && club.api === 'on';
  /* 일정 만들기·수정 창 — 캘린더(E6)·홈(E7)·결과 카드(E8)가 이 하나를 연다 */
  const eventForm = useEventFormModal();
  /* 결과 카드 → 일정 창. 날짜는 첫 스텝 테마를 불러올 때 고른 날짜, 없으면 오늘 */
  const postToClub = (r: SearchResultRow) => {
    const id = s.themesReady[r.steps[0]?.i]?.id;
    const date = s.themes.find((t) => t.id === id)?.date;
    eventForm.openFromSteps(date ?? toISO(new Date()), r.steps);
  };
  /* 첫 화면은 로그인 복원·승인 확인·일정 API 확인이 끝나야 정한다 — 그 전엔 화면을 비워 두어
     calc → 홈(또는 홈 → calc)으로 손 밑에서 바뀌지 않게 한다. */
  const decided = decideFirstScreen({
    cloudOn: auth.cloudOn, authLoading: auth.authLoading, loggedIn: !!auth.me, memberChecked: auth.memberChecked,
    member: auth.member, clubApi: club.api, clubError: club.error,
  });
  const nav = useView({ calendarOn: auth.cloudOn, isAdmin, homeOn, decided });
  const members = useMembers(isAdmin, nav.view === 'members', auth.refreshMember);

  /* ── 일정 상세 패널과 `#e=<id>` 링크 (계획 Task E6) ── */
  const { setOpenEvent, select: calSelect } = cal;
  /* 주소의 #e= 만 지운다(경로·?view= 는 그대로, 다른 해시는 건드리지 않는다). 패널이 링크 일정을 떠나면 부른다 —
     남겨 두면 새로고침했을 때 처음 링크 일정이 다시 열린다. */
  const dropLink = useCallback(() => {
    if (readEventHash(location.hash) !== null) history.replaceState(history.state, '', location.pathname + location.search);
  }, []);
  const closeEvent = useCallback(() => { setOpenEvent(null); dropLink(); }, [setOpenEvent, dropLink]);
  /* 칩·줄을 눌러 일정을 연다. 링크로 연 일정과 다른 일정이면 #e= 를 지운다 */
  const openEvent = useCallback((ev: EventDto) => {
    if (readEventHash(location.hash) !== ev.id) dropLink();
    calSelect(ev.date);
    setOpenEvent(ev.id);
  }, [dropLink, calSelect, setOpenEvent]);
  /* 홈에서 줄·"일정 자세히 보기"를 누르면 캘린더 화면으로 넘어가 그 일정 상세를 연다 */
  const openFromHome = (ev: EventDto) => { nav.go('calendar'); openEvent(ev); };
  /* 홈 미니 달력의 날짜 → 캘린더 화면에서 그날을 고른다. 열려 있던 일정 상세는 닫는다(캘린더의 날짜 고르기와 같게) */
  const pickFromHome = (iso: string) => {
    nav.go('calendar');
    calSelect(iso);
    if (cal.openEvent !== null) closeEvent();
  };
  const pendingCount = members.list?.filter(m => m.status === 'PENDING').length ?? 0;
  /* 연 일정이 목록에서 사라지면(지움·로그아웃) 패널도 닫는다 */
  const openGone = cal.openEvent !== null && !club.events.some(e => e.id === cal.openEvent);
  useEffect(() => { if (openGone) closeEvent(); }, [openGone, closeEvent]);

  /* 링크로 열 일정 id. 로그인 복원·멤버 확인이 끝난 뒤에 해시를 읽는다 — 그 전에 읽으면 저장된 로그인이
     복원되기도 전에 로그인 창이 뜬다. 카카오 왕복은 돌아온 뒤 replaceState 로 해시를 되살려(hashchange 없음)
     로그인한 사람이 바뀔 때도 다시 읽는다. */
  const [linkId, setLinkId] = useState<number | null>(null);
  const authSettled = !auth.authLoading && (!auth.me || auth.memberChecked);
  const meUid = auth.me?.uid ?? '';
  useEffect(() => {
    if (!auth.cloudOn || !authSettled) return;
    const read = () => { const id = readEventHash(location.hash); if (id !== null) setLinkId(id); };
    void Promise.resolve().then(read); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, [auth.cloudOn, authSettled, meUid]);

  const askedFor = useRef<number | null>(null); // 로그인 창을 이미 띄운 링크 — 한 번만 띄운다
  const linkBusy = useRef(false);
  const { openAuth } = auth;
  const { adopt } = club;
  const { go } = nav;
  const memberStatus = auth.member?.status ?? null;
  useEffect(() => {
    if (linkId === null || !authSettled) return;
    if (!auth.me || (memberStatus !== null && memberStatus !== 'APPROVED')) {
      /* 로그아웃·승인 전 — 로그인 창(승인 전이면 그 안에서 가입 신청·승인 대기)을 연다. 승인되면 이어서 연다 */
      if (askedFor.current !== linkId) { askedFor.current = linkId; openAuth(); }
      return;
    }
    if (!clubOn) { // 서버가 동호회 기능을 모른다(멤버 확인 404) — 링크는 버린다
      void Promise.resolve().then(() => setLinkId(null));
      return;
    }
    if (linkBusy.current) return;
    linkBusy.current = true;
    const id = linkId;
    void (async () => {
      try {
        const t = await (await import('./cloud')).idToken();
        if (!t) return;
        const ev = await getEvent(id, t);
        adopt(ev);
        go('calendar');
        calSelect(ev.date);
        setOpenEvent(ev.id);
      } catch (e) {
        if (errorCode(e) === 'NO_SUCH_EVENT') {
          showToast('일정을 찾을 수 없어요. 지워졌을 수 있어요.');
          if (readEventHash(location.hash) === id) history.replaceState(history.state, '', location.pathname + location.search);
        } else if (!isMissingApi(e)) {
          showToast(sayClub(e));
        }
      } finally {
        linkBusy.current = false;
        setLinkId(cur => (cur === id ? null : cur));
      }
    })();
  }, [linkId, authSettled, auth.me, memberStatus, clubOn, openAuth, adopt, go, calSelect, setOpenEvent]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (loadModal.open) loadModal.close();
      if (auth.open) auth.closeAuth();
      if (saveModal.open) saveModal.close();
      if (eventForm.open) eventForm.close();
      if (watches.open) watches.close();
      tour.end();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [loadModal, auth, saveModal, eventForm, watches, tour]);

  /* 화면을 바꾸면 새 화면의 맨 위부터 보여준다. */
  useEffect(() => { window.scrollTo({ top: 0 }); }, [nav.view]);

  /* 투어는 계산 화면의 요소를 가리킨다 — 캘린더에서 누르면 계산 화면으로 먼저
     넘어간 뒤(다음 틱, 요소가 다시 보인 다음) 시작한다. */
  const startTour = () => {
    if (nav.view === 'calc') tour.start();
    else { nav.go('calc'); setTimeout(tour.start, 60); }
  };

  const onCalc = nav.view === 'calc';
  return (
    <div className="shell">
      <SideNav
        view={nav.view} onView={nav.go} auth={auth} homeOn={homeOn}
        watchCount={watches.watches.length} watchLimit={watches.limit} onWatches={watches.openModal}
        onTour={startTour} dark={theme.dark} onToggleTheme={theme.toggle}
        isAdmin={isAdmin} pendingCount={pendingCount}
      >
        {nav.view === 'calendar' && <CalendarSide ctl={cal} clubOn={homeOn} />}
      </SideNav>

      <main className="main">
        {/* 계산 화면은 캘린더로 넘어가도 지우지 않고 숨기기만 한다 — 입력·결과·"더 보기"
            같은 컴포넌트 안 상태가 그대로 남아 돌아왔을 때 이어서 볼 수 있다. */}
        <div className={'view' + (onCalc ? '' : ' off')}>
          <header className="page-head">
            <h1>조합 계산</h1>
            <p>테마별 예약 시간을 넣으면 겹치지 않게 이어서 갈 수 있는 조합을 다 찾아 드려요. 중간에 비는 시간도 같이 보여요.</p>
          </header>
          <ThemeList s={s} onOpenLoad={loadModal.openModal} watchCtl={watchCtl} />
          <ConditionsPanel s={s} />
          <ResultsPanel s={s} onSave={auth.cloudOn ? saveModal.openSave : undefined} onClubPost={homeOn ? postToClub : undefined} watchCtl={watchCtl} />
          <PlanSection auth={auth} plans={plans} s={s} />
        </div>

        {homeOn && (
          <div className={'view home-view' + (nav.view === 'home' ? '' : ' off')}>
            <header className="page-head">
              <h1>홈</h1>
            </header>
            <HomePage
              club={club} today={today} nickname={auth.member ? memberName(auth.member) : ''} isAdmin={isAdmin}
              watchCount={watches.watches.length} watchLimit={watches.limit} pendingCount={pendingCount}
              month={homeMonth} onMonth={stepHomeMonth}
              onWatches={watches.openModal} onMembers={() => nav.go('members')}
              onNewEvent={() => eventForm.openNew()} onCalc={() => nav.go('calc')}
              onOpenEvent={openFromHome} onPickDay={pickFromHome}
            />
          </div>
        )}

        {auth.cloudOn && (
          <div className={'view' + (nav.view === 'calendar' ? '' : ' off')}>
            <header className="page-head">
              <h1>캘린더</h1>
              <p>{homeOn ? '동호회 일정과 저장한 일정, 빈자리 알림을' : '저장한 일정과 빈자리 알림을'} 날짜별로 모아 봐요. 날짜를 누르면 그날 예약할 수 있는 회차도 볼 수 있어요.</p>
            </header>
            <CalendarPage
              ctl={cal} active={nav.view === 'calendar'} plans={plans} watches={watches} auth={auth} s={s}
              onLoaded={() => { nav.go('calc'); showToast('일정을 불러왔어요.'); }}
              club={club} clubOn={homeOn}
              onNewEvent={eventForm.openNew} onEditEvent={eventForm.openEdit} onCloseEvent={closeEvent} onOpenEvent={openEvent}
            />
          </div>
        )}

        {isAdmin && (
          <div className={'view' + (nav.view === 'members' ? '' : ' off')}>
            <header className="page-head">
              <h1>멤버 관리</h1>
              <p>가입 신청을 오픈채팅 닉네임과 맞춰 보고 승인해 주세요. 한 사람이 계정을 여러 개 만들었으면 하나만 승인하면 돼요.</p>
            </header>
            <MembersPage ctl={members} meUid={auth.member?.uid ?? ''} />
          </div>
        )}
      </main>

      <AuthModal auth={auth} />
      <LoadModal m={loadModal} />
      <SaveModal m={saveModal} />
      {clubOn && <EventForm m={eventForm} create={club.create} update={club.update} />}
      {auth.cloudOn && <WatchListModal w={watches} />}
      <Toaster />
    </div>
  );
}
