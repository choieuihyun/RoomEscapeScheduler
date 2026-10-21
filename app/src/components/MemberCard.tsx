import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CARD_TTL_MS, loadGroups, playedCache, reloadMembers, useClubStore, type PlayedV } from '../clubStore';
import { dayLabel, eventTitle } from '../clubEvents';
import { cardLine, playedDate, togetherWith, wishesOf } from '../memberCard';
import { birthLabel, lifeLabel } from '../memberProfile';
import { errorCode, isMissingApi, memberPlayed, sayClub, type EventDto } from '../server';
import { placeLabel } from '../wish';
import { Avatar } from './Avatar';
import { useBackClose } from '../backStack';

/* 멤버 카드 — 어디서든 남의 이름을 누르면 뜬다(좁은 화면 아래 시트, 넓은 화면 가운데 작은 창).
   머리(아바타·별명·운영진·실명) → 프로필 줄 → 해 본 테마(앱 기록) → 함께한 일정 → 하고 싶은 테마.
   서버는 바꾸지 않았다: 멤버 목록(§4.11)·GET /api/club/members/{uid}/played(§4.9)·위시 묶음(§4.12)·앱이 받아 둔 일정.
   Esc·바깥 누르기·× 로 닫고, 닫으면 누른 이름으로 포커스를 돌려준다(일정을 열어 닫을 때는 일정 패널로). */

export interface MemberCardProps {
  uid: string;
  /* 누른 이름 — 멤버 목록을 받기 전에 머리에 보인다 */
  name: string;
  from: HTMLElement | null;
  meUid: string;
  today: string;
  /* 앱이 받아 둔 일정(캘린더·홈 범위)과 내 지난 일정(내 정보) — 함께한 일정을 센다 */
  events: EventDto[];
  past: EventDto[] | null;
  onClose: () => void;
  onOpenEvent: (ev: EventDto) => void;
}

/* 남의 해 본 테마 — 같은 사람을 다시 열면 받아 둔 것(5분 지나면 다시). 로그인한 사람이 바뀌면 열쇠가 달라 쓰지 않고,
   로그아웃하면 clubStore 가 통째로 버린다 */

function usePlayed(meUid: string, uid: string) {
  const k = meUid + '|' + uid;
  const [v, setV] = useState<PlayedV | null>(() => {
    const hit = playedCache.get(k);
    return hit && Date.now() - hit.at < CARD_TTL_MS ? hit.v : null;
  });
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      const t = await (await import('../cloud')).idToken();
      if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
      const list = await memberPlayed(uid, t);
      playedCache.set(k, { at: Date.now(), v: list });
      setV(list);
    } catch (e) {
      /* 승인 멤버가 아니거나 없는 uid(본문 있는 404) — 카드 전체를 "볼 수 없는 멤버예요"로 */
      if (errorCode(e) === 'NO_SUCH_MEMBER') { playedCache.set(k, { at: Date.now(), v: 'gone' }); setV('gone'); }
      else if (isMissingApi(e)) { playedCache.set(k, { at: Date.now(), v: 'missing' }); setV('missing'); } // 서버가 모름 — 이 칸만 숨기고 5분 동안 다시 묻지 않는다
      else setErr(sayClub(e));
    }
  }, [k, uid]);
  const first = useRef(v === null);
  useEffect(() => {
    if (first.current) void Promise.resolve().then(load); // 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다
  }, [load]);
  return { v, err, retry: load };
}

