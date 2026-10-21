import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dayLabel, todayKst } from '../clubEvents';
import { fmt } from '../core';
import type { TimeRow } from '../clubEvents';
import { MAX_SEGS } from '../eventForm';
import {
  branchLabel, branchRegions, filterBranches, fitsPeople, mixedDates, overlaps, playedByMe, themePickKey, toAdded, toPick, togglePicked,
  type PickedSession, type PickedTheme,
} from '../eventPick';
import {
  ago, branches as fetchBranches, freshThemes, say, schedule as fetchSchedule,
  type Branch, type PlayedDto, type ServerSession, type ServerTheme,
} from '../server';
import type { AddedTheme } from '../scheduler/types';
import { WishToggle } from '../clubStore';
import { setServerRegions, type RegionPick } from '../regions';
import { useBackClose } from '../backStack';

/* 테마 고르기 창 — 시간표 계산의 "테마 불러오기"와 일정 만들기의 "테마 찾아서 넣기"가 같이 쓴다.
   둘 다 같은 데이터(/api/branches·/api/schedule: 지점 → 날짜 → 그날 테마·회차)를 보고, 다른 건 마지막에 고르는 단위뿐이다.
   - themes(시간표 계산): 테마째 고른다 → 그날 회차 전부가 계산 카드로(계산이 조합을 찾는다). 회차 칩은 보기만.
   - sessions(일정 만들기): 회차 하나씩 고른다 → 테마·지점·시작·끝이 구간으로(eventPick.mergePicks).
   지점을 바꿔도 고른 것은 남는다(매장 A·B·C 에서 하나씩 고르는 쓰임 — 사용자가 찾아낸 것). */

interface Common {
  onClose: () => void;
  mine: PlayedDto[] | null;  // 내 해 본 테마(받아 둔 것) — "해 봄" 표시. 없으면 표시만 빠진다
}
interface SessionsProps extends Common {
  mode: 'sessions';
  date: string;              // 처음 볼 날짜
  formDate: string | null;   // 날짜 정하기면 일정 날짜(다른 날을 보면 알린다), 후보 여러 개면 null
  candidates: string[];      // 후보 날짜 — 바로 고르는 칩
  placedOn: (date: string) => TimeRow[];  // 이미 넣은 구간을 그 날짜 기준 분으로 — 겹침 표시
  room: number;              // 더 넣을 수 있는 수
  eventId: number | null;    // 고치는 일정이면 참여자 해 본 테마를 fresh-themes 로
  /* 넣지 못하면(같은 날 밤을 넘는 등) 그 까닭을 돌려준다 — 창은 열어 둔다 */
  onAdd: (picks: PickedSession[], date: string) => string;
}
interface ThemesProps extends Common {
  mode: 'themes';
  date?: string | null;      // 일정 문맥(그 일정의 테마를 고르는 중)이면 그 날짜, 아니면 오늘
  onAdd: (items: AddedTheme[]) => void;
}
type Props = SessionsProps | ThemesProps;

type Slot = { themes: ServerTheme[]; checkedAt: string | null } | { err: string };

/* 지점 목록은 창을 여러 번 열어도 5분 동안 다시 받지 않는다 */
let branchCache: { at: number; list: Branch[] } | null = null;
const cachedBranches = (): Branch[] | null => (branchCache && Date.now() - branchCache.at < 5 * 60_000 ? branchCache.list : null);

async function loadPlayedBy(eventId: number, date: string): Promise<Map<string, number>> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw new Error('로그인');
  const dto = await freshThemes(eventId, date, t);
  return new Map(dto.themes.map((x) => [x.themeKey, x.playedBy.length]));
}

/* 지난번 고른 지점 — 이 기기에 기억해 다음에 열 때 미리 고른다(같은 매장을 자주 본다) */
const LAST_BRANCH = 'flod.picker.branch';
const lastBranch = (): string | null => { try { return localStorage.getItem(LAST_BRANCH); } catch { return null; } };
const keepBranch = (id: string) => { try { localStorage.setItem(LAST_BRANCH, id); } catch { /* 저장이 막혀도 고르기는 된다 */ } };

