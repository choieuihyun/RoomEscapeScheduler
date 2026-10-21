import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { keepSettle, MemberLink, PayForm, settleMissing, useClubStore } from '../clubStore';
import {
  errorCode, getSettlement, isMissingApi, markTransfer, putSettlement, sayClub, settleConflictOf,
  type EventDto, type SettlementDto, type SettlementItemInput, type TransferDto,
} from '../server';
import {
  canMark, commas, draftFrom, editBody, isAdjusted, draftInput, draftIssue, draftShares, gapText, headCount, itemRest, LABEL_MAX, LABELS, MAX_ITEMS,
  orderTransfers, parseWon, payInfoMissing, progress, settlePeople, settleText, won, type ItemDraft,
} from '../settle';
import { showToast } from '../toast';
import type { UseClubEventsReturn } from '../useClubEvents';
import { useBackClose } from '../backStack';

/* 일정 상세의 정산 칸(§4.13) — 참여자·운영진·만든 사람에게(정산이 있으면 항목에 든 사람도 — 서버가 403 이면 숨긴다).
   항목마다 결제한 사람과 같이 낸 사람이 다르다(방탈출 → 저녁 → 카페). 항목 하나를 고칠 때마다 PUT(항목 통째로, version).
   송금은 서버가 계산하고 여기서는 받은 transfers 를 그린다. 알림은 없다. */

async function token(): Promise<string> {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return t;
}

/* 409 때 서버 문구 뒤에 붙인다 — 창의 입력은 버리고 최신으로 다시 그렸다 */
const REDO = ' 입력한 내용은 저장되지 않았어요. 최신 내용을 보고 다시 고쳐 주세요.';
const keyOf = (d: SettlementDto) => String(d.items.length ? d.total : null);

