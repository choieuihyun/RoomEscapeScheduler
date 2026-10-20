import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AI_PROMPT, BULK_MAX_LINES, ISSUE_TEXT, STATUS_TEXT, blocked, bulkSummary, checkedByDefault, choose, matchBulk, parseBulk, raceKey,
  rowStatus, runPool, toInput, type BulkRow,
} from '../bulkPlayed';
import { todayKst } from '../clubEvents';
import { addPlayed, sayClub, type PlayedDto, type ThemeRef } from '../server';
import { showToast } from '../toast';
import { withoutPending, type UseProfileReturn } from '../useProfile';

/* 해 본 테마 여러 개 한꺼번에 넣기(기획 §4.61) — 해 본 테마 카드의 "여러 개 한꺼번에 넣기"로 여는 창. 지연 청크.
   ① 안내 + 붙여넣기 → ② 미리 보기(서버 테마에 맞춘 표, 체크) → ③ 4개씩 저장(진행 막대, 끝 요약, 실패한 것만 다시).
   서버는 그대로 — POST /api/me/played 를 줄마다 부른다(멱등). 창을 닫으면 새로 보내지 않는다(이미 보낸 것은 남는다). */

const EXAMPLE = '메모리컴퍼니 | 키이스케이프 강남점 | 2024-03-15\n월야애담 | 비트포비아 홍대 |\n그림자 없는 상점';

type Step = 'paste' | 'preview' | 'save';
type Preview = { rows: BulkRow[]; checked: ReadonlySet<number>; merged: number; over: number; mine: PlayedDto[] };
type Saving = {
  total: number; settled: number; running: boolean;
  inserted: number; existed: number;
  failed: { row: BulkRow; msg: string }[];
  left: BulkRow[];   // 멈춰서 보내지 못한 것
  fatal: string;     // 로그인 만료·승인 아님 — 멈춘 까닭
};

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const isFatal = (e: unknown) => statusOf(e) === 401 || statusOf(e) === 403;
function fatalText(e: unknown): string {
  if (statusOf(e) === 401) return '로그인이 풀렸어요. 다시 로그인한 뒤 남은 것을 넣어 주세요.';
  const m = (e as { body?: { message?: string } } | null)?.body?.message;
  return m || '승인된 멤버만 기록할 수 있어요.';
}
const dot = (iso: string) => iso.replaceAll('-', '.');
const countLines = (t: string) => { let n = 0; for (const l of t.split('\n')) if (l.trim()) n++; return n; };

