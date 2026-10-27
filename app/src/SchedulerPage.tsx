import { useCallback, useEffect, useRef, useState } from 'react';
import { recordPlanPlayed } from './played';
import { useScheduler } from './scheduler/useScheduler';
import { useTheme } from './useTheme';
import { useTour } from './useTour';
import type { AddedTheme } from './scheduler/types';
import { useAuth } from './useAuth';
import { usePlans } from './usePlans';
import { useSaveModal } from './useSaveModal';
import { useWatches, buildWatchControl } from './useWatches';
import { useCalendar } from './useCalendar';
import { useView, decideFirstScreen, myProfileView, type View } from './useView';
import { useClubEvents } from './useClubEvents';
import { useProfile } from './useProfile';
import { useTodayKst } from './useToday';
import { addDays, eventTitle, sortKeyDate, todayKst, windowLabel, windowToCalc } from './clubEvents';
import { countOtherCtx, countSame, ctxAlive, dropOtherCtx, insertMode, stepCards, type EventCtx } from './eventFlow';
import { monthGrid, toISO, type SearchResultRow } from './core';
import { readEventHash } from './eventLink';
import { bannerOf, swOpenId } from './swLink';
import { listenForegroundPush, PUSH_READY_EVT } from './notify';
import { usePushDevice } from './usePushDevice';
import { errorCode, getEvent, isMissingApi, sayClub, type EventDto } from './server';
import { isClubAdmin, memberName, useMembers } from './useMembers';
import { canEditProfile, needsProfile, profileApiOn } from './profileGate';
import { ThemeList } from './components/ThemeList';
import { ConditionsPanel, TimeBar } from './components/ConditionsPanel';
import { useEventFormModal } from './useEventFormModal';
import { Ic } from './components/Ic';
import { SideNav } from './components/SideNav';
import { CalendarSide } from './components/CalendarSide';
import { Toaster } from './components/Toaster';
import { lazyRetry } from './lazyRetry';
import { hist, useBackClose } from './backStack';
import { LazyBoundary, StaleNotice } from './components/LazyBoundary';
import { PushBanner } from './components/PushBanner';
import { showPushBanner, showToast } from './toast';
import { canInstall, closeInstallGuide, startInstall, useInstall } from './installPrompt';

/* 동호회·캘린더·내 정보 화면은 처음 쓸 때 받는다 — 로그인 전 첫 화면(조합 계산)이 이 코드를 받지 않게 한다 */
const MembersPage = lazyRetry(() => import('./components/MembersPage').then(m => ({ default: m.MembersPage })));
const HomePage = lazyRetry(() => import('./components/HomePage').then(m => ({ default: m.HomePage })));
const ProfilePage = lazyRetry(() => import('./components/ProfilePage').then(m => ({ default: m.ProfilePage })));
const MorePage = lazyRetry(() => import('./components/MorePage').then(m => ({ default: m.MorePage })));
const EventForm = lazyRetry(() => import('./components/EventForm').then(m => ({ default: m.EventForm })));
const CalendarPage = lazyRetry(() => import('./components/CalendarPage').then(m => ({ default: m.CalendarPage })));
/* 테마 고르기 창 — 시간표 계산의 테마 불러오기(테마째). 일정 만들기의 테마 찾아서 넣기(회차)와 같은 창 */
const ThemePicker = lazyRetry(() => import('./components/ThemePicker').then(m => ({ default: m.ThemePicker })));
const AuthModal = lazyRetry(() => import('./components/AuthModal').then(m => ({ default: m.AuthModal })));
const SaveModal = lazyRetry(() => import('./components/SaveModal').then(m => ({ default: m.SaveModal })));
const WatchListModal = lazyRetry(() => import('./components/WatchListModal').then(m => ({ default: m.WatchListModal })));
const PushGuide = lazyRetry(() => import('./components/PushGuide').then(m => ({ default: m.PushGuide })));
const InstallGuide = lazyRetry(() => import('./components/InstallGuide').then(m => ({ default: m.InstallGuide })));
/* 멤버 목록·랭킹 화면과 프로필 창(§4.11)은 한 청크 — 진입 청크에 늘어나는 것을 줄인다 */
const MemberViews = lazyRetry(() => import('./components/MemberViews').then(m => ({ default: m.MemberViews })));
/* 시간표 계산의 결과·내 일정(2026-10-21 개편) — 계산을 누른 뒤·로그인했을 때만 보여서 늦게 받는다(진입 청크 크기, §4.64).
   테마를 넣으면 미리 받아 둔다(아래 effect) */
const ResultsPanel = lazyRetry(() => import('./components/ResultsPanel').then(m => ({ default: m.ResultsPanel })));
const PlanSection = lazyRetry(() => import('./components/PlanSection').then(m => ({ default: m.PlanSection })));

/* 배포 뒤 옛 탭에서 청크를 못 찾으면(vite:preloadError) 맨 위 띠로 한 번 알린다.
   그리고 화면으로 돌아올 때·30분마다 첫 화면 파일 이름(index-해시.js)을 서버 것과 견줘, 새 버전이 나왔으면 같은 띠를 띄운다
   — 열어 둔 탭·홈 화면 앱이 새로 고침 전까지 예전 화면에 머무는 것(2026-10-22) */
