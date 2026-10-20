import { useState, type FormEvent } from 'react';
import { savePay, settleMissing, useClubStore } from '../clubStore';
import { cpLen } from '../clubEvents';
import { isMissingApi, sayClub } from '../server';
import { payIssue } from '../settle';
import { showToast } from '../toast';

/* 내 송금 정보(§4.13) — 계좌 글 · 카카오페이 송금 링크. 정산에서 내가 받을 돈이 있으면 "계좌 복사"·"카카오페이" 단추로 보인다.
   좁은 화면은 더보기 › 계정 › 송금 정보, 넓은 화면은 내 정보 카드, 정산 칸의 안내에서도 연다. */
export function PayForm({ onSaved }: { onSaved?: () => void }) {
  const s = useClubStore();
  const [bank, setBank] = useState(s.pay?.bankText ?? '');
  const [url, setUrl] = useState(s.pay?.kakaopayUrl ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = bank.trim() !== (s.pay?.bankText ?? '') || url.trim() !== (s.pay?.kakaopayUrl ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = payIssue(bank, url);
    if (issue) { setErr(issue); return; }
    setBusy(true); setErr('');
    try {
      const p = await savePay({ bankText: bank.trim() || null, kakaopayUrl: url.trim() || null });
      setBank(p.bankText ?? ''); setUrl(p.kakaopayUrl ?? '');
      showToast(p.bankText || p.kakaopayUrl ? '송금 정보를 저장했어요.' : '송금 정보를 비웠어요.');
      onSaved?.();
    } catch (x) {
      if (isMissingApi(x)) { settleMissing(); showToast('서버가 아직 정산을 몰라요. 잠시 뒤 다시 열어 주세요.'); return; }
      setErr(sayClub(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pay-form" onSubmit={(e) => void submit(e)} noValidate>
      <label className="pf-field">
        <span>계좌 <em>(은행 · 번호 · 이름)</em><i className={'pay-count' + (cpLen(bank.trim()) > 60 ? ' over' : '')}>{cpLen(bank.trim())}/60</i></span>
        <input value={bank} placeholder="예: 카카오뱅크 3333-01-1234567 홍길동" autoComplete="off"
          onChange={(e) => { setBank(e.target.value); setErr(''); }} />
      </label>
      <label className="pf-field">
        <span>카카오페이 송금 링크 <em>(없어도 돼요)</em></span>
        <input type="url" inputMode="url" value={url} placeholder="https://qr.kakaopay.com/…" autoComplete="off"
          onChange={(e) => { setUrl(e.target.value); setErr(''); }} />
      </label>
      <p className="pay-help">카카오페이 앱의 송금코드에서 링크를 복사해 붙여 넣어요. https://qr.kakaopay.com/ 으로 시작해요.</p>
      {err && <p className="merr" role="alert">{err}</p>}
      <div className="pay-btns">
        <button type="submit" className="btn pf-save" disabled={busy || !dirty}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  );
}

export function PayCard() {
  const s = useClubStore();
  return (
    <section className="home-card pay-card" aria-label="송금 정보">
      <h2 className="home-h">송금 정보</h2>
      <p className="pay-sub">정산에서 내가 받을 돈이 있으면 멤버들에게 계좌 복사·카카오페이 단추로 보여요.</p>
      {/* 처음 받은 값이 늦게 오면 칸을 그 값으로 새로 시작한다 */}
      <PayForm key={s.pay ? 'got' : 'none'} />
    </section>
  );
}