export function MemberCard({ uid, name, from, meUid, today, events, past, onClose, onOpenEvent }: MemberCardProps) {
  const id = useId();
  const s = useClubStore();
  const played = usePlayed(meUid, uid);
  useBackClose(true, onClose); // 뒤로 가기로 닫는다
  const [memTried, setMemTried] = useState(false);
  const [wishErr, setWishErr] = useState('');

  /* 멤버 목록(5분 안에 받았으면 그대로)·위시 묶음(받아 둔 게 있으면 그대로) */
  const loadMembers = useCallback((force: boolean) => {
    setMemTried(false);
    void reloadMembers(force).finally(() => setMemTried(true));
  }, []);
  const loadWishes = useCallback(() => {
    setWishErr('');
    loadGroups().catch((e) => setWishErr(sayClub(e)));
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => { loadMembers(false); loadWishes(); });
  }, [loadMembers, loadWishes]);

  /* 닫기 — 부르는 쪽이 매번 새 함수를 넘겨도 Esc 듣기를 다시 걸지 않게 최신 것만 기억한다 */
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const box = useRef<HTMLDivElement>(null);
  const giveBack = useRef(true);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Esc 는 조합만 끝낸다
      e.stopPropagation();
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (giveBack.current && from?.isConnected) from.focus({ preventScroll: true });
    };
  }, [from]);

  const m = s.members?.get(uid);
  const p = m?.profile;
  const nick = m?.nickname ?? name;
  /* 목록을 받았는데 없거나(승인 멤버가 아님) 해 본 테마가 NO_SUCH_MEMBER */
  const gone = played.v === 'gone' || (s.members !== null && !m);
  const tw = togetherWith([events, past], meUid, uid, today);
  const wishes = s.groups ? wishesOf(s.groups.list, uid, meUid) : null;
  const list = Array.isArray(played.v) ? played.v : null;

  return createPortal(
    <div className="modal mcard-modal on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mbox mcard" role="dialog" aria-modal="true" aria-labelledby={id + 'n'} tabIndex={-1} ref={box}>
        <button type="button" className="btn-x mcard-x" aria-label="닫기" onClick={onClose}>×</button>
        <div className="mcard-head">
          <Avatar name={nick} className="mcard-ava" />
          <div className="mcard-who">
            <div className="mcard-n1">
              <b id={id + 'n'}>{nick}</b>
              {m?.role === 'ADMIN' && <span className="chip-info role">운영진</span>}
            </div>
            {p && <span className="mcard-real">{p.realName}</span>}
          </div>
        </div>

        {gone ? <p className="mcard-gone">볼 수 없는 멤버예요</p> : (<>
          <div className="mcard-prof">
            {m === undefined ? (
              memTried && s.members === null ? (
                <p className="mcard-note">프로필을 불러오지 못했어요. <button type="button" className="stl-link" onClick={() => loadMembers(true)}>다시 시도</button></p>
              ) : <p className="mcard-note">불러오는 중이에요…</p>
            ) : !p ? <p className="mcard-note">아직 프로필이 없어요</p> : (<>
              <p className="mcard-line">{cardLine(p)}<span> · 생일 {birthLabel(p.birthDate)}</span></p>
              <div className="ppl-genres">{p.genres.map((g) => <span key={g} className="pfx-g">{g}</span>)}</div>
              <p className="mcard-life"><span>인생 테마</span> {lifeLabel(p.lifeTheme)}</p>
            </>)}
          </div>

          {played.v !== 'missing' && (
            <section className="mcard-sec" aria-labelledby={id + 'p'}>
              <div className="mcard-sh">
                <h3 id={id + 'p'}>해 본 테마</h3>
                {list && <span>앱 기록 {list.length}개</span>}
              </div>
              {list === null ? (
                played.err ? <p className="mcard-note">{played.err} <button type="button" className="stl-link" onClick={() => void played.retry()}>다시 시도</button></p>
                  : <p className="mcard-note">불러오는 중이에요…</p>
              ) : list.length === 0 ? <p className="mcard-note">아직 앱에 적은 기록이 없어요.</p> : (
                <ul className="mcard-rows">
                  {list.slice(0, 5).map((x) => {
                    const place = placeLabel(x);
                    return (
                      <li key={x.id} className="mcard-row">
                        <span className="mcard-rn">{x.themeName}{place && <em>{place}</em>}</span>
                        <span className="mcard-rd">{playedDate(x.playedOn, today)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="mcard-sec" aria-labelledby={id + 'e'}>
            <div className="mcard-sh">
              <h3 id={id + 'e'}>함께한 일정</h3>
              {tw.recent.length > 0 && <span>다가오는 {tw.upcoming} · 지난 {tw.past}</span>}
            </div>
            {tw.recent.length === 0 ? <p className="mcard-note">같이 참여한 일정이 아직 없어요.</p> : (
              <ul className="mcard-rows">
                {tw.recent.map((ev) => (
                  <li key={ev.id}>
                    <button type="button" className="mcard-ev" onClick={() => { giveBack.current = false; onOpenEvent(ev); }}>
                      <span className="mcard-rd">{ev.date ? dayLabel(ev.date) : '날짜 미정'}</span>
                      <span className="mcard-et">{eventTitle(ev)}</span>
                      <i aria-hidden="true">›</i>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {s.wishApi !== 'missing' && (
            <section className="mcard-sec" aria-labelledby={id + 'w'}>
              <div className="mcard-sh">
                <h3 id={id + 'w'}>하고 싶은 테마</h3>
                {wishes && wishes.chips.length > 0 && <span>{wishes.chips.length + wishes.more}개</span>}
              </div>
              {wishes === null ? (
                wishErr ? <p className="mcard-note">{wishErr} <button type="button" className="stl-link" onClick={loadWishes}>다시 시도</button></p>
                  : <p className="mcard-note">불러오는 중이에요…</p>
              ) : wishes.chips.length === 0 ? <p className="mcard-note">올린 테마가 없어요.</p> : (
                <ul className="mcard-wish">
                  {wishes.chips.map((c, i) => (
                    <li key={c.key + '|' + i} className={'mcard-w' + (c.also ? ' also' : '')} title={c.place || undefined}>
                      {c.name}{c.also && <em>나도</em>}
                    </li>
                  ))}
                  {wishes.more > 0 && <li className="mcard-w more">외 {wishes.more}</li>}
                </ul>
              )}
            </section>
          )}
        </>)}
      </div>
    </div>,
    document.body,
  );
}
