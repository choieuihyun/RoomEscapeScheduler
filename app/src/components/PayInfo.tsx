import { useState, type FormEvent } from 'react';
import { savePay, settleMissing, useClubStore } from '../clubStore';
import { cpLen } from '../clubEvents';
import { isMissingApi, sayClub } from '../server';
import { payIssue } from '../settle';
import { showToast } from '../toast';

/* 내 송금 정보(§4.13) — 계좌 글. 정산에서 내가 받을 돈이 있으면 "계좌 복사" 단추로 보인다.
   카카오페이 송금 링크 칸은 2026-10-22 사용자 요청으로 뺐다(계좌만) — 저장하면 예전에 넣어 둔 링크도 비운다.
   좁은 화면은 더보기 › 계정 › 송금 정보, 넓은 화면은 내 정보 카드, 정산 칸의 안내에서도 연다. */
export function PayForm({ onSaved }: { onSaved?: () => void }) {
  const s = useClubStore();
  const [bank, setBank] = useState(s.pay?.bankText ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = bank.trim() !== (s.pay?.bankText ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = payIssue(bank);
    if (issue) { setErr(issue); return; }
    setBusy(true); setErr('');
    try {
      const p = await savePay({ bankText: bank.trim() || null, kakaopayUrl: null });
      setBank(p.bankText ?? '');
      showToast(p.bankText ? '송금 정보를 저장했어요.' : '송금 정보를 비웠어요.');
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
      <p className="pay-sub">정산에서 내가 받을 돈이 있으면 멤버들에게 계좌 복사 단추로 보여요.</p>
      {/* 처음 받은 값이 늦게 오면 칸을 그 값으로 새로 시작한다 */}
      <PayForm key={s.pay ? 'got' : 'none'} />
    </section>
  );
}