export function BulkModal({ profile, onClose }: { profile: UseProfileReturn; onClose: () => void }) {
  const uid = useId();
  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [copyFail, setCopyFail] = useState(false);
  const [pv, setPv] = useState<Preview | null>(null);
  const [sv, setSv] = useState<Saving | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { themes, themesError, loadThemes, played, pendingIds, undo, reloadPlayed } = profile;
  useEffect(() => { void loadThemes(); }, [loadThemes]);

  /* 열리면 붙여넣기 칸으로, 닫히면 연 단추로 포커스. 닫히면(또는 화면이 바뀌어 사라지면) 저장을 멈춘다 */
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    return () => {
      abortRef.current?.abort();
      back?.focus?.();
    };
  }, []);

  /* Esc 로 닫고, Tab 은 창 안에서만 돈다 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const box = boxRef.current;
      if (!box) return;
      const fs = [...box.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,select:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')]
        .filter((el) => el.offsetParent !== null);
      const first = fs[0], last = fs[fs.length - 1], a = document.activeElement;
      if (!first) return;
      if (!box.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* 문구 복사 — 안 되면(권한·http) 문구를 골라 둔 상태로 두고 직접 복사하라고 한다 */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopyFail(false);
      showToast('복사했어요');
    } catch {
      setCopyFail(true);
      const el = promptRef.current;
      if (el) { el.focus(); getSelection()?.selectAllChildren(el); }
    }
  };

  const ready = themes !== null && played !== null;
  const lineCount = useMemo(() => countLines(text), [text]);

  const preview = () => {
    if (!themes || !played) return;
    const mine = withoutPending(played, pendingIds);
    const p = parseBulk(text, todayKst());
    const m = matchBulk(p.lines, themes, mine);
    const checked = new Set(m.rows.flatMap((r, i) => (checkedByDefault(r) ? [i] : [])));
    setPv({ rows: m.rows, checked, merged: p.merged + m.merged, over: p.over, mine });
    setStep('preview');
    requestAnimationFrame(() => boxRef.current?.querySelector<HTMLElement>('.bk-body')?.scrollTo({ top: 0 }));
  };

  const toggle = useCallback((i: number) => setPv((cur) => {
    if (!cur) return cur;
    const checked = new Set(cur.checked);
    if (checked.has(i)) checked.delete(i); else checked.add(i);
    return { ...cur, checked };
  }), []);

  /* 매장 고르기 — 고르면 찾음(또는 직접 기록)으로 바뀌고 저장할 것이면 체크한다 */
  const pick = useCallback((i: number, ref: ThemeRef | null) => setPv((cur) => {
    if (!cur) return cur;
    const rows = cur.rows.slice();
    rows[i] = choose(rows[i], ref, cur.mine);
    const checked = new Set(cur.checked);
    if (checkedByDefault(rows[i])) checked.add(i); else checked.delete(i);
    return { ...cur, rows, checked };
  }), []);

  const save = async (targets: BulkRow[]) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setStep('save');
    setSv({ total: targets.length, settled: 0, running: true, inserted: 0, existed: 0, failed: [], left: [], fatal: '' });
    /* 이미 있던 기록 id — 서버가 같은 테마라 있던 행을 돌려주면(멱등) "넣었어요"에 세지 않는다 */
    const before = new Set((played ?? []).map((p) => p.id));
    const seen = new Set<number>();
    let inserted = 0, existed = 0;
    let idToken: () => Promise<string | null>;
    try { ({ idToken } = await import('../cloud')); } catch {
      setSv((s) => s && { ...s, running: false, left: targets, fatal: '연결이 끊겼어요. 잠시 뒤 다시 해 주세요.' });
      return;
    }
    const r = await runPool(targets, async (row) => {
      const t = await idToken();
      if (!t) throw Object.assign(new Error('로그인해 주세요.'), { status: 401 });
      const dto = await addPlayed(toInput(row), t);
      /* 지우려고 미뤄 둔 그 기록이 돌아왔으면 지우기를 거둔다(6초 뒤 지워지지 않게) — 새로 넣은 것과 같다 */
      const revived = undo(dto.id);
      if (!revived && (before.has(dto.id) || seen.has(dto.id))) existed++; else inserted++;
      seen.add(dto.id);
      return dto;
    }, {
      limit: 4, keyOf: raceKey, isFatal, signal: ac.signal,
      onSettle: (n) => { if (!ac.signal.aborted) setSv((s) => s && { ...s, settled: n }); },
    });
    if (r.ok.length > 0) void reloadPlayed();
    if (ac.signal.aborted) return;
    setSv((s) => s && {
      ...s, running: false, inserted, existed,
      failed: r.failed.map(({ item, error }) => ({ row: item, msg: sayClub(error) })),
      left: r.left,
      fatal: r.fatal ? fatalText(r.fatal) : '',
    });
  };

  const rows = useMemo(() => pv?.rows ?? [], [pv]);
  const checked = useMemo(() => pv?.checked ?? new Set<number>(), [pv]);
  const sum = useMemo(() => bulkSummary(rows, checked), [rows, checked]);
  const selectable = useMemo(() => rows.flatMap((r, i) => (!blocked(r) && rowStatus(r) !== 'exists' ? [i] : [])), [rows]);
  const allOn = selectable.length > 0 && selectable.every((i) => checked.has(i));
  const toggleAll = () => setPv((cur) => cur && { ...cur, checked: allOn ? new Set() : new Set(selectable) });

  const body = (() => {
    if (step === 'paste') {
      return (
        <>
          <p className="bk-lead">한 줄에 테마 하나씩, <b>테마 | 매장 | 날짜</b> 순서로 적어 주세요.</p>
          <pre className="bk-code" aria-label="예시">{EXAMPLE}</pre>
          <p className="bk-hint">매장과 날짜는 몰라도 돼요. 엑셀·구글 시트에서 세 칸을 그대로 복사해 붙여도 돼요.</p>
          <details className="bk-ai">
            <summary>기록이 제각각이라면</summary>
            <div className="bk-ai-in">
              <p>ChatGPT 같은 AI에게 아래 문구와 내 기록을 함께 보내고, 받은 결과를 붙여 넣으세요.</p>
              <pre ref={promptRef} className="bk-code bk-prompt" tabIndex={0} aria-label="AI에게 보낼 문구">{AI_PROMPT}</pre>
              <button type="button" className="btn bk-copy" onClick={() => void copy()}>문구 복사</button>
              {copyFail && <p className="bk-hint" role="status">복사가 안 돼서 문구를 골라 두었어요. 길게 누르거나 Ctrl+C 로 복사해 주세요.</p>}
            </div>
          </details>
          <label className="bk-label" htmlFor={uid + 't'}>붙여 넣기</label>
          <textarea
            id={uid + 't'} className="bk-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            placeholder="여기에 붙여 넣어 주세요" rows={9}
          />
          <div className="bk-under">
            <span>{lineCount > 0 ? `${lineCount}줄` : ''}</span>
            {played === null ? <span>내 기록을 불러오는 중…</span>
              : themes === null && (themesError ? (
                <span className="bk-err">테마 목록을 불러오지 못했어요.
                  <button type="button" className="pf-manual-link bk-retry" onClick={() => void loadThemes()}>다시 시도</button></span>
              ) : <span>테마 목록을 불러오는 중…</span>)}
          </div>
        </>
      );
    }
    if (step === 'preview' && pv) {
      return (
        <>
          <p className="bk-sum">
            <b>{sum.total}개</b> 중 저장할 것 <b>{sum.save}</b> · 이미 있어요 {sum.exists} · 확인 필요 {sum.check}
          </p>
          {pv.merged > 0 && <p className="bk-hint">{pv.merged}줄이 겹쳐서 합쳤어요.</p>}
          {pv.over > 0 && <p className="bk-hint">한 번에 {BULK_MAX_LINES}줄까지 읽어요. 나머지 {pv.over}줄은 저장한 뒤 다시 넣어 주세요.</p>}
          {sum.check > 0 && <p className="bk-hint">날짜·이름을 고치려면 ‹ 다시 붙여넣기에서 그 줄을 고쳐 주세요.</p>}
          {rows.length === 0 ? (
            <p className="bk-empty">읽을 수 있는 줄이 없어요. 한 줄에 테마 하나씩 적어 주세요.</p>
          ) : (
            <div className="bk-table">
              <div className="bk-row bk-th">
                <label className="bk-ck"><input type="checkbox" checked={allOn} onChange={toggleAll} disabled={selectable.length === 0} />
                  <span className="bk-th-all">모두</span></label>
                <span className="bk-th-c">테마</span><span className="bk-th-c">매장</span><span className="bk-th-c">날짜</span><span className="bk-th-c">상태</span>
              </div>
              <ul className="bk-list">
                {rows.map((r, i) => <Row key={i} i={i} r={r} on={checked.has(i)} toggle={toggle} pick={pick} />)}
              </ul>
            </div>
          )}
        </>
      );
    }
    if (step === 'save' && sv) {
      const pct = sv.total === 0 ? 100 : Math.round((sv.settled / sv.total) * 100);
      const retry = [...sv.failed.map((f) => f.row), ...sv.left];
      return sv.running ? (
        <div className="bk-run">
          <p className="bk-lead">저장하고 있어요.</p>
          <div className="bk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={sv.total} aria-valuenow={sv.settled} aria-label="저장한 수">
            <i style={{ width: pct + '%' }} />
          </div>
          <p className="bk-count"><b>{sv.settled}</b> / {sv.total}</p>
          <p className="bk-hint">창을 닫으면 저장을 멈춰요. 이미 넣은 것은 남고, 다시 넣어도 겹치지 않아요.</p>
        </div>
      ) : (
        <div className="bk-run">
          <p className="bk-lead" role="status">
            <b>{sv.inserted}개</b> 넣었어요
            {sv.existed > 0 && <> · {sv.existed}개는 이미 있었어요</>}
            {sv.failed.length > 0 && <> · <span className="bk-warn">{sv.failed.length}개 실패</span></>}
            {sv.left.length > 0 && <> · {sv.left.length}개는 못 보냈어요</>}
          </p>
          {sv.fatal && <p className="merr" role="alert">{sv.fatal}</p>}
          {sv.failed.length > 0 && (
            <ul className="bk-fail">
              {sv.failed.map((f, k) => (
                <li key={k}><b>{toInput(f.row).themeName}</b><span>{f.msg}</span></li>
              ))}
            </ul>
          )}
          {retry.length === 0 && <p className="bk-hint">해 본 테마 목록에 들어갔어요.</p>}
        </div>
      );
    }
    return null;
  })();

  const retryRows = sv && !sv.running ? [...sv.failed.map((f) => f.row), ...sv.left] : [];
  const foot = step === 'paste' ? (
    <>
      <button type="button" className="btn" onClick={onClose}>닫기</button>
      <button type="button" className="btn-go" disabled={!text.trim() || !ready} onClick={preview}>미리 보기</button>
    </>
  ) : step === 'preview' ? (
    <>
      <button type="button" className="btn" onClick={() => setStep('paste')}>‹ 다시 붙여넣기</button>
      <button type="button" className="btn-go" disabled={checked.size === 0}
        onClick={() => void save(rows.filter((_, i) => checked.has(i)))}>{checked.size}개 저장</button>
    </>
  ) : sv?.running ? (
    <button type="button" className="btn" onClick={onClose}>닫고 멈추기</button>
  ) : (
    <>
      {retryRows.length > 0 && (
        <button type="button" className="btn" onClick={() => void save(retryRows)}>
          {sv?.fatal ? '남은 것 다시' : '실패한 것만 다시'}
        </button>
      )}
      <button type="button" className="btn-go" onClick={onClose}>닫기</button>
    </>
  );

  return createPortal(
    <div className="modal on bk-modal">
      <div className="mbox bk-box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={uid + 'h'}>
        <div className="bk-head">
          <h3 id={uid + 'h'}>여러 개 한꺼번에 넣기</h3>
          <button type="button" className="bk-x" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <div className="bk-body">{body}</div>
        <div className="bk-foot">{foot}</div>
      </div>
    </div>,
    document.body,
  );
}

