import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { todayKst } from '../clubEvents';
import { lifeLabel, matchPerson, personLine, sortPeople, type PeopleSort } from '../memberProfile';
import { listClubMembers, sayClub, type ClubMemberDto } from '../server';
import { Avatar } from './Avatar';

/* 멤버 목록(§4.11) — 승인 멤버 누구나. 운영진의 멤버 관리(승인·역할)와는 따로다.
   화면에 들어올 때마다 GET /api/club/members 를 새로 받는다(프로필을 고친 사람이 바로 보이게). */
export function PeoplePage({ active, meUid, onBack }: { active: boolean; meUid: string; onBack: () => void }) {
  const id = useId();
  const [list, setList] = useState<ClubMemberDto[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<PeopleSort>('name');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const t = await (await import('../cloud')).idToken();
      if (!t) throw new Error('로그인해 주세요.');
      const r = await listClubMembers(t);
      if (my === seq.current) { setList(r); setErr(''); }
    } catch (e) {
      if (my === seq.current) setErr(sayClub(e));
    }
  }, []);
  useEffect(() => { if (active) void Promise.resolve().then(load); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */ }, [active, load]);

  const today = todayKst();
  const shown = useMemo(() => (list ? sortPeople(list.filter((m) => matchPerson(m, q)), sort, meUid) : []), [list, q, sort, meUid]);

  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>멤버</h1>
      <p>승인된 멤버예요. 서로의 프로필을 볼 수 있어요.</p>
    </header>
    <div className="ppl">
      <div className="ppl-bar">
        <div className="ppl-q">
          <label htmlFor={id + 'q'} className="sr-only">멤버 찾기</label>
          <input id={id + 'q'} type="search" autoComplete="off" placeholder="별명이나 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
          <svg className="pf-q-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        <div className="ppl-sort" role="group" aria-label="정렬">
          {(['name', 'rooms'] as const).map((k) => (
            <button key={k} type="button" className="chip-pick" aria-pressed={sort === k} onClick={() => setSort(k)}>
              {k === 'name' ? '가나다' : '방 수 많은 순'}
            </button>
          ))}
        </div>
        {list && <span className="ppl-n">{q.trim() ? `찾은 멤버 ${shown.length}명 · ` : ''}모두 {list.length}명</span>}
      </div>

      {err && <div className="home-empty"><p>{err}</p><button type="button" className="btn" onClick={() => void load()}>다시 시도</button></div>}
      {!err && list === null && <p className="mem-empty">불러오는 중이에요…</p>}
      {list && shown.length === 0 && <p className="mem-empty">{q.trim() ? `'${q.trim()}' 와 맞는 멤버가 없어요.` : '아직 멤버가 없어요.'}</p>}
      {shown.length > 0 && (
        <ul className="ppl-grid">
          {shown.map((m) => {
            const p = m.profile;
            const me = m.uid === meUid;
            return (
              <li key={m.uid} className={'ppl-card' + (me ? ' me' : '')}>
                <div className="ppl-top">
                  <Avatar name={m.nickname} className="ppl-ava" />
                  <div className="ppl-who">
                    <div className="ppl-n1">
                      <b>{m.nickname}</b>
                      {m.role === 'ADMIN' && <span className="chip-info role">운영진</span>}
                      {me && <span className="chip-info">나</span>}
                    </div>
                    {p && <span className="ppl-real">{p.realName}</span>}
                  </div>
                </div>
                {p ? (<>
                  <p className="ppl-line">{personLine(p, today)}</p>
                  <div className="ppl-genres">{p.genres.map((g) => <span key={g} className="pfx-g">{g}</span>)}</div>
                  <p className="ppl-life"><span>인생 테마</span> {lifeLabel(p.lifeTheme)}</p>
                </>) : <p className="ppl-none">아직 프로필이 없어요</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </>);
}