const myEntry = (): string => {
  const src = [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-[\w-]+\.js/.test(s));
  return src ? (src.match(/index-[\w-]+\.js/)?.[0] ?? '') : '';
};
function useStaleStrip(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setStale(true); };
    window.addEventListener('vite:preloadError', on);
    if (!import.meta.env.PROD) return () => window.removeEventListener('vite:preloadError', on);
    const mine = myEntry();
    let last = 0;
    const check = () => {
      if (!mine || document.visibilityState !== 'visible' || Date.now() - last < 60_000) return;
      last = Date.now();
      fetch(`${import.meta.env.BASE_URL}?v=${last}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((html) => { const now = html.match(/index-[\w-]+\.js/)?.[0]; if (now && now !== mine) setStale(true); })
        .catch(() => {});
    };
    const t = window.setInterval(check, 30 * 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('vite:preloadError', on);
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return stale;
}

/* 넓은 화면(왼쪽 메뉴, >900px)인지 — 더보기(§4.60)는 좁은 화면 전용이라 넓어지면 내 정보로 바꾼다 */
/* CSS 의 max-width:900px 와 정확히 반대 — min-width:901px 는 900~901 사이 소수 폭이 양쪽에서 빠진다 */
const WIDE = 'not all and (max-width: 900px)';
function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/* 한 번이라도 참이었으면 계속 참 — 화면을 처음 열 때 코드를 받고, 이후엔 지우지 않고 숨기기만 해 안의 상태를 지킨다 */
function useEver(on: boolean): boolean {
  const [ever, setEver] = useState(on);
  if (on && !ever) setEver(true);
  return ever || on;
}

/* 일정 링크 `#e=<id>` 로 연다 — 아래 hashchange 경로가 받는다. 이미 같은 해시면 바꿔도 이벤트가 없어 직접 알린다.
   알림을 눌렀는데 서비스 워커가 창을 못 옮긴 경우와 앱 안 알림 띠의 "열기"가 쓴다. */
function openEventHash(id: number) {
  if (readEventHash(location.hash) === id) dispatchEvent(new HashChangeEvent('hashchange'));
  else hist.hash(() => { location.hash = `e=${id}`; }); // 열린 창(일정 창 등)은 그대로 두는 이동
}

/* 앱 안 알림 띠의 "열기" — 띠가 사라지며 포커스가 body 로 떨어진다. 일정 패널이 이미 열려 있으면 새로 그려지지 않아
   패널 쪽 포커스 이동이 일어나지 않으니, 곧 패널의 닫기(×)로 옮긴다(다른 곳에 포커스가 생겼으면 건드리지 않는다). */
function openFromBanner(id: number) {
  openEventHash(id);
  let n = 0;
  const tick = () => {
    const a = document.activeElement;
    if (!a || a === document.body) {
      const x = document.querySelector<HTMLElement>('.evp .btn-x');
      if (x) { x.focus(); return; }
    } else return;
    if (++n < 30) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function SchedulerPage() {
  const s = useScheduler();
  const theme = useTheme();
  const tour = useTour();
  /* 앱 설치 단추(2026-10-22) — 왼쪽 메뉴·더보기 행·홈 띠가 같은 것을 부른다. 크롬은 설치 창, 아이폰·카카오톡은 안내 창 */
  const install = useInstall();
  const installOn = canInstall(install.state);
  const onInstall = useCallback(() => {
    void startInstall().then((o) => { if (o === 'accepted') showToast('설치했어요.'); });
  }, []);
  const [loadOpen, setLoadOpen] = useState(false);
  const closeLoad = useCallback(() => setLoadOpen(false), []);
  const auth = useAuth();
  /* 동호회 API 가 켜진 승인 멤버일 때만 다녀온 일정을 해 본 테마로 잇는다(homeOn 은 아래에서 정해진다) */
  const planDoneRef = useRef<((steps: { name: string }[], date: string) => void) | undefined>(undefined);
  const onPlanDone = useCallback((steps: { name: string }[], date: string) => planDoneRef.current?.(steps, date), []);
  const plans = usePlans(auth.me, onPlanDone);
  const saveModal = useSaveModal(auth, () => s.lastSnapshot.current || s.serializeNow(), () => {
    plans.reload();
    showToast('일정을 저장했어요.');
  }, onPlanDone);
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
  /* 동호회 쪽 '오늘'은 한국 날짜(§4.7) — 홈 범위·홈 화면이 이 값을 쓴다 */
  const today = useTodayKst();
  /* 캘린더 범위 — 월 보기는 보이는 달 칸(최대 42일), 주·일 보기는 고른 날이 든 달 칸. 홈 범위와 겹쳐도 병합이 중복을 없앤다. */
  const calMonth = cal.mode === 'month' ? cal.cursor : { y: +cal.selected.slice(0, 4), m: +cal.selected.slice(5, 7) - 1 };
  const calGrid = monthGrid(calMonth.y, calMonth.m);
  /* 홈 미니 달력이 보이는 달 — 그 달 칸도 범위에 넣어 다른 달로 넘겨도 일정 수가 보이게 한다(캘린더 범위와 같으면 뺀다) */
  const [homeMonth, setHomeMonth] = useState(() => { const t = todayKst(); return { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1 }; });
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
  useEffect(() => {
    planDoneRef.current = homeOn ? (steps, date) => { void recordPlanPlayed(steps, date); } : undefined;
  }, [homeOn]);
  /* 일정 만들기·수정 창 — 캘린더(E6)·홈(E7)·결과 카드(E8)가 이 하나를 연다 */
  const eventForm = useEventFormModal();
  /* 결과 카드 → 일정 창. 날짜는 첫 스텝 테마를 불러올 때 고른 날짜, 없으면 오늘 */
  const postToClub = (r: SearchResultRow) => {
    const c = stepCards(r.steps, s.themesReady, s.themes);
    eventForm.openFromSteps(c.date ?? todayKst(), r.steps, c.keys);
  };
  /* 일정 상세(도우미·"이 시간대로 시간표 계산")에서 온 계산이면 그 일정 — 결과 카드가 "이 일정에 넣기"를 보인다.
     그만두기·다른 일정에서 다시 오기·넣기 성공·지워진 일정·로그아웃이면 놓는다(새로 고침해도 사라진다) */
  const [evCtx, setEvCtx] = useState<EventCtx | null>(null);
  const inserting = useRef(false);
  /* 첫 화면은 로그인 복원·승인 확인·일정 API 확인이 끝나야 정한다 — 그 전엔 화면을 비워 두어
     calc → 홈(또는 홈 → calc)으로 손 밑에서 바뀌지 않게 한다. */
  const decided = decideFirstScreen({
    cloudOn: auth.cloudOn, authLoading: auth.authLoading, loggedIn: !!auth.me, memberChecked: auth.memberChecked,
    member: auth.member, clubApi: club.api, clubError: club.error,
  });
  /* 내 정보(§4.9) — 해 본 테마 API 는 4단계라 일정 API 와 따로 본다. 승인 멤버면 바로 목록을 한 번 받아
     서버가 모르면(본문 없는 404) 메뉴·화면을 숨긴다. 화면 안 데이터는 그 화면에 들어올 때 받는다. */
  /* 좁은 화면 더보기도 같은 숫자(해 본 테마·지난 일정)를 보여서 그 화면에서도 받는다 */
  const [profileActive, setProfileActive] = useState(false);
  const profile = useProfile(homeOn, profileActive, today);
  const profileOn = homeOn && profile.api === 'on';
  /* 멤버 프로필(§4.11) — 서버가 프로필을 알면(MeDto.profile 필드가 있으면) 멤버 목록·랭킹을 연다.
     랭킹·프로필 고치기가 본문 없는 404 면 그 기능만 이 접속 동안 숨긴다 */
  const [rankGone, setRankGone] = useState(false);
  const [editGone, setEditGone] = useState(false);
  const peopleOn = homeOn && profileApiOn(auth.member);
  const rankOn = peopleOn && !rankGone;
  const editOn = canEditProfile(auth.member) && !editGone;
  const [editOpen, setEditOpen] = useState(false);
  const openEdit = editOn ? () => setEditOpen(true) : undefined;
  /* 7단계(§4.12) — 서버가 위시 API 를 아는지는 공유 상태(지연 모듈)가 첫 목록을 받아 알려 준다. 1: 같이 가요 */
  const [club7, setClub7] = useState(0);
  const meUid = auth.me?.uid ?? '';
  const clubUsed = useRef(false);
  useEffect(() => {
    /* 로그아웃·승인 멤버가 아니게 되면 받아 둔 멤버 목록(실명·생일)·위시 묶음·남의 해 본 테마를 버린다 — 모듈을 받은 적이 있을 때만 */
    if (!homeOn) { if (clubUsed.current) import('./clubStore').then((m) => m.stopClub(), () => {}); return; }
    clubUsed.current = true;
    let live = true;
    import('./clubStore').then((m) => m.startClub(meUid, (f) => { if (live) setClub7(f); }, peopleOn), () => {});
    return () => { live = false; };
  }, [homeOn, meUid, peopleOn]);
  const togetherOn = homeOn && (club7 & 1) > 0;
  /* 의견 게시판(§4.15) — 승인 멤버면 메뉴에 둔다. 그 API 가 본문 없는 404 면 이 접속 동안 숨긴다(랭킹과 같다) */
  const [feedbackGone, setFeedbackGone] = useState(false);
  const feedbackOn = homeOn && !feedbackGone;
  const nav = useView({ calendarOn: auth.cloudOn, isAdmin, homeOn, profileOn, decided, peopleOn, rankOn, togetherOn, feedbackOn });
  const onProfile = nav.view === 'profile' || nav.view === 'more';
  if (profileActive !== onProfile) setProfileActive(onProfile);
  const members = useMembers(isAdmin, nav.view === 'members', auth.refreshMember);
  /* 이 기기 알림(§4.10) — 내 정보 카드와 알림 켜기 안내가 같이 쓴다 */
  const push = usePushDevice(clubOn, onProfile);

  /* ── 일정 상세 패널과 `#e=<id>` 링크 (계획 Task E6) ── */
  const { setOpenEvent, select: calSelect } = cal;
  /* 주소의 #e= 만 지운다(경로·?view= 는 그대로, 다른 해시는 건드리지 않는다). 패널이 링크 일정을 떠나면 부른다 —
     남겨 두면 새로고침했을 때 처음 링크 일정이 다시 열린다. */
  const dropLink = useCallback(() => {
    if (readEventHash(location.hash) !== null) hist.replace(history.state, location.pathname + location.search);
  }, []);
  /* 닫을 때 #e= 는 뒤로 가기 기록(useBackClose)을 지운 뒤에 지운다 — 먼저 지우면 #e= 가 남은 아래 기록으로 돌아가며
     hashchange 가 그 일정을 다시 연다. 닫는 일정의 링크일 때만 지운다(다른 일정 링크로 옮겨 가는 중이면 그 링크는 남긴다) */
  const shown = cal.openEvent;
  const closeEvent = useCallback(() => {
    setOpenEvent(null);
    hist.soon(() => { if (readEventHash(location.hash) === shown) dropLink(); });
  }, [setOpenEvent, dropLink, shown]);
  /* 칩·줄을 눌러 일정을 연다. 링크로 연 일정과 다른 일정이면 #e= 를 지운다.
     날짜 미정 일정은 누른 후보 날짜(date)를, 없으면(홈·링크) 오늘 이후 가장 이른 후보를 고른다 */
  const openEvent = useCallback((ev: EventDto, date?: string) => {
    if (readEventHash(location.hash) !== ev.id) dropLink();
    calSelect(date ?? sortKeyDate(ev, todayKst()));
    setOpenEvent(ev.id);
  }, [dropLink, calSelect, setOpenEvent]);
  /* 캘린더 밖 화면으로 옮길 때는 #e= 를 지운다 — 남으면 `?view=calc#e=12` 를 새로고침(iOS 탭 되살림)했을 때 캘린더로 끌려간다 */
  const { go } = nav;
  const goView = useCallback((v: View) => { if (v !== 'calendar') dropLink(); go(v); }, [dropLink, go]);
  /* 더보기는 좁은 화면 전용 — 넓은 화면에서 열리면(주소·창 넓히기) 기록을 쌓지 않고 내 정보(없으면 계산)로.
     내 정보를 쓸 수 있는지(로그인 복원·승인·해 본 테마 API) 알기 전엔 기다린다 — 먼저 계산으로 떨어지지 않게 */
  const wide = useWide();
  const profileKnown = decided && (!homeOn || profile.api !== 'unknown' || profile.error !== '');
  useEffect(() => {
    if (wide && nav.view === 'more' && profileKnown) go(profileOn ? 'profile' : 'calc', true);
  }, [wide, nav.view, profileKnown, profileOn, go]);
  /* 멤버 카드 — 어디서든 이름을 누르면(clubStore.openMember 의 'flod:member'). 내 이름이면 내 프로필 화면으로 */
  const [card, setCard] = useState<{ uid: string; name: string; from: HTMLElement | null } | null>(null);
  if (card && !peopleOn) setCard(null); // 로그아웃·다른 계정이면 열려 있던 카드를 버린다(다시 로그인해도 옛 카드가 뜨지 않게)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ uid: string; name: string; from: HTMLElement | null }>).detail;
      if (d.uid === meUid) goView(myProfileView(wide, profileOn)); else setCard(d);
    };
    addEventListener('flod:member', on);
    return () => removeEventListener('flod:member', on);
  }, [meUid, wide, profileOn, goView]);
  /* 카카오 연결 왕복에서 돌아오면 떠날 때 보던 화면으로(성공·실패 모두) — 실패 문구가 보이는 화면에 닿게 */
  const { returnView } = auth;
  useEffect(() => { if (returnView) go(returnView.view as View, true); }, [returnView, go]);
  /* 좁은 화면에선 연결 실패 문구가 있는 왼쪽 메뉴 계정 자리가 숨어 있다 — 새로 생기면 토스트로도 알린다 */
  useEffect(() => {
    if (auth.linkErr && !matchMedia(WIDE).matches) showToast(auth.linkErr);
  }, [auth.linkErr]);
  /* 홈에서 줄·"일정 자세히 보기"를 누르면 캘린더 화면으로 넘어가 그 일정 상세를 연다 */
  const openFromHome = (ev: EventDto) => { goView('calendar'); openEvent(ev); };
  /* 내 정보의 지난 일정 → 캘린더 상세. 지난 일정은 받아 둔 목록 범위 밖일 수 있어 먼저 목록에 넣는다
     (없으면 '연 일정이 목록에서 사라짐' 처리가 패널을 바로 닫는다) */
  const openFromProfile = (ev: EventDto) => { club.adopt(ev); goView('calendar'); openEvent(ev); };
  /* 캘린더 그날 패널의 "해 본 테마 모두 보기" — 넓은 화면은 내 정보, 좁은 화면은 더보기 › 해 본 테마.
     더보기 하위 화면처럼 기록을 하나 더 쌓아 뒤로 가기가 더보기 목록 → 캘린더로 돌아온다 */
  const openPlayedList = () => {
    goView(wide ? 'profile' : 'more');
    if (!wide) hist.push({ moreSub: 'played' }, location.href);
  };
  /* 왼쪽 미니 달력의 날짜 → 그날을 고르고, 열려 있던 일정 상세는 닫는다(901~1100 에선 상세가 달력 자리를 차지하고 있다) */
  const pickFromSide = (iso: string) => {
    calSelect(iso);
    if (cal.openEvent !== null) closeEvent();
  };
  /* 홈 미니 달력의 날짜 → 캘린더 화면에서 그날을 고른다. 열려 있던 일정 상세는 닫는다(캘린더의 날짜 고르기와 같게) */
  const pickFromHome = (iso: string) => {
    goView('calendar');
    calSelect(iso);
    if (cal.openEvent !== null) closeEvent();
  };
  /* 상세의 "이 시간대로 조합 계산" — 다 같이 되는 시간을 계산 조건(가장 이른 시작·가장 늦은 종료)에 넣고 계산 화면으로 */
  /* 다른 일정 문맥으로 들어오면 앞 일정 문맥에서 넣은 카드는 뺀다(손으로·문맥 없이 넣은 카드는 그대로) — 토스트에 덧붙일 말 */
  const dropOthers = (id: number) => {
    const n = countOtherCtx(s.themes, id);
    return n ? ` 앞 일정의 테마 ${n}개는 뺐어요.` : '';
  };
  /* 문맥을 세울 때 지금 결과를 기억한다 — 다시 계산하기 전의 옛 결과에는 "이 일정에 넣기"를 붙이지 않는다 */
  const calcWindow = (w: { start: number; end: number }, ev: EventDto) => {
    const gone = dropOthers(ev.id);
    if (gone) s.addServerThemes([], ev.id);
    setEvCtx({ id: ev.id, title: eventTitle(ev), date: ev.date, seen: s.found });
    const o = windowToCalc(w);
    s.setOption('oStart', o.oStart);
    s.setOption('oEnd', o.oEnd);
    goView('calc');
    showToast(`시간대(${windowLabel(w)})를 조건에 넣었어요. 테마를 불러와 계산해 보세요.${gone}`);
  };
  /* 상세의 협의 도우미 "고른 테마 n개로 조합 계산" — 회차 불러오기처럼 카드로 넣고 계산 화면으로 */
  /* 같은 날짜·같은 서버 테마는 더하지 않고 카드를 바꾼다(여러 번 보내도 카드 수가 늘지 않는다) */
  const calcThemes = (items: AddedTheme[], ev: EventDto) => {
    const gone = dropOthers(ev.id);
    const same = countSame(dropOtherCtx(s.themes, ev.id), items);
    s.addServerThemes(items, ev.id);
    setEvCtx({ id: ev.id, title: eventTitle(ev), date: items[0]?.date ?? ev.date, seen: s.found });
    goView('calc');
    showToast(`테마 ${items.length}개를 넣었어요${same ? `(${same}개는 이미 있어서 바꿨어요)` : ''}.${gone}`);
  };
  /* 로그아웃·일정 API 꺼짐, 그 일정을 지웠을 때(목록에서 지운 일정) 문맥을 놓는다 */
  if (evCtx && !ctxAlive(evCtx, homeOn, club.gone)) setEvCtx(null);
  const ctxEv = evCtx ? club.events.find((e) => e.id === evCtx.id) : undefined;
  const insMode = insertMode(evCtx, s.found, ctxEv?.canManage);
  /* "이 일정에 넣기" — 저장하면 그 일정 상세를 연다. 본문은 누를 때 받는다(못 받으면 위 옛 탭 띠가 알린다) */
  const insertToEvent = (r: SearchResultRow) => {
    if (!evCtx || inserting.current) return;
    inserting.current = true;
    void import('./eventInsert')
      .then((m) => m.insertResult(evCtx, r.steps, s, club, setEvCtx, (ev) => { goView('calendar'); openEvent(ev); }))
      .finally(() => { inserting.current = false; });
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
  useEffect(() => {
    if (!auth.cloudOn || !authSettled) return;
    const read = () => { const id = readEventHash(location.hash); if (id !== null) setLinkId(id); };
    void Promise.resolve().then(read); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, [auth.cloudOn, authSettled, meUid]);

  /* 알림을 눌렀는데 서비스 워커가 이 창을 옮기지 못하면(관할 밖 창) `{ type: 'open', link }` 를 보낸다 —
     주소를 #e= 로 바꿔 위의 hashchange 경로로 연다. 로그인 확인 전이면 해시만 남고, 확인이 끝나면 위 effect 가 읽는다. */
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => {
      const id = swOpenId(e.data);
      if (id !== null) openEventHash(id);
    };
    sw.addEventListener('message', onMsg);
    return () => sw.removeEventListener('message', onMsg);
  }, []);

  /* 앱 탭이 보이는 동안 온 푸시는 서비스 워커가 띄우지 않는다 — onMessage 로 받아 화면 위 띠로 보인다(§4.10).
     로그인했고 알림이 허용됐을 때만 메시징 SDK 를 받는다. 권한은 바뀌어도 알려 주지 않아서, 이 기기가 등록될 때마다
     (알림 켜기·로그인 때 조용한 등록) 다시 건다. */
  const [pushReady, setPushReady] = useState(0);
  useEffect(() => {
    const on = () => setPushReady(n => n + 1);
    addEventListener(PUSH_READY_EVT, on);
    return () => removeEventListener(PUSH_READY_EVT, on);
  }, []);
  useEffect(() => {
    if (!meUid) return;
    let dead = false, off: (() => void) | null = null;
    /* 일정 알림(댓글 등)이면 열려 있는 그 일정의 댓글 칸이 다시 받게 알린다(EventComments 의 'flod:event-push') */
    listenForegroundPush(p => { const b = bannerOf(p); if (b) { showPushBanner(b); if (b.eventId !== null) dispatchEvent(new CustomEvent('flod:event-push', { detail: b.eventId })); } })
      .then(u => { if (dead) u?.(); else off = u; })
      .catch(e => console.warn('앱 안 알림 받기 실패:', e));
    return () => { dead = true; off?.(); };
  }, [meUid, pushReady]);

  const askedFor = useRef<number | null>(null); // 로그인 창을 이미 띄운 링크 — 한 번만 띄운다
  const linkBusy = useRef(false);
  const { openAuth } = auth;
  const { adopt } = club;
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
        calSelect(sortKeyDate(ev, todayKst()));
        setOpenEvent(ev.id);
      } catch (e) {
        if (errorCode(e) === 'NO_SUCH_EVENT') {
          showToast('일정을 찾을 수 없어요. 지워졌을 수 있어요.');
          if (readEventHash(location.hash) === id) hist.replace(history.state, location.pathname + location.search);
        } else if (!isMissingApi(e)) {
          showToast(sayClub(e));
        }
      } finally {
        linkBusy.current = false;
        setLinkId(cur => (cur === id ? null : cur));
      }
    })();
  }, [linkId, authSettled, auth.me, memberStatus, clubOn, openAuth, adopt, go, calSelect, setOpenEvent]);

  /* "프로필을 채워 주세요"(§4.11) — 프로필이 null 인 가입 신청자·멤버에게. 닫으면 이번 접속 동안은 묻지 않는다(새로 고침·다음 로그인에 다시).
     다른 창·투어·링크로 여는 일정과 겹치지 않게 기다리고, 한 번 뜨면 채우거나 닫을 때까지 둔다. 알림 켜기 안내는 이 창 뒤에 */
  const [askedOff, setAskedOff] = useState('');
  if (askedOff && askedOff !== meUid) setAskedOff(''); // 로그아웃·다른 계정이면 다시 묻는다
  const wantAsk = needsProfile(auth.member) && !editGone && askedOff !== meUid;
  const calm = decided && !auth.open && !eventForm.open && !loadOpen && !saveModal.open && !watches.open && !tour.active && linkId === null
    && readEventHash(location.hash) === null;
  const [asking, setAsking] = useState(false);
  if (wantAsk && calm && !editOpen && push.guide === null && !asking) setAsking(true);
  if (asking && !wantAsk) setAsking(false);

  /* 알림 켜기 안내 — 승인된 멤버에게 이 기기에서 한 번. 첫 화면이 정해지고, 로그인 창·일정 창·빈자리 알림 창·사용법 투어·링크로 여는 일정·프로필 창과 겹치지 않을 때 */
  const { maybeAutoGuide } = push;
  const guideFree = clubOn && calm && !wantAsk && !editOpen;
  useEffect(() => { if (guideFree) maybeAutoGuide(); }, [guideFree, maybeAutoGuide]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Esc 는 조합만 끝낸다
      /* 로그인 창은 AuthModal 이 스스로 닫는다 — 가입 칸에 적은 게 있으면 먼저 묻는다 */
      if (saveModal.open) saveModal.close();
      if (eventForm.open) eventForm.close();
      if (watches.open) watches.close();
      if (push.guide !== null) push.closeGuide();
      tour.end();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [auth, saveModal, eventForm, watches, tour, push]);

  /* 뒤로 가기로 닫는 것(backStack) — 일정 상세(캘린더에서 보일 때만, 다른 일정으로 바꿔도 기록은 하나)와 사용법 투어(= 끝내기).
     창들은 저마다 컴포넌트 안에서 건다. 상세는 화면 안이라 layer 0 — 일정 창이 열린 채 알림 "열기"로 상세가 나중에 열려도
     첫 뒤로 가기는 위에 보이는 일정 창을 닫는다.
     투어는 실제로 화면에 떴을 때만, 그리고 로그인 확인(카카오 돌아옴 주소 정리)이 끝난 뒤에 — 처음 온 기기의 예약만으로는 쌓지 않는다 */
  useBackClose(cal.openEvent !== null && nav.view === 'calendar', closeEvent, 0);
  useBackClose(tour.shown && !auth.authLoading, tour.end);

  /* 화면을 바꾸면 새 화면의 맨 위부터 보여준다. */
  useEffect(() => { window.scrollTo({ top: 0 }); }, [nav.view]);

  /* 투어는 계산 화면의 요소를 가리킨다 — 캘린더에서 누르면 계산 화면으로 먼저
     넘어간 뒤(다음 틱, 요소가 다시 보인 다음) 시작한다. */
  const startTour = () => {
    if (nav.view === 'calc') tour.start();
    else { goView('calc'); setTimeout(tour.start, 60); }
  };

  const onCalc = nav.view === 'calc';
  /* 시간표 계산 — 제목 옆 ⓘ 로 여는 설명, 계산을 한 번이라도 눌렀는지(결과 자리), 결과 코드 미리 받기 */
  const [calcHelp, setCalcHelp] = useState(false);
  const searched = s.themesReady.length >= 2;
  const hasThemes = s.themes.length > 0;
  useEffect(() => { if (hasThemes) void import('./components/ResultsPanel').catch(() => {}); }, [hasThemes]);
  const staleStrip = useStaleStrip();
  /* 승인 멤버로 확인되면 홈 코드를 미리 받아 둔다 — 홈 본문이 비는 시간을 줄인다(실패해도 홈이 열릴 때 다시 시도한다) */
  useEffect(() => { if (clubOn) void import('./components/HomePage').catch(() => {}); }, [clubOn]);
  /* 큰 화면은 처음 들어갈 때 받는다(홈은 승인 멤버 첫 화면이라 homeOn 이면 바로) */
  const calMounted = useEver(nav.view === 'calendar');
  const profileMounted = useEver(nav.view === 'profile');
  const membersMounted = useEver(nav.view === 'members');
  const moreMounted = useEver(nav.view === 'more' && !wide);
  const clubPagesMounted = useEver(nav.view === 'people' || nav.view === 'ranking' || nav.view === 'together' || nav.view === 'feedback');
  const formMounted = useEver(eventForm.open);
  const authMounted = useEver(auth.open);
  const saveMounted = useEver(saveModal.open);
  const watchMounted = useEver(watches.open);
  const guideMounted = useEver(push.guide !== null);
  const [retrying, setRetrying] = useState(false);
  /* 첫 목록을 못 받아 빈 채로 열린 승인 멤버 — 계산·캘린더 위에 띠로 알린다(성공하면 error 가 비어 사라진다) */
  const listFailed = clubOn && club.error !== '' && club.events.length === 0;
  const failStrip = listFailed && (
    <div className="listfail" role="status">
      <span>일정을 불러오지 못했어요.</span>
      <button type="button" className="btn" disabled={retrying} onClick={() => {
        setRetrying(true);
        void club.reload().finally(() => setRetrying(false));
      }}>{retrying ? '불러오는 중…' : '다시 시도'}</button>
    </div>
  );
  return (
    <div className="shell">
      <SideNav
        view={nav.view} onView={goView} auth={auth} homeOn={homeOn} profileOn={profileOn} peopleOn={peopleOn} rankOn={rankOn} togetherOn={togetherOn} feedbackOn={feedbackOn}
        watchCount={watches.watches.length} watchLimit={watches.limit} onWatches={watches.openModal}
        onTour={startTour} dark={theme.dark} onToggleTheme={theme.toggle}
        isAdmin={isAdmin} pendingCount={pendingCount} onEditProfile={openEdit} onInstall={installOn ? onInstall : undefined}
      >
        {nav.view === 'calendar' && <CalendarSide ctl={cal} clubOn={homeOn} playedOn={profileOn} onPick={pickFromSide} />}
      </SideNav>

      <main className="main">
        {staleStrip && <StaleNotice />}
        {/* 계산 화면은 캘린더로 넘어가도 지우지 않고 숨기기만 한다 — 입력·결과·"더 보기"
            같은 컴포넌트 안 상태가 그대로 남아 돌아왔을 때 이어서 볼 수 있다. */}
        <div className={'view cz-view' + (onCalc ? '' : ' off')}>
          {failStrip}
          {/* 2026-10-21 개편 — 제목 아래 설명 줄은 ⓘ 안으로. 단계: ① 테마 넣기 → ② 조건 → ③ 조합 계산하기 */}
          <header className="page-head cz-top">
            <h1>시간표 계산</h1>
            <button type="button" className="cz-info" aria-label="사용법" title="사용법" aria-expanded={calcHelp} aria-controls="czHelp"
              onClick={() => setCalcHelp(v => !v)}><Ic n="info" /><span className="cz-info-t" aria-hidden="true">사용법</span></button>
          </header>
          {calcHelp && (
            <div className="cz-help" id="czHelp">
              <p>테마별 예약 시간을 넣으면 겹치지 않게 이어서 갈 수 있는 조합을 다 찾아 드려요. 중간 대기 시간도 같이 보여요.</p>
              <p><b>순서는 알아서 찾아 줘요.</b> 아무 순서로 넣어도 돼요. 조건의 '순서 그대로 계산'을 켜면 카드 순서대로 가요 — 번호를 끌거나 ⋯ 의 위로·아래로 옮기기로 바꿔요.</p>
              <p>직접 넣을 때는 <b>매진된 회차는 빼고</b> 넣어 주세요. 불러온 매진 회차는 줄을 그어 두고 계산에서 빼요(조건에서 '매진 회차도 포함해서 계산'을 켜면 넣어요).</p>
              <button type="button" className="btn" onClick={() => { setCalcHelp(false); startTour(); }}>화면을 따라가며 사용법 보기</button>
            </div>
          )}
          {evCtx && (
            <div className="evctx" role="status">
              <span>'{ctxEv ? eventTitle(ctxEv) : evCtx.title}' 일정의 테마를 고르는 중이에요
                {insMode === 'stale' && <em> · 테마를 고른 뒤 '조합 계산하기'를 눌러 주세요</em>}</span>
              <button type="button" className="evctx-x" onClick={() => setEvCtx(null)}>그만두기</button>
            </div>
          )}
          <div className="cz-grid">
            <div className="cz-in">
              <TimeBar s={s} />
              <ThemeList s={s} onOpenLoad={() => setLoadOpen(true)} watchCtl={watchCtl} />
              <ConditionsPanel s={s} />
            </div>
            <div className="cz-out" id="resultsSec">
              {searched ? (
                <LazyBoundary><ResultsPanel s={s} onSave={auth.cloudOn ? saveModal.openSave : undefined} onClubPost={homeOn ? postToClub : undefined}
                  onInsert={insMode === 'insert' ? insertToEvent : insMode === 'blocked' ? null : undefined} watchCtl={watchCtl} /></LazyBoundary>
              ) : (
                <div className="cz-noresult"><Ic n="calc" /><p>테마를 넣고 <b>조합 계산하기</b>를 누르면 여기에 갈 수 있는 순서가 나와요</p></div>
              )}
              {auth.me && <LazyBoundary><PlanSection auth={auth} plans={plans} s={s} /></LazyBoundary>}
            </div>
          </div>
        </div>

        {homeOn && (
          <div className={'view home-view' + (nav.view === 'home' ? '' : ' off')}>
            <header className="page-head">
              <h1>홈</h1>
            </header>
            <LazyBoundary><HomePage
              active={nav.view === 'home'} club={club} today={today} nickname={auth.member ? memberName(auth.member) : ''} photo={auth.me?.photo} isAdmin={isAdmin}
              watchCount={watches.watches.length} watchLimit={watches.limit} pendingCount={pendingCount}
              month={homeMonth} onMonth={stepHomeMonth}
              onWatches={watches.openModal} onMembers={() => goView('members')}
              onNewEvent={() => eventForm.openNew()}
              onOpenEvent={openFromHome} onPickDay={pickFromHome}
              profile={profileOn ? profile : null} peopleOn={peopleOn} rankOn={rankOn} onView={goView}
              installOn={installOn} onInstall={onInstall}
            /></LazyBoundary>
          </div>
        )}

        {auth.cloudOn && calMounted && (
          <div className={'view' + (nav.view === 'calendar' ? '' : ' off')}>
            {failStrip}
            <LazyBoundary><CalendarPage
              ctl={cal} active={nav.view === 'calendar'} plans={plans} watches={watches} auth={auth} s={s}
              onLoaded={() => { goView('calc'); showToast('일정을 불러왔어요.'); }}
              club={club} clubOn={homeOn} clubToday={today}
              onNewEvent={eventForm.openNew} onEditEvent={eventForm.openEdit} onCloseEvent={closeEvent} onOpenEvent={openEvent}
              onCalcWindow={calcWindow} onCalcThemes={calcThemes}
              profile={profileOn ? profile : null} onAllPlayed={openPlayedList}
            /></LazyBoundary>
          </div>
        )}

        {profileOn && profileMounted && (
          <div className={'view home-view' + (nav.view === 'profile' ? '' : ' off')}>
            <LazyBoundary><ProfilePage onBack={() => goView('more')}
              profile={profile} member={auth.member} photo={auth.me?.photo} providerIds={auth.providerIds} isAdmin={isAdmin}
              pendingCount={pendingCount} onMembers={() => goView('members')}
              onOpenEvent={openFromProfile} push={push} onEditProfile={openEdit}
            /></LazyBoundary>
          </div>
        )}

        {isAdmin && membersMounted && (
          <div className={'view' + (nav.view === 'members' ? '' : ' off')}>
            {/* 머리말은 화면 청크 안에 둔다 — 진입 청크 크기(§4.64) */}
            <LazyBoundary><MembersPage ctl={members} meUid={auth.member?.uid ?? ''} onBack={() => goView('more')} /></LazyBoundary>
          </div>
        )}
        {moreMounted && (
          <div className={'view more-view' + (nav.view === 'more' ? '' : ' off')}>
            <LazyBoundary><MorePage
              active={nav.view === 'more'} auth={auth} profile={profile} profileOn={profileOn} clubOn={clubOn}
              isAdmin={isAdmin} pendingCount={pendingCount} push={push}
              dark={theme.dark} onToggleTheme={theme.toggle} onTour={startTour}
              onMembers={() => goView('members')} onOpenEvent={openFromProfile}
              peopleOn={peopleOn} rankOn={rankOn} feedbackOn={feedbackOn} onView={goView} onEditProfile={openEdit}
              installOn={installOn} onInstall={onInstall}
            /></LazyBoundary>
          </div>
        )}
        {(peopleOn || togetherOn || feedbackOn) && clubPagesMounted && <LazyBoundary><MemberViews
          part="pages" view={nav.view} rankOn={rankOn} meUid={meUid} today={today} onBack={() => goView('more')}
          onRankMissing={() => { setRankGone(true); go('more', true); }}
          togetherOn={togetherOn} events={club.events} played={profile.played}
          onMakeEvent={(f) => eventForm.show(f, null)} onOpenEvent={openFromHome}
          feedbackOn={feedbackOn} isAdmin={isAdmin} onFeedbackMissing={() => { setFeedbackGone(true); go('more', true); }}
        /></LazyBoundary>}
      </main>

      {authMounted && <LazyBoundary><AuthModal auth={auth} /></LazyBoundary>}
      {loadOpen && <LazyBoundary><ThemePicker mode="themes" date={evCtx?.date} onAdd={s.addServerThemes} onClose={closeLoad} mine={profile.played} /></LazyBoundary>}
      {saveMounted && <LazyBoundary><SaveModal m={saveModal} /></LazyBoundary>}
      {clubOn && formMounted && <LazyBoundary><EventForm m={eventForm} create={club.create} update={club.update} adopt={club.adopt} played={profile.played} /></LazyBoundary>}
      {auth.cloudOn && watchMounted && <LazyBoundary><WatchListModal w={watches} /></LazyBoundary>}
      {clubOn && guideMounted && <LazyBoundary><PushGuide push={push} /></LazyBoundary>}
      {install.guide !== null && <LazyBoundary><InstallGuide kind={install.guide} onClose={closeInstallGuide} /></LazyBoundary>}
      {(asking || editOpen) && <LazyBoundary><MemberViews
        part="modal" fill={asking} auth={auth} profile={profileOn ? profile : null}
        onClose={() => { if (asking) setAskedOff(meUid); setEditOpen(false); }}
        onMissing={() => { setEditGone(true); setEditOpen(false); }}
      /></LazyBoundary>}
      {peopleOn && card && <LazyBoundary><MemberViews
        part="card" uid={card.uid} name={card.name} from={card.from} meUid={meUid} today={today} events={club.events} past={profile.past}
        onClose={() => setCard(null)} onOpenEvent={(ev) => { setCard(null); hist.soon(() => openFromProfile(ev)); }}
      /></LazyBoundary>}
      <PushBanner onOpen={openFromBanner} />
      <Toaster />
    </div>
  );
}