/* 미리 보기 한 줄 — 400줄을 그려도 체크 하나에 그 줄만 다시 그리게 memo */
const Row = memo(function Row({ i, r, on, toggle, pick }: {
  i: number; r: BulkRow; on: boolean; toggle: (i: number) => void; pick: (i: number, ref: ThemeRef | null) => void;
}) {
  const st = rowStatus(r);
  const name = r.ref ? r.ref.themeName : r.line.theme;
  const off = blocked(r);
  const notes: string[] = r.line.issues.filter((x) => x !== 'storeLong' || !r.ref).map((x) =>
    x === 'date' ? `${ISSUE_TEXT.date}(${r.line.rawDate}) · 체크하면 날짜 없이 넣어요` : ISSUE_TEXT[x]);
  if (r.pick) notes.unshift('같은 이름 테마가 여러 매장에 있어요. 매장을 골라 주세요');
  return (
    <li className={'bk-row ' + st}>
      <span className="bk-ck">
        <input type="checkbox" checked={on && !off} disabled={off} onChange={() => toggle(i)} aria-label={`${name || r.line.no + '번째 줄'} 넣기`} />
      </span>
      <span className="bk-name">{name || <em>(테마 없음)</em>}</span>
      <span className="bk-store">
        {r.pick ? (
          <select aria-label={`${name} 매장 고르기`} defaultValue="" onChange={(e) => {
            const v = e.target.value;
            if (v === 'direct') pick(i, null); else if (v !== '') pick(i, r.cands[Number(v)]);
          }}>
            <option value="" disabled>매장 고르기</option>
            {r.cands.map((c, k) => <option key={c.themeKey} value={k}>{c.storeName} {c.branchName}</option>)}
            <option value="direct">직접 기록</option>
          </select>
        ) : r.ref ? (
          <>{r.ref.storeName} {r.ref.branchName}{r.mismatch && <small className="bk-dim">매장이 달라요 · 적은 것: {r.line.store}</small>}</>
        ) : (r.line.store || <span className="bk-dim">–</span>)}
      </span>
      <span className="bk-date">{r.line.date ? dot(r.line.date) : <span className="bk-dim">–</span>}</span>
      <span className={'chip-info bk-chip' + (st === 'check' ? ' warn' : st === 'exists' ? ' muted' : '')}>{STATUS_TEXT[st]}</span>
      {notes.length > 0 && <span className="bk-why">{r.line.no}번째 줄 · {notes.join(' · ')}</span>}
    </li>
  );
});
