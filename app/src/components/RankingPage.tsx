import { useCallback, useEffect, useRef, useState } from 'react';
import { MemberLink } from '../clubStore';
import { allEmpty, firstRange, mergeMonths, monthLabel, olderRange, topRanks } from '../memberProfile';
import { isMissingApi, rankings, sayClub, type RankMonthDto } from '../server';
import { showToast } from '../toast';
import { Medal } from './Medal';

/* 달별 랭킹(§4.11) — 이번 달부터 거꾸로 달마다 5등까지(별명·횟수). 처음엔 최근 3달, "이전 달 더 보기"로 3달씩.
   서버가 이 API 를 모르면(본문 없는 404) onMissing — 메뉴를 숨기고 더보기로 돌아간다.
   차분하게: 메달·트로피·색 띠 없이 순위 숫자만 굵게(1등만 청록 글자), 내 줄은 옅은 바탕.
   줄 어디를 눌러도 그 사람의 멤버 카드(이름 단추의 ::after 가 줄을 덮는다). */
export function RankingPage({ active, today, meUid, onBack, onMissing }: {
  active: boolean; today: string; meUid: string; onBack: () => void; onMissing: () => void;
}) {
  const [months, setMonths] = useState<RankMonthDto[] | null>(null);
  const [oldest, setOldest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /* 더 보기로 받은 3달이 모두 비었으면 더 옛날은 묻지 않는다(단추를 숨긴다) */
  const [ended, setEnded] = useState(false);
  const seq = useRef(0);
  /* 부르는 쪽이 매번 새 함수를 넘겨도 다시 받지 않게 — 최신 것만 기억한다 */
  const missingRef = useRef(onMissing);
  useEffect(() => { missingRef.current = onMissing; }, [onMissing]);

  const inflight = useRef('');
  /* 마지막으로 물은 범위 — "다시 시도"는 이 범위만 다시 묻는다(받아 둔 전체를 다시 물으면 12달을 넘어 BAD_RANGE 가 된다) */
  const lastRange = useRef<{ from: string; to: string; older: boolean } | null>(null);
  const load = useCallback(async (range: { from: string; to: string }, older = false) => {
    const key = range.from + range.to;
    if (inflight.current === key) return; // 같은 범위를 이미 묻는 중(들어오자마자 두 번 불려도 한 번만)
    inflight.current = key;
    lastRange.current = { ...range, older };
    const my = ++seq.current;
    setBusy(true);
    try {
      const t = await (await import('../cloud')).idToken();
      if (!t) throw new Error('로그인해 주세요.');
      const got = await rankings(range.from, range.to, t);
      if (my !== seq.current) return;
      setMonths((had) => mergeMonths(had ?? [], got, range));
      setOldest((o) => (o === null || range.from < o ? range.from : o));
      setErr('');
      if (older && allEmpty(got)) setEnded(true);
    } catch (e) {
      if (my !== seq.current) return;
      if (isMissingApi(e)) { showToast('서버가 아직 랭킹을 몰라요. 잠시 뒤에 다시 열어 주세요.'); missingRef.current(); return; }
      setErr(sayClub(e));
    } finally {
      if (inflight.current === key) inflight.current = '';
      if (my === seq.current) setBusy(false);
    }
  }, []);

  /* 들어올 때마다 최근 3달을 새로 받는다(이미 받은 지난 달은 그대로 둔다) */
  const first = firstRange(today);
  useEffect(() => {
    if (active) void Promise.resolve().then(() => load(first)); /* 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, first.from, first.to, load]);

  const thisMonth = today.slice(0, 7);
  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>랭킹</h1>
      <p>달마다 해 본 테마를 많이 기록한 멤버 5등까지예요. 날짜를 적은 기록만 세고, 같은 수면 같은 순위예요.</p>
    </header>
    <div className="rk">
      {err && <div className="home-empty rk-err"><p>{err}</p><button type="button" className="btn" disabled={busy} onClick={() => void (lastRange.current ? load(lastRange.current, lastRange.current.older) : load(first))}>다시 시도</button></div>}
      {!err && months === null && <p className="mem-empty">불러오는 중이에요…</p>}
      {months && (
        <div className="rk-grid">
          {months.map((m) => {
            const ranks = topRanks(m);
            return (
              <section key={m.month} className="home-card rk-month" aria-label={monthLabel(m.month)}>
                <h2 className="rk-h">{monthLabel(m.month)}{m.month === thisMonth && <span className="rk-now">이번 달</span>}</h2>
                {ranks.length === 0 ? <p className="rk-empty">아직 기록이 없어요</p> : (
                  <ol className="rk-list">
                    {ranks.map((r) => {
                      const me = r.uid === meUid;
                      return (
                        <li key={r.uid} className={'rk-row' + (me ? ' me' : '') + (r.rank === 1 ? ' first' : '')}>
                          {r.rank <= 3 ? <Medal rank={r.rank} className="rk-no" /> : <span className="rk-no">{r.rank}</span>}
                          <MemberLink uid={r.uid} name={r.nickname} className="rk-nick">{r.nickname}{me && <span className="rk-me">나</span>}</MemberLink>
                          <span className="rk-cnt">{r.count}개</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
      {months && oldest && !ended && (
        <button type="button" className="pf-more rk-more" disabled={busy} onClick={() => void load(olderRange(oldest), true)}>
          {busy ? '불러오는 중…' : '이전 달 더 보기'}
        </button>
      )}
    </div>
  </>);
}
