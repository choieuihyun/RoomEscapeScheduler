import { useCallback, useEffect, useRef, useState } from 'react';
import { clockLabel, dayLabel, todayKst } from '../clubEvents';
import { freshMessage, freshStale, helperDates, noRecordNames, noRecordText } from '../played';
import { playedDots } from '../playedWho';
import { REGIONS, inRegion, pageAt, pageFor, pageOf, regionCounts, type PageAt, type RegionPick } from '../regions';
import { ago, freshThemes, isMissingApi, sayClub, toSessions, type EventDto, type FreshDto, type FreshTheme } from '../server';
import type { AddedTheme } from '../useLoadModal';
import { PlayedDots } from './PlayedDots';
import { WishToggle } from '../clubStore';

/* 일정 상세의 협의 도우미 "어떤 테마가 좋을까요?"(§4.9, 계획 Task 8, 목업 ② 왼쪽 아래).
   그날 열린 회차가 있는 테마를 "아무도 안 해 봄" 먼저(서버가 세운 순서) 보이고, 고른 테마로 조합 계산을 연다.
   지역으로 거르고 20개씩 쪽을 나눈다(2026-10-20).
   목록은 펼칠 때 받는다(참여자만, 동호회 API 가 켜져 있을 때만 그려진다). */

/* 고른 지역은 이 기기에 기억한다 — 모으는 매장이 40곳 남짓이라 한 날 테마가 수백 개일 수 있어 지역으로 먼저 줄인다 */
const REGION_KEY = 'flod.helper.region';
const readRegion = (): RegionPick => {
  try {
    const v = localStorage.getItem(REGION_KEY);
    return (REGIONS as readonly string[]).includes(v ?? '') ? (v as RegionPick) : '전체';
  } catch { return '전체'; }
};
const saveRegion = (r: RegionPick) => { try { localStorage.setItem(REGION_KEY, r); } catch { /* 시크릿 창 등 — 이번에만 안 남는다 */ } };

/* 서버가 이 API 를 아직 모르면(본문 없는 404) 이 창이 살아 있는 동안 다시 묻지 않고 숨긴다 */
let apiMissing = false;

/* (날짜, 참여자)마다 받은 결과. 참여자가 바뀌면 playedBy·noRecord 가 달라지니 키를 나눈다. 없으면 받는 중 */
type Slot = { dto?: FreshDto; err?: string; at?: number };

const nowMs = () => Date.now();

async function load(eventId: number, date: string): Promise<FreshDto> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return freshThemes(eventId, date, t);
}

const toAdded = (t: FreshTheme, dto: FreshDto): AddedTheme => ({
  /* 회차 불러오기(useLoadModal.addPicked)와 같은 모양 — toSessions 가 시각 순으로 세운다.
     서버가 place 를 안 주면 매장·지점 이름으로(이동 시간 표의 매장 칸) */
  name: t.name, place: t.place || `${t.storeName} ${t.branchName}`.trim(), dur: t.dur || 70,
  sessions: toSessions(t.sessions), fresh: ago(dto.checkedAt), date: dto.date, themeKey: t.themeKey || t.id,
});