export function SettlePanel({ ev, club, meUid }: { ev: EventDto; club: UseClubEventsReturn; meUid: string }) {
  const s = useClubStore();
  const member = ev.joined || ev.canManage;
  const has = ev.settlementTotal !== null;
  /* 받아 둔 정산 — 일정 목록의 합계와 맞을 때만 먼저 보인다(다른 사람이 지웠으면 낡은 것) */
  const cached = s.settles.get(ev.id);
  const [dto, setDto] = useState<SettlementDto | null>(cached && cached.key === String(ev.settlementTotal) ? cached.dto : null);
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  /* 고치기 창 — 열 때의 정산(version·항목)을 붙잡는다. 창이 열린 사이 정산을 새로 받아도 창은 이 스냅샷을 고치고
     이 version 으로 저장한다(그사이 바뀌었으면 서버가 409) */
  const [edit, setEdit] = useState<{ at: number | null; base: SettlementDto } | null>(null);
  const [marking, setMarking] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [text, setText] = useState('');
  const [starting, setStarting] = useState(false);
  /* 마지막으로 맞춘 합계 — 내가 저장해 목록 합계를 바꾼 때는 다시 받지 않는다 */
  const lastKey = useRef<string | null>(null);

  const apply = useCallback((d: SettlementDto) => {
    setDto(d);
    keepSettle(d);
    const k = keyOf(d);
    lastKey.current = k;
    const total = d.items.length ? d.total : null;
    if (total !== ev.settlementTotal) club.adopt({ ...ev, settlementTotal: total });
  }, [club, ev]);

  const load = useCallback(async (): Promise<SettlementDto | null> => {
    setErr('');
    try {
      const d = await getSettlement(ev.id, await token());
      apply(d);
      return d;
    } catch (e) {
      if (isMissingApi(e)) settleMissing();
      else if (errorCode(e) === 'NOT_PARTICIPANT') setHidden(true);
      else setErr(sayClub(e));
      return null;
    }
  }, [ev.id, apply]);

  /* 정산이 있으면 열 때 받는다(보냈어요 체크가 바뀌었을 수 있다). 합계가 바뀌면 다시.
     참여자·운영진·만든 사람이 아니면 받지 않는다(합계 한 줄만) */
  const want = s.settleApi === 'on' && has && member && !hidden;
  useEffect(() => {
    if (!want) return;
    const k = String(ev.settlementTotal);
    if (lastKey.current === k) return;
    lastKey.current = k;
    void Promise.resolve().then(load); // 한 틱 뒤에 — effect 안 동기 setState 경고를 피한다
  }, [want, ev.settlementTotal, load]);

  if (s.settleApi !== 'on' || hidden || (!member && !has)) return null;
  if (!member) {
    return (
      <section className="stl stl-none" aria-label="정산">
        <div className="stl-h"><h3>정산</h3><span className="stl-only">모두 {won(ev.settlementTotal as number)}</span></div>
        <p className="evp-hint">참여한 사람만 자세히 볼 수 있어요.</p>
      </section>
    );
  }

  const items = dto?.items ?? [];
  const start = async () => {
    if (starting) return;
    setStarting(true);
    const d = dto ?? await load();
    setStarting(false);
    if (d) setEdit({ at: null, base: d });
  };

  /* 항목 하나를 바꾼 목록을 통째로 — 실패 문구를 돌려준다(창에 보인다). 충돌이면 최신으로 바꾸고 창을 닫는다 */
  const save = async (base: SettlementDto, at: number | null, item: SettlementItemInput | null): Promise<string> => {
    const body = editBody(base, at, item);
    try {
      apply(await putSettlement(ev.id, body.version, body.items, await token()));
      setEdit(null);
      setNotice('');
      return '';
    } catch (e) {
      const latest = settleConflictOf(e);
      if (latest) { apply(latest); setEdit(null); setNotice(sayClub(e) + REDO); return ''; }
      if (isMissingApi(e)) { settleMissing(); return ''; }
      return sayClub(e);
    }
  };

  const mark = async (t: TransferDto, paid: boolean) => {
    const k = t.from.uid + '>' + t.to.uid;
    if (marking) return;
    setMarking(k);
    try {
      apply(await markTransfer(ev.id, t.from.uid, t.to.uid, paid, await token()));
    } catch (e) {
      if (isMissingApi(e)) settleMissing();
      else {
        showToast(sayClub(e));
        if (errorCode(e) === 'NO_SUCH_TRANSFER') void load();
      }
    } finally {
      setMarking('');
    }
  };

  const copy = async (value: string, ok: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(ok);
      return true;
    } catch {
      return false;
    }
  };
  const copyText = async () => {
    if (!dto) return;
    const t = settleText(ev, dto);
    setText(t);
    if (!(await copy(t, '정산 내용을 복사했어요. 카톡에 붙여 넣으세요.'))) showToast('복사가 안 돼요. 아래 글을 길게 눌러 복사해 주세요.');
  };

  const head = (right?: ReactNode) => (
    <div className="stl-h">
      <h3>정산</h3>
      {right}
    </div>
  );

  /* 아직 정산이 없다 — 단추 한 줄 */
  if (items.length === 0) {
    return (
      <section className="stl stl-none" aria-label="정산">
        {/* 받다가 403 밖의 오류가 났으면 "정산하기" 대신 "다시 시도" */}
        {err ? head(<button type="button" className="btn evp-sm stl-start" onClick={() => void load()}>다시 시도</button>)
          : head(<button type="button" className="btn evp-sm stl-start" disabled={starting || (has && !dto)} onClick={() => void start()}>
            {has && !dto ? '불러오는 중…' : '정산하기'}
          </button>)}
        {!has && !dto && <p className="evp-hint">방탈출·저녁·카페처럼 항목마다 낸 사람이 달라도 나눠 드려요.</p>}
        {err && <p className="merr">{err}</p>}
        {notice && <p className="stl-notice" role="alert">{notice}</p>}
        {edit && <ItemEditor ev={ev} dto={edit.base} at={edit.at} meUid={meUid} onSave={(at, item) => save(edit.base, at, item)} onClose={() => setEdit(null)} />}
      </section>
    );
  }

  const d = dto as SettlementDto;
  const pr = progress(d);
  const ordered = orderTransfers(d.transfers, meUid);
  /* 이름은 눌러 멤버 카드(내 이름이면 내 프로필) */
  const nameOf = (u: { uid: string; nickname: string }) => (
    <MemberLink uid={u.uid} name={u.nickname} className={u.uid === meUid ? 'stl-me' : undefined}>{u.nickname}{u.uid === meUid && <em> (나)</em>}</MemberLink>
  );

  return (
    <section className="stl" aria-label="정산">
      {head(<button type="button" className="btn evp-sm" onClick={() => void copyText()}>텍스트 복사</button>)}
      {notice && <p className="stl-notice" role="alert">{notice}</p>}
      <div className="stl-sum">
        <p className="stl-total"><b>모두 {won(d.total)}</b><span> · {headCount(d)}명</span></p>
        {pr.total > 0 ? (
          <div className="stl-prog">
            <span>보낼 돈 {pr.total}건 중 {pr.paid}건 보냄</span>
            <span className="stl-bar" role="progressbar" aria-label="보낸 송금" aria-valuemin={0} aria-valuemax={pr.total} aria-valuenow={pr.paid}>
              <i style={{ width: `${Math.round((pr.paid / pr.total) * 100)}%` }} />
            </span>
          </div>
        ) : <span className="stl-prog-none">주고받을 돈이 없어요</span>}
      </div>
      {text && (
        <div className="stl-text">
          <code className="evp-post">{text}</code>
          <button type="button" className="stl-link" onClick={() => setText('')}>닫기</button>
        </div>
      )}

      <ul className="stl-items">
        {items.map((it, i) => (
          /* 고치기 단추의 ::after 가 줄 전체를 덮어 어디를 눌러도 고치기. 결제한 사람 이름은 그 위에 따로(멤버 카드) */
          <li key={it.id} className="stl-item">
            <button type="button" className="stl-item-open" onClick={() => setEdit({ at: i, base: d })} aria-label={`${it.label} ${won(it.amount)} 고치기`}>
              <span className="stl-item-top"><b className="stl-label">{it.label}</b><b className="stl-amt">{won(it.amount)}</b></span>
            </button>
            <span className="stl-item-sub"><MemberLink uid={it.payer.uid} name={it.payer.nickname} />{itemRest(it)}</span>
          </li>
        ))}
      </ul>
      {items.length < MAX_ITEMS && <button type="button" className="stl-add" onClick={() => setEdit({ at: null, base: d })}>＋ 항목 더하기</button>}

      {d.transfers.length > 0 && (
        <div className="stl-trs">
          <h4 className="stl-sh">보낼 돈</h4>
          <ul>
            {ordered.map((t) => {
              const k = t.from.uid + '>' + t.to.uid;
              const p = d.payInfo[t.to.uid];
              const can = canMark(t, meUid, ev.canManage);
              const mine = t.from.uid === meUid;
              return (
                <li key={k} className={'stl-tr' + (mine ? ' mine' : '') + (t.paid ? ' paid' : '')}>
                  <div className="stl-tr-top">
                    <span className="stl-who">{nameOf(t.from)}<i> → </i>{nameOf(t.to)}</span>
                    <b className="stl-amt">{won(t.amount)}</b>
                  </div>
                  <div className="stl-tr-acts">
                    {/* 계좌·카카오페이는 내가 보낼 줄에만 — 남의 줄은 금액·상태만 읽는다 */}
                    {mine && !t.paid && p?.bankText && (
                      <button type="button" className="stl-link" onClick={() => void copy(p.bankText as string, `${t.to.nickname} 님 계좌를 복사했어요.`).then((ok) => { if (!ok) showToast(p.bankText as string); })}>계좌 복사</button>
                    )}
                    {mine && !t.paid && p?.kakaopayUrl && <a className="stl-link" href={p.kakaopayUrl} target="_blank" rel="noopener noreferrer">카카오페이</a>}
                    {can ? (
                      <label className="stl-paid">
                        <input type="checkbox" checked={t.paid} disabled={marking !== ''} onChange={(e) => void mark(t, e.target.checked)} />
                        보냈어요
                      </label>
                    ) : <span className={'stl-state' + (t.paid ? ' on' : '')}>{t.paid ? '보냄' : '아직 안 보냄'}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {payInfoMissing(d, meUid) && (
            <p className="stl-payhint">송금 정보를 넣어 두면 계좌 복사가 돼요. <button type="button" className="stl-link" onClick={() => setPayOpen(true)}>송금 정보 넣기</button></p>
          )}
        </div>
      )}
      {edit && <ItemEditor ev={ev} dto={edit.base} at={edit.at} meUid={meUid} onSave={(at, item) => save(edit.base, at, item)} onClose={() => setEdit(null)} />}
      {payOpen && (
        <Sheet label="송금 정보" onClose={() => setPayOpen(false)}>
          <h3>송금 정보</h3>
          <p className="msub">정산에서 내가 받을 돈이 있으면 계좌 복사·카카오페이 단추로 보여요.</p>
          <PayForm onSaved={() => { setPayOpen(false); void load(); }} />
          <div className="mbtns"><button type="button" className="btn" onClick={() => setPayOpen(false)}>닫기</button></div>
        </Sheet>
      )}
    </section>
  );
}

/* 창 — body 로 띄운다(상세 패널 안 transform·overflow 와 상관없이). Esc 는 이 창만 닫고, 닫으면 연 단추로 포커스를 돌려준다 */
/* onClose 가 false 를 돌려주면 닫지 않은 것(저장 중) — 뒤로 가기로 닫을 때 창을 둔다 */
function Sheet({ label, onClose, children, wide }: { label: string; onClose: () => boolean | void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useBackClose(true, onClose);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, button');
    (first ?? box.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [onClose]);
  return createPortal(
    <div className="modal stl-modal on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'mbox stl-box' + (wide ? ' mbox-wide' : '')} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={box}>{children}</div>
    </div>,
    document.body,
  );
}

/* 항목 더하기·고치기 — 이름 · 금액 · 결제한 사람 · 같이 낸 사람 · 사람별 금액(기본 똑같이, 고치면 "조정됨") */
function ItemEditor({ ev, dto, at, meUid, onSave, onClose }: {
  ev: EventDto; dto: SettlementDto; at: number | null; meUid: string;
  onSave: (at: number | null, item: SettlementItemInput | null) => Promise<string>; onClose: () => void;
}) {
  const people = settlePeople(ev, dto);
  const it = at === null ? null : dto.items[at] ?? null;
  const [d, setD] = useState<ItemDraft>(() => draftFrom(it, people, meUid, dto.items.length === 0));
  const [amtText, setAmtText] = useState(d.amount ? commas(d.amount) : '');
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const shares = draftShares(d);
  const issue = draftIssue(d);
  const gap = d.amount ? gapText(d.amount, shares) : '';
  const nick = (uid: string) => people.find((p) => p.uid === uid)?.nickname ?? uid;
  const close = useCallback(() => { if (busy) return false; onClose(); }, [busy, onClose]);

  /* 금액·사람·결제한 사람을 바꾸면 고친 금액은 버리고 다시 똑같이 나눈다(합이 어긋난 채 남지 않게) */
  /* 금액·같이 낸 사람을 바꾸면 다시 똑같이 나눈다. 이름만 고치면 저장된 몫 그대로(남는 돈이 옮겨 가 "보냈어요"가 풀리지 않게) */
  const patch = (p: Partial<ItemDraft>) => { setD((c) => ({ ...c, ...p, custom: null })); setErr(''); };
  /* 결제한 사람 — 고친 몫이면 그대로 두고, 똑같이 나눈 것이면 남는 돈이 새 결제자에게 가게 다시 나눈다 */
  const setPayer = (uid: string) => { setD((c) => ({ ...c, payerUid: uid, custom: isAdjusted(c) ? c.custom : null })); setErr(''); };
  const adjusted = isAdjusted(d);
  const setAmount = (t: string) => { const n = parseWon(t); setAmtText(n === null ? '' : commas(n)); patch({ amount: n }); };
  const toggleSharer = (uid: string) => {
    const on = d.sharers.includes(uid);
    patch({ sharers: people.map((p) => p.uid).filter((u) => (u === uid ? !on : d.sharers.includes(u))) });
  };
  const setShare = (uid: string, t: string) => {
    const n = parseWon(t) ?? 0;
    setD((c) => ({ ...c, custom: { ...Object.fromEntries(draftShares(c).map((x) => [x.uid, x.amount])), [uid]: n } }));
    setErr('');
  };
  const submit = async () => {
    setTried(true);
    if (issue) return;
    setBusy(true);
    const e = await onSave(at, draftInput(d));
    setBusy(false);
    if (e) setErr(e);
  };
  const remove = async () => {
    if (!confirm(`'${it?.label}' 항목을 지울까요?`)) return;
    setBusy(true);
    const e = await onSave(at, null);
    setBusy(false);
    if (e) setErr(e);
  };
  /* "모두"는 지금 참여자 기준 — 참여를 뺀 사람은 고른 그대로 둔다 */
  const now = people.filter((p) => !p.gone);
  const allOn = now.every((p) => d.sharers.includes(p.uid));

  return (
    <Sheet label={at === null ? '정산 항목 더하기' : '정산 항목 고치기'} onClose={close} wide>
      <h3>{at === null ? '항목 더하기' : '항목 고치기'}</h3>
      <p className="msub">결제한 사람과 같이 낸 사람을 고르면 똑같이 나눠요. 사람마다 금액을 고칠 수도 있어요.</p>

      <div className="mrow">
        <label htmlFor="stl-label">이름</label>
        <div className="stl-chips" role="group" aria-label="자주 쓰는 이름">
          {LABELS.map((l) => (
            <button key={l} type="button" className="chip-pick sm" aria-pressed={d.label.trim() === l} onClick={() => { setD((c) => ({ ...c, label: l })); setErr(''); }}>{l}</button>
          ))}
        </div>
        <input id="stl-label" value={d.label} placeholder={`직접 적기 (${LABEL_MAX}자까지)`} autoComplete="off"
          onChange={(e) => { const v = e.target.value; setD((c) => ({ ...c, label: v })); setErr(''); }} />
      </div>

      <div className="mrow">
        <label htmlFor="stl-amt">금액</label>
        <div className="stl-amtbox">
          <input id="stl-amt" inputMode="numeric" autoComplete="off" placeholder="0" value={amtText} onChange={(e) => setAmount(e.target.value)} />
          <span aria-hidden="true">원</span>
        </div>
      </div>

      <div className="mrow">
        <span className="stl-lbl" id="stl-payer">결제한 사람</span>
        <div className="stl-chips" role="radiogroup" aria-labelledby="stl-payer">
          {people.map((p) => (
            <button key={p.uid} type="button" role="radio" aria-checked={d.payerUid === p.uid}
              className={'chip-pick sm' + (d.payerUid === p.uid ? ' on' : '') + (p.gone ? ' gone' : '')} title={p.gone ? '지금은 참여하지 않아요' : undefined} onClick={() => setPayer(p.uid)}>
              {p.nickname}{p.uid === meUid && ' (나)'}
            </button>
          ))}
        </div>
      </div>

      <div className="mrow">
        <div className="stl-lbl-row">
          <span className="stl-lbl" id="stl-sharers">같이 낸 사람 <em>{d.sharers.length}명</em></span>
          <button type="button" className="stl-link" onClick={() => patch({ sharers: people.filter((p) => (p.gone ? d.sharers.includes(p.uid) : !allOn)).map((p) => p.uid) })}>
            {allOn ? '모두 빼기' : '모두 고르기'}
          </button>
        </div>
        <div className="stl-chips" role="group" aria-labelledby="stl-sharers">
          {people.map((p) => (
            <button key={p.uid} type="button" className={'chip-pick sm' + (p.gone ? ' gone' : '')} aria-pressed={d.sharers.includes(p.uid)}
              title={p.gone ? '지금은 참여하지 않아요' : undefined} onClick={() => toggleSharer(p.uid)}>
              {p.nickname}{p.uid === meUid && ' (나)'}
            </button>
          ))}
        </div>
      </div>

      {d.sharers.length > 0 && (
        <div className="stl-split">
          <div className="stl-split-h">
            <span className="stl-lbl">사람별 금액</span>
            {adjusted ? (<>
              <span className="chip-info">조정됨</span>
              <button type="button" className="stl-link" onClick={() => setD((c) => ({ ...c, custom: null }))}>다시 똑같이</button>
            </>) : <span className="stl-split-even">{d.amount ? '똑같이 나눴어요' : '금액을 적으면 나눠요'}</span>}
          </div>
          <ul>
            {shares.map((x) => (
              <li key={x.uid} className="stl-share">
                <label htmlFor={`stl-s-${x.uid}`}>{nick(x.uid)}{x.uid === d.payerUid && <em> · 결제</em>}</label>
                <span className="stl-amtbox sm">
                  <input id={`stl-s-${x.uid}`} inputMode="numeric" autoComplete="off" value={commas(x.amount)} disabled={!d.amount}
                    onChange={(e) => setShare(x.uid, e.target.value)} />
                  <span aria-hidden="true">원</span>
                </span>
              </li>
            ))}
          </ul>
          {gap && <p className="stl-gap" role="status">{gap}</p>}
          {adjusted && !gap && <p className="evp-hint">금액이나 같이 낸 사람을 바꾸면 다시 똑같이 나눠요.</p>}
        </div>
      )}

      {(tried && issue && !gap) || err ? <p className="merr" role="alert">{err || issue}</p> : null}
      <div className="mbtns">
        <button type="button" className="btn-go" disabled={busy || !!gap} onClick={() => void submit()}>{busy ? '저장 중…' : '저장'}</button>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button>
      </div>
      {at !== null && <button type="button" className="stl-del" disabled={busy} onClick={() => void remove()}>이 항목 지우기</button>}
    </Sheet>
  );
}