const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const WD = '일월화수목금토';
const mdw = (iso: string) => `${md(iso)}(${WD[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;

/* 좁은 화면(≤560px) — 지점 목록과 테마 목록이 한 칸씩 번갈아 보인다(CSS 와 같은 기준) */
function useNarrow(): boolean {
  const [n, setN] = useState(() => matchMedia('(max-width: 560px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 560px)');
    const on = () => setN(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return n;
}

export function ThemePicker(p: Props) {
  const { mode, onClose, mine } = p;
  const sessions = p.mode === 'sessions' ? p : null;
  const today = todayKst();
  const [date, setDate] = useState(sessions ? sessions.date : (p.mode === 'themes' && p.date) || today);
  const [list, setList] = useState<Branch[] | null>(cachedBranches);
  const [listErr, setListErr] = useState('');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<RegionPick>('전체');
  const [branchId, setBranchId] = useState<string | null>(lastBranch);
  const [slots, setSlots] = useState<Map<string, Slot>>(new Map());
  const [picks, setPicks] = useState<Map<string, PickedSession>>(new Map());
  const [tpicks, setTpicks] = useState<Map<string, PickedTheme>>(new Map());
  const [people, setPeople] = useState('');
  const [note, setNote] = useState('');
  const [noteWarn, setNoteWarn] = useState(false);
  const [played, setPlayed] = useState<Map<string, Map<string, number> | null>>(new Map());
  const asked = useRef(new Set<string>());
  const boxRef = useRef<HTMLDivElement>(null);
  const eventId = sessions?.eventId ?? null;
  const title = mode === 'themes' ? '테마 불러오기' : '테마 찾아서 넣기';

  /* Esc 는 이 창만 닫는다 — 아래 창(일정 창·SchedulerPage 의 Esc)까지 닫혀 입력이 사라지지 않게 먼저 받아 멈춘다.
     Tab·Shift+Tab 은 창 안에서만 돈다(PushGuide·BulkModal 과 같게) — 꺼진 단추와 좁은 화면에서 숨긴 칸은 건너뛴다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.isComposing || e.keyCode === 229) return;
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const box = boxRef.current;
      if (!box) return;
      const els = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter((el) => el.offsetParent !== null);
      const a = document.activeElement;
      const first = els[0], last = els[els.length - 1];
      if (!first) { e.preventDefault(); box.focus({ preventScroll: true }); }
      else if (!box.contains(a) || a === box) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  /* 열리면 창으로, 닫히면 연 단추로 포커스를 돌려준다 */
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    boxRef.current?.focus({ preventScroll: true });
    return () => { if (back?.isConnected) back.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    if (list) return;
    let live = true;
    fetchBranches().then(
      (l) => { branchCache = { at: Date.now(), list: l }; setServerRegions(l); if (live) setList(l); },
      (e) => { if (live) setListErr(say(e)); },
    );
    return () => { live = false; };
  }, [list]);

  const branch = list?.find((b) => b.id === branchId) ?? null;
  /* 뒤로 가기 — 창을 닫는다. 좁은 화면에서 지점을 골라 테마 목록에 들어와 있으면 먼저 지점 목록으로 */
  const narrow = useNarrow();
  useBackClose(true, onClose);
  useBackClose(narrow && branch !== null, () => setBranchId(null));
  const hasDay = !!branch && (branch.dates ?? []).includes(date);
  const key = branch ? `${branch.id}|${date}` : '';

  /* 고른 지점·날짜의 회차 — 그날 시간표가 없는 지점은 묻지 않는다(404 가 될 뿐) */
  useEffect(() => {
    if (!branch || !hasDay || asked.current.has(key)) return;
    asked.current.add(key);
    fetchSchedule(branch.id, date).then(
      (r) => setSlots((m) => new Map(m).set(key, { themes: r.themes ?? [], checkedAt: r.checkedAt })),
      (e) => { asked.current.delete(key); setSlots((m) => new Map(m).set(key, { err: say(e) })); },
    );
  }, [branch, hasDay, key, date]);

  /* 고치는 일정 — 그날 참여자가 해 본 테마 수(키별). 실패하면 조용히 내 기록으로 */
  useEffect(() => {
    if (eventId === null || played.has(date)) return;
    let live = true;
    loadPlayedBy(eventId, date).then(
      (m) => { if (live) setPlayed((p) => new Map(p).set(date, m)); },
      () => { if (live) setPlayed((p) => new Map(p).set(date, null)); },
    );
    return () => { live = false; };
  }, [eventId, date, played]);

  const byDate = played.get(date);
  const playedN = (th: ServerTheme): number =>
    byDate ? byDate.get(th.id) ?? 0 : mine && playedByMe(th, mine) ? 1 : 0;

  /* 날짜를 바꾸면 — 회차 고르기는 고른 회차를 비운다(다른 날 회차가 한 구간 목록에 섞이지 않게).
     테마 고르기는 그대로 둔다(다른 날 테마를 섞으면 아래에 알린다 — 옛 회차 불러오기와 같게) */
  function changeDate(d: string) {
    if (!d || d === date) return;
    setDate(d);
    setNoteWarn(false);
    if (sessions && picks.size > 0) { setPicks(new Map()); setNote('날짜를 바꿔서 고른 회차를 비웠어요.'); }
  }

  const room = sessions ? sessions.room : Infinity;
  const full = picks.size >= room;
  function toggle(th: ServerTheme, s: ServerSession) {
    if (!branch) return;
    const pk = toPick(branch, date, th, s);
    setNote('');
    setNoteWarn(false);
    setPicks((m) => {
      const n = new Map(m);
      if (n.has(pk.key)) n.delete(pk.key);
      else if (!s.soldout && n.size < room) n.set(pk.key, pk);
      return n;
    });
  }
  function toggleTheme(th: ServerTheme, checkedAt: string | null) {
    if (!branch) return;
    setTpicks((m) => togglePicked(m, { key: themePickKey(branch.id, date, th.id), date, branchName: branchLabel(branch), theme: th, checkedAt }));
  }

  /* 겹침 — 같은 날을 보고 있을 때 이미 넣은 구간, 그리고 지금 고른 회차들 */
  const placed = sessions ? sessions.placedOn(date) : [];
  const pickedRows = [...picks.values()].map((x) => ({ key: x.key, row: { start: x.t, end: x.dur ? x.t + x.dur : null } }));
  const clash = (k: string, start: number, dur: number | null) => {
    const row = { start, end: dur ? start + dur : null };
    return placed.some((r) => overlaps(row, r)) || pickedRows.some((x) => x.key !== k && overlaps(row, x.row));
  };

  const regions = list ? branchRegions(list) : [];
  const shown = list ? filterBranches(list, q, date, region) : [];
  const slot = key ? slots.get(key) : undefined;
  const pickedList = [...picks.values()].sort((a, b) => a.t - b.t);
  const tpickedList = [...tpicks.values()];
  const mixed = mixedDates(tpickedList);
  const count = sessions ? picks.size : tpicks.size;

  function add() {
    if (p.mode === 'themes') { p.onAdd(tpickedList.map(toAdded)); onClose(); return; }
    const err = p.onAdd(pickedList, date);
    if (err) { setNote(err); setNoteWarn(true); }
  }

  const footText = sessions
    ? note || (full
      ? `테마는 ${MAX_SEGS}개까지예요. 더 고르려면 고른 회차나 넣어 둔 테마를 빼 주세요.`
      : picks.size > 0 ? `${picks.size}개 골랐어요 · ${room - picks.size}개 더 고를 수 있어요. 지점을 바꿔도 그대로 남아요.` : `${room}개까지 고를 수 있어요.`)
    : tpicks.size > 0 ? `${tpicks.size}개 골랐어요. 지점·날짜를 바꿔도 그대로 남아요.` : '테마를 누르면 그날 회차가 전부 카드로 들어가요. 매진 회차는 카드에 남지만 계산에서는 빠져요.';

  /* 일정 창(.mbox)은 transform 이 걸려 있어 그 안의 fixed 가 화면 기준이 아니다 — body 로 띄운다 */
  return createPortal(
    <div className="modal tf-modal on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'mbox tf tf-' + mode} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={boxRef}>
        <h3>{title}</h3>
        <p className="msub">{sessions
          ? '예약 사이트에서 모은 회차예요. 회차를 눌러 고르면 한 번에 넣어 드려요.'
          : '예약 사이트에서 모은 회차예요. 테마를 고르면 그날 회차를 전부 카드로 넣어 드려요.'}</p>
        <div className="tf-date">
          <label htmlFor="tf-date">날짜</label>
          <input id="tf-date" type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
          {sessions && sessions.candidates.length > 0 && (
            <div className="tf-cands" role="group" aria-label="후보 날짜">
              {sessions.candidates.map((d) => (
                <button key={d} type="button" className="chip-pick" aria-pressed={d === date} onClick={() => changeDate(d)}>{dayLabel(d)}</button>
              ))}
            </div>
          )}
          {!sessions && (
            <span className="tf-ppl">
              <label htmlFor="tf-ppl">인원</label>
              <input id="tf-ppl" className="mono" inputMode="numeric" placeholder="모두" aria-describedby="tf-ppl-h" value={people} onChange={(e) => setPeople(e.target.value)} />
              <span id="tf-ppl-h" className="tf-ppl-h">안 맞는 테마는 흐리게</span>
            </span>
          )}
        </div>
        {sessions?.formDate && sessions.formDate !== date && (
          <p className="tf-datehint">일정 날짜({md(sessions.formDate)})와 다른 날이에요. 넣으면 일정 날짜가 바뀔 수 있어요 — 바뀌면 넣은 뒤 알려 드려요.</p>
        )}

        <div className={'tf-body' + (branch ? ' has-br' : '')}>
          <div className="tf-brs">
            <input className="tf-q" type="search" placeholder="지점 찾기 (예: 강남)" aria-label="지점 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
            {regions.length > 1 && (
              <div className="tf-regions" role="group" aria-label="지역">
                {(['전체', ...regions] as RegionPick[]).map((r) => (
                  <button key={r} type="button" className="chip-pick" aria-pressed={r === region} onClick={() => setRegion(r)}>{r}</button>
                ))}
              </div>
            )}
            {!list ? (
              <p className="tf-msg">{listErr || '지점을 불러오는 중…'}</p>
            ) : shown.length === 0 ? (
              <p className="tf-msg">{q ? `'${q}' 들어간 지점이 없어요.` : region !== '전체' ? `${region}에는 불러올 수 있는 지점이 없어요.` : '불러올 수 있는 지점이 없어요.'}</p>
            ) : (
              <ul className="tf-brlist">
                {shown.map((b) => {
                  const ok = (b.dates ?? []).includes(date);
                  return (
                    <li key={b.id}>
                      <button type="button" className={'tf-br' + (ok ? '' : ' no')} aria-pressed={b.id === branchId} onClick={() => { setBranchId(b.id); keepBranch(b.id); }}>
                        <span>{branchLabel(b)}</span>
                        {!ok && <span className="tf-br-no">이날 없음</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="tf-ths">
            {!branch ? (
              <p className="tf-msg tf-ph">지점을 고르면 {md(date)} 테마와 회차가 보여요.</p>
            ) : (
              <>
                <div className="tf-ths-h">
                  <button type="button" className="tf-back" onClick={() => setBranchId(null)} aria-label="지점 목록으로">‹</button>
                  <b>{branchLabel(branch)}</b>
                  {slot && 'themes' in slot && slot.checkedAt && <span className="tf-fresh">{ago(slot.checkedAt)}</span>}
                </div>
                {(branch.dates ?? []).length > 0 && (
                  <div className="tf-bdates" role="group" aria-label={`${branchLabel(branch)} 시간표가 있는 날`}>
                    {(branch.dates ?? []).map((d) => (
                      <button key={d} type="button" className="chip-pick" aria-pressed={d === date} onClick={() => changeDate(d)}>
                        {mdw(d)}{d === today ? ' 오늘' : ''}
                      </button>
                    ))}
                  </div>
                )}
                {!hasDay ? (
                  <p className="tf-msg">{md(date)} 은 이 지점 시간표가 없어요.<br />아직 열리지 않았거나 모으지 않는 날이에요.</p>
                ) : !slot ? (
                  <p className="tf-msg">회차를 불러오는 중…</p>
                ) : 'err' in slot ? (
                  <p className="tf-msg">{slot.err}</p>
                ) : slot.themes.length === 0 ? (
                  <p className="tf-msg">이날은 열린 테마가 없어요.</p>
                ) : (
                  <ul className="tf-thlist">
                    {slot.themes.map((th) => {
                      const ss = [...th.sessions].sort((a, b) => a.t - b.t);
                      const n = playedN(th);
                      const allSold = ss.length > 0 && ss.every((s) => s.soldout);
                      const meta = [th.dur ? `${th.dur}분` : '소요 시간 모름', th.genre, sessions ? null : th.capacity].filter(Boolean).join(' · ') + (allSold ? ' · 모두 매진' : '');
                      const wish = <WishToggle theme={{ themeKey: th.id || null, themeName: th.name, branchName: branch.branch }} />;
                      if (!sessions) {
                        const on = tpicks.has(themePickKey(branch.id, date, th.id));
                        const fits = fitsPeople(th, people);
                        return (
                          <li key={th.id} className={'tf-th tf-th-sel' + (fits ? '' : ' off')}>
                            <div className="tf-th-top">
                              <button type="button" className="tf-th-pick" aria-pressed={on} onClick={() => toggleTheme(th, slot.checkedAt)}>
                                <span className="tf-chk" aria-hidden="true" />
                                <span className="tf-th-n">{th.name}</span>
                              </button>
                              <span className="tf-th-m">{meta}{fits ? '' : ' · 인원이 안 맞아요'}</span>
                              {n > 0 && <span className="chip-info warn">해 봄 {n}</span>}
                              {wish}
                            </div>
                            <div className="tf-ss tf-ss-ro">
                              {ss.map((s) => (
                                <span key={s.id} className={'tf-s' + (s.soldout ? ' sold' : '')}>
                                  {s.t >= 1440 && <small>다음날</small>}{fmt(s.t)}
                                  {s.soldout && <span className="sr-only"> 매진</span>}
                                </span>
                              ))}
                            </div>
                          </li>
                        );
                      }
                      return (
                        <li key={th.id} className="tf-th">
                          <div className="tf-th-top">
                            <span className="tf-th-n">{th.name}</span>
                            <span className="tf-th-m">{meta}</span>
                            {n > 0 && <span className="chip-info warn">해 봄 {n}</span>}
                            {wish}
                          </div>
                          <div className="tf-ss">
                            {ss.map((s) => {
                              const k = toPick(branch, date, th, s).key;
                              const on = picks.has(k);
                              const ov = !s.soldout && clash(k, s.t, th.dur ?? null);
                              return (
                                <button
                                  key={k} type="button" className={'tf-s' + (s.soldout ? ' sold' : '')} aria-pressed={on}
                                  disabled={s.soldout || (!on && full)} title={s.soldout ? '매진' : undefined}
                                  onClick={() => toggle(th, s)}
                                >
                                  {s.t >= 1440 && <small>다음날</small>}{fmt(s.t)}
                                  {s.soldout && <span className="sr-only"> 매진</span>}
                                  {ov && <small className="ov">겹쳐요</small>}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="tf-foot">
          {count > 0 && (
            <div className="tf-picked">
              {sessions ? pickedList.map((x) => (
                <span key={x.key} className="pickedchip tf-pc">
                  {x.themeName} <i>· {x.t >= 1440 ? '다음날 ' : ''}{fmt(x.t)} · {x.branchName}</i>
                  <button type="button" aria-label={`${x.themeName} 고른 것 빼기`} onClick={() => setPicks((m) => { const n = new Map(m); n.delete(x.key); return n; })}>×</button>
                </span>
              )) : tpickedList.map((x) => (
                <span key={x.key} className="pickedchip tf-pc">
                  {x.theme.name} <i>· {x.branchName} · {mdw(x.date)}</i>
                  <button type="button" aria-label={`${x.theme.name} 고른 것 빼기`} onClick={() => setTpicks((m) => togglePicked(m, x))}>×</button>
                </span>
              ))}
            </div>
          )}
          {mixed.length > 0 && (
            <p className="tf-room full">고른 테마의 날짜가 서로 달라요: {mixed.map(mdw).join(', ')}. 같은 날로 맞춰야 조합이 제대로 나와요.</p>
          )}
          <p className={'tf-room' + (full || noteWarn ? ' full' : '')} aria-live="polite">{footText}</p>
          <div className="mbtns">
            <button type="button" className="btn-go tf-go" disabled={count === 0} onClick={add}>
              {count > 0 ? (sessions ? `${count}개 넣기` : `${count}개 테마 넣기`) : '넣기'}
            </button>
            <button type="button" className="btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