export function EventHelper({ ev, onCalcThemes }: {
  ev: EventDto;
  /* 고른 테마를 계산 화면에 넣고 그리로 */
  onCalcThemes: (items: AddedTheme[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(apiMissing);
  const [picked, setPicked] = useState<string | null>(null); // 사람이 날짜 칩으로 고른 날짜
  const [slots, setSlots] = useState<Map<string, Slot>>(new Map());
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState<RegionPick>(readRegion);
  const [pg, setPg] = useState<PageAt>({ at: '', page: 0 });
  /* 쪽을 넘긴 뒤 한 번만 목록 머리로 옮긴다 */
  const jump = useRef(false);
  const headRef = useRef<HTMLParagraphElement>(null);
  /* 키마다 마지막 요청 번호 — 늦게 온 옛 응답이 새 결과를 덮지 않게. 받는 중인 키도 여기서 안다 */
  const seq = useRef(0);
  const latest = useRef(new Map<string, number>());

  const plan = helperDates(ev, todayKst());
  /* 직접 고른 날짜가 없거나 후보에서 빠졌으면 기준 날짜(정해진 날, 미정이면 "언제 될까요?" 맨 위 줄)를 따라간다 */
  const date = !plan ? null : picked && plan.dates.includes(picked) ? picked : plan.first;
  const who = ev.participants.map((p) => p.uid).sort().join(',');
  const key = date ? `${date}|${who}` : '';
  /* 날짜가 바뀌면(직접 고르든 기준 날짜가 옮겨 가든) 고른 테마를 비운다 — 렌더 중에 앞 값과 견줘 맞춘다 */
  const [shownDate, setShownDate] = useState(date);
  if (date !== shownDate) {
    setShownDate(date);
    setIds(new Set());
  }
  /* 쪽도 같은 식으로 — 목록 키(날짜·참여자·지역)가 바뀌면 늘 1쪽. 옛 키로 돌아와도 옛 쪽을 되살리지 않는다 */
  const listAt = `${key}|${region}`;
  const nextPg = pageAt(pg, listAt);
  if (nextPg !== pg) setPg(nextPg);

  const fetchKey = useCallback((d: string, k: string) => {
    const n = ++seq.current;
    latest.current.set(k, n);
    load(ev.id, d).then(
      (dto) => { if (latest.current.get(k) === n) setSlots((m) => new Map(m).set(k, { dto, at: nowMs() })); },
      (e) => {
        if (latest.current.get(k) !== n) return;
        if (isMissingApi(e)) { apiMissing = true; setHidden(true); return; }
        setSlots((m) => new Map(m).set(k, { err: sayClub(e) }));
      },
    );
  }, [ev.id]);

  /* 펼쳐져 있는 동안 날짜나 참여자가 바뀌면 다시 받는다. 이미 받았거나 받는 중인 키는 건너뛴다 */
  const have = slots.has(key);
  useEffect(() => {
    if (!open || hidden || !date || have || latest.current.has(key)) return;
    fetchKey(date, key);
  }, [open, hidden, date, key, have, fetchKey]);

  const page = pageFor(pg, listAt);
  useEffect(() => {
    if (!jump.current) return;
    jump.current = false;
    headRef.current?.focus({ preventScroll: true });
    headRef.current?.scrollIntoView({ block: 'start' });
  }, [page]);

  if (hidden || !plan || !date) return null;
  const slot = slots.get(key);

  function pickDate(d: string) {
    if (d !== date) setPicked(d);
  }
  /* 오류였던 키를 지우고 다시 — effect 가 받는다 */
  function retry() {
    latest.current.delete(key);
    setSlots((m) => { const n = new Map(m); n.delete(key); return n; });
  }

  /* 열어 둔 사이 낡은 결과는 다시 받는다 — 받을 때까지는 옛 목록을 그대로 둔다 */
  function onToggle(o: boolean) {
    setOpen(o);
    if (o && !hidden && date && slot?.dto && slot.at !== undefined && freshStale(slot.at, nowMs())) fetchKey(date, key);
  }

  const dto = slot?.err ? null : slot?.dto ?? null;
  const msg = dto ? freshMessage(dto) : null;
  const themes = dto && !msg ? dto.themes : [];
  /* 지역 거르기 → (서버가 세운 순서 그대로) → 20개씩. 기억한 지역이 이 날 결과에 없으면 전체를 보인다(기억은 그대로) */
  const regions = regionCounts(themes);
  const shownRegion: RegionPick = regions.some((r) => r.region === region) ? region : '전체';
  const inR = inRegion(themes, shownRegion);
  const view = pageOf(inR, page);
  function pickRegion(r: RegionPick) {
    setRegion(r);
    saveRegion(r);
  }
  function goPage(n: number) {
    jump.current = true;
    setPg({ at: listAt, page: n });
  }
  const noRec = dto && themes.length > 0 ? noRecordNames(dto, ev) : [];
  const pickedThemes = themes.filter((t) => ids.has(t.id));
  const toggle = (id: string, on: boolean) => {
    const n = new Set(ids);
    if (on) n.add(id); else n.delete(id);
    setIds(n);
  };

  return (
    <details
      className="evh" open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary>
        <span className="evh-t">어떤 테마가 좋을까요?</span>
        <span className="evh-d">{dayLabel(date)} 열린 회차{dto?.checkedAt ? ` · ${ago(dto.checkedAt)}` : ''}</span>
      </summary>
      <div className="evh-b">
        {plan.dates.length > 1 && (
          <div className="evh-dates" role="group" aria-label="볼 날짜">
            {plan.dates.map((d) => (
              <button key={d} type="button" className="chip-pick" aria-pressed={d === date} onClick={() => pickDate(d)}>{dayLabel(d)}</button>
            ))}
          </div>
        )}
        {!slot?.err && !dto && <p className="evp-hint" role="status">열린 테마를 찾는 중…</p>}
        {slot?.err && (
          <div className="evh-err">
            <p className="merr">{slot.err}</p>
            <button type="button" className="btn evp-sm" onClick={retry}>다시 시도</button>
          </div>
        )}
        {msg && <p className="evh-msg">{msg}</p>}
        {noRec.length > 0 && <p className="evh-norec">{noRecordText(noRec)}</p>}
        {regions.length > 1 && (
          <div className="evh-regions" role="group" aria-label="지역">
            <button type="button" className="chip-pick" aria-pressed={shownRegion === '전체'} onClick={() => pickRegion('전체')}>전체 <span>{themes.length}</span></button>
            {regions.map(({ region: r, n }) => (
              <button key={r} type="button" className="chip-pick" aria-pressed={shownRegion === r} onClick={() => pickRegion(r)}>{r} <span>{n}</span></button>
            ))}
          </div>
        )}
        {themes.length > 0 && (
          <p className="evh-cnt" ref={headRef} tabIndex={-1}>
            {shownRegion === '전체' ? '' : `${shownRegion} `}{inR.length}개{view.pages > 1 && ` 중 ${view.from + 1}–${view.from + view.items.length}`}
          </p>
        )}
        {themes.length > 0 && (
          <ul className="evh-list">
            {view.items.map((t) => {
              const dots = playedDots(t.playedBy, ev.participants);
              return (
                <li key={t.id} className={'evh-row' + (dots.some((d) => d.played) ? ' played' : '')}>
                  <input
                    type="checkbox" id={`evh-${ev.id}-${t.id}`} checked={ids.has(t.id)}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                  />
                  <label htmlFor={`evh-${ev.id}-${t.id}`} className="evh-main">
                    <span className="evh-n">{t.name} <span className="evh-at">· {t.storeName} {t.branchName}{t.dur ? ` · ${t.dur}분` : ''}</span></span>
                    <span className="evh-ss">
                      {toSessions(t.sessions).map((s, i) => (
                        <span key={s.id ?? i}>{i > 0 && ' · '}{s.soldout ? <><s>{clockLabel(s.t)}</s><span className="sr-only"> 매진</span></> : clockLabel(s.t)}</span>
                      ))}
                    </span>
                    <PlayedDots dots={dots} />
                  </label>
                  {/* 하고 싶어요(§4.12) — 라벨 밖에 둔다(누르면 체크가 같이 바뀌지 않게) */}
                  <WishToggle theme={{ themeKey: t.themeKey || t.id, themeName: t.name, branchName: t.branchName }} />
                </li>
              );
            })}
          </ul>
        )}
        {view.pages > 1 && (
          <nav className="evh-pager" aria-label="테마 목록 쪽">
            <button type="button" className="btn evp-sm" disabled={view.page === 0} onClick={() => goPage(view.page - 1)}>‹ 이전</button>
            <span className="evh-pg">{view.page + 1} / {view.pages}<span className="sr-only">쪽</span></span>
            <button type="button" className="btn evp-sm" disabled={view.page >= view.pages - 1} onClick={() => goPage(view.page + 1)}>다음 ›</button>
          </nav>
        )}
        {dto && dto.collected && dto.missing.length > 0 && (
          <details className="evh-missing">
            <summary>이 매장들은 그날 시간표가 없어요(아직 안 열렸거나 쉬는 날) {dto.missing.length}곳</summary>
            <p>{dto.missing.map((m) => `${m.store} ${m.branch}`).join(' · ')}</p>
          </details>
        )}
        {dto && <span className="evh-foot">우리가 시간표를 모으는 매장만 보여요.</span>}
        {themes.length > 0 && (
          <button
            type="button" className="btn-go evh-go" disabled={pickedThemes.length === 0}
            onClick={() => dto && onCalcThemes(pickedThemes.map((t) => toAdded(t, dto)))}
          >고른 테마 {pickedThemes.length}개로 시간표 계산</button>
        )}
      </div>
    </details>
  );
}
