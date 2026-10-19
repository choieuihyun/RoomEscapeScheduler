import { useCallback, useEffect, useRef, useState } from 'react';
import { clockLabel, dayLabel, todayKst } from '../clubEvents';
import { freshMessage, freshStale, helperDates, noRecordNames, noRecordText, playedNames } from '../played';
import { ago, freshThemes, isMissingApi, sayClub, toSessions, type EventDto, type FreshDto, type FreshTheme } from '../server';
import type { AddedTheme } from '../useLoadModal';

/* 일정 상세의 협의 도우미 "어떤 테마가 좋을까요?"(§4.9, 계획 Task 8, 목업 ② 왼쪽 아래).
   그날 열린 회차가 있는 테마를 "아무도 안 해 봄" 먼저 보이고, 고른 테마로 조합 계산을 연다.
   목록은 펼칠 때 받는다(참여자만, 동호회 API 가 켜져 있을 때만 그려진다). */

const PAGE = 10; // 처음 보이는 줄 수 — 모으는 매장이 40곳 남짓이라 한 날 테마가 수백 개일 수 있다

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
  sessions: toSessions(t.sessions), fresh: ago(dto.checkedAt), date: dto.date,
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
  const [more, setMore] = useState(false);
  /* 키마다 마지막 요청 번호 — 늦게 온 옛 응답이 새 결과를 덮지 않게. 받는 중인 키도 여기서 안다 */
  const seq = useRef(0);
  const latest = useRef(new Map<string, number>());

  const plan = helperDates(ev, todayKst());
  /* 직접 고른 날짜가 없거나 후보에서 빠졌으면 기준 날짜(정해진 날, 미정이면 "언제 될까요?" 맨 위 줄)를 따라간다 */
  const date = !plan ? null : picked && plan.dates.includes(picked) ? picked : plan.first;
  const who = ev.participants.map((p) => p.uid).sort().join(',');
  const key = date ? `${date}|${who}` : '';
  /* 날짜가 바뀌면(직접 고르든 기준 날짜가 옮겨 가든) 고른 테마·더 보기를 비운다 — 렌더 중에 앞 값과 견줘 맞춘다 */
  const [shownDate, setShownDate] = useState(date);
  if (date !== shownDate) {
    setShownDate(date);
    setIds(new Set());
    setMore(false);
  }

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
  const shown = more ? themes : themes.slice(0, PAGE);
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
        {themes.length > 0 && (
          <ul className="evh-list">
            {shown.map((t) => {
              const by = playedNames(t, ev);
              return (
                <li key={t.id} className={'evh-row' + (by.length > 0 ? ' played' : '')}>
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
                    {by.length > 0 && <span className="evh-by">{by.join(', ')} 님이 해 봤어요</span>}
                  </label>
                  {by.length > 0
                    ? <span className="chip-info warn">해 봄 {by.length}</span>
                    : <span className="chip-info ok">아무도 안 해 봄</span>}
                </li>
              );
            })}
          </ul>
        )}
        {themes.length > shown.length && (
          <button type="button" className="evh-more" onClick={() => setMore(true)}>{themes.length - shown.length}개 더 보기</button>
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
          >고른 테마 {pickedThemes.length}개로 조합 계산</button>
        )}
      </div>
    </details>
  );
}
