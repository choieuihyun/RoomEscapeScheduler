/* 정산(작업명세서 §4.13) — 화면 규칙을 순수 함수로. 송금 계산은 서버가 한다(앱은 받은 transfers 를 그린다).
   지연 모듈(clubStore)을 거쳐 일정 상세·홈만 쓴다. */
import { cpLen, eventTitle, weekday } from './clubEvents';
import { WEEKDAYS } from './core';
import type { EventDto, SettlementDto, SettlementItemDto, SettlementItemInput, TransferDto, Who } from './server';

export const MAX_ITEMS = 30;
export const MAX_SHARES = 30;
export const MAX_AMOUNT = 10_000_000;
export const LABEL_MAX = 20;
/* 자주 쓰는 이름 — 방탈출 하고 밥도 먹고 커피도 마신다(사용자 말) */
export const LABELS = ['방탈출', '저녁', '카페', '택시', '기타'] as const;

/* 132000 → "132,000" */
export const commas = (n: number): string => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const won = (n: number): string => `${commas(n)}원`;

/* 금액 칸 — 숫자만 남긴다(쉼표·원·공백 무시). 비면 null. 너무 길면 앞 8자리까지 */
export function parseWon(s: string): number | null {
  const d = s.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 8);
  return d ? Number(d) : null;
}

type Share = { uid: string; amount: number };

/* 똑같이 나누기 — 1인 = 10원 단위 내림, 남는 돈은 결제한 사람이 같이 낸 사람이면 그 사람, 아니면 첫 사람 몫에(§4.13) */
export function splitEven(amount: number, uids: string[], payerUid: string): Share[] {
  if (uids.length === 0) return [];
  const per = Math.floor(amount / uids.length / 10) * 10;
  const rest = amount - per * uids.length;
  const who = uids.includes(payerUid) ? payerUid : uids[0];
  return uids.map((uid) => ({ uid, amount: per + (uid === who ? rest : 0) }));
}

/* 1인 금액(10원 단위 내림) */
export const perHead = (amount: number, n: number): number => (n > 0 ? Math.floor(amount / n / 10) * 10 : 0);

/* 똑같이 나눈 그대로인가("조정됨"은 저장하지 않고 이것으로 안다). 서버가 shares 순서를 바꿔 돌려줘도 같은 답이 나오게
   순서와 상관없이 본다 — 모두 1인 금액이고, 남는 돈이 있으면 한 사람(결제한 사람이 들어 있으면 그 사람)만 그만큼 더 */
export function isEven(amount: number, shares: Share[], payerUid: string): boolean {
  const n = shares.length;
  if (n === 0) return true;
  const per = perHead(amount, n), rest = amount - per * n;
  const big = shares.filter((s) => s.amount !== per);
  if (rest === 0) return big.length === 0;
  if (big.length !== 1 || big[0].amount !== per + rest) return false;
  return !shares.some((s) => s.uid === payerUid) || big[0].uid === payerUid;
}

export const sumOf = (shares: Share[]): number => shares.reduce((a, s) => a + s.amount, 0);

/* 사람별 금액 합이 금액과 다르면 안내(저장 막기). 같으면 '' */
export function gapText(amount: number, shares: Share[]): string {
  const d = amount - sumOf(shares);
  if (d === 0) return '';
  return d > 0 ? `합이 ${won(d)} 모자라요` : `합이 ${won(-d)} 남아요`;
}

/* 항목 카드 아래 줄 — "방탈출러버 결제 · 5명 · 1인 26,400원", 고친 것이면 "… · 조정됨" */
export function itemLine(it: SettlementItemDto): string {
  const n = it.shares.length;
  const head = `${it.payer.nickname} 결제 · ${n}명`;
  return isEven(it.amount, it.shares, it.payer.uid) ? `${head} · 1인 ${won(perHead(it.amount, n))}` : `${head} · 조정됨`;
}

/* 받은 항목 → PUT 에 실을 모양 */
export const toInputs = (items: SettlementItemDto[]): SettlementItemInput[] =>
  items.map((it) => ({ label: it.label, amount: it.amount, payerUid: it.payer.uid, shares: it.shares.map((s) => ({ uid: s.uid, amount: s.amount })) }));

/* 고를 수 있는 사람 — 지금 참여자(참여 순) + 저장된 항목에만 나오는 사람(참여를 뺀 사람, 닉네임은 정산에 실린 것).
   gone: 지금은 참여하지 않는 사람 */
export function settlePeople(ev: Pick<EventDto, 'participants'>, dto: Pick<SettlementDto, 'items'> | null): (Who & { gone: boolean })[] {
  const out: (Who & { gone: boolean })[] = ev.participants.map((p) => ({ uid: p.uid, nickname: p.nickname, gone: false }));
  const seen = new Set(out.map((p) => p.uid));
  for (const it of dto?.items ?? []) {
    for (const w of [it.payer, ...it.shares]) {
      if (seen.has(w.uid)) continue;
      seen.add(w.uid);
      out.push({ uid: w.uid, nickname: w.nickname, gone: true });
    }
  }
  return out;
}

/* 정산에 든 사람 수(항목마다 같이 낸 사람을 합쳐 한 번씩) */
export const headCount = (dto: Pick<SettlementDto, 'items'>): number => new Set(dto.items.flatMap((it) => it.shares.map((s) => s.uid))).size;

export const progress = (dto: Pick<SettlementDto, 'transfers'>): { paid: number; total: number } =>
  ({ paid: dto.transfers.filter((t) => t.paid).length, total: dto.transfers.length });

/* 보낼 돈 순서 — 내가 보낼 줄 먼저, 그다음 내가 받을 줄, 나머지는 서버 순서 그대로 */
export function orderTransfers(ts: TransferDto[], meUid: string): TransferDto[] {
  const rank = (t: TransferDto) => (t.from.uid === meUid ? 0 : t.to.uid === meUid ? 1 : 2);
  return ts.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

/* "보냈어요"를 누를 수 있나 — 보내는 사람·받는 사람, 운영진·만든 사람(canManage) */
export const canMark = (t: TransferDto, meUid: string, canManage: boolean): boolean =>
  canManage || t.from.uid === meUid || t.to.uid === meUid;

/* 내가 아직 안 보낸 돈 */
export const myDue = (dto: Pick<SettlementDto, 'transfers'> | null | undefined, meUid: string): number =>
  (dto?.transfers ?? []).filter((t) => t.from.uid === meUid && !t.paid).reduce((a, t) => a + t.amount, 0);

/* 받을 돈이 있는데 내 송금 정보가 비었나 — "송금 정보를 넣어 두면 계좌 복사가 돼요" */
export function payInfoMissing(dto: Pick<SettlementDto, 'transfers' | 'payInfo'>, meUid: string): boolean {
  if (!dto.transfers.some((t) => t.to.uid === meUid)) return false;
  const p = dto.payInfo[meUid];
  return !p || (!p.bankText && !p.kakaopayUrl);
}

/* "10/24(금)" */
export const shortDay = (iso: string): string => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}(${WEEKDAYS[weekday(iso)]})`;

/* 텍스트로 뽑기 — 카톡에 붙일 요약. 날짜 미정 일정은 날짜 없이 */
export function settleText(ev: Pick<EventDto, 'title' | 'segments' | 'date'>, dto: SettlementDto): string {
  const lines = [`[정산] ${ev.date ? shortDay(ev.date) + ' ' : ''}${eventTitle(ev)}`];
  for (const it of dto.items) {
    lines.push(`${it.label} ${won(it.amount)} · ${it.payer.nickname} 결제 · ${it.shares.length}명${isEven(it.amount, it.shares, it.payer.uid) ? '' : ' (조정됨)'}`);
  }
  lines.push(`모두 ${won(dto.total)}`);
  lines.push('', '보낼 돈');
  if (dto.transfers.length === 0) lines.push('보낼 돈이 없어요.');
  for (const t of dto.transfers) lines.push(`${t.from.nickname} → ${t.to.nickname} ${won(t.amount)}${t.paid ? ' (보냄)' : ''}`);
  /* 받는 사람 계좌 — 받는 사람마다 한 번, 넣어 둔 것만 */
  const acct: string[] = [];
  const seen = new Set<string>();
  for (const t of dto.transfers) {
    if (seen.has(t.to.uid)) continue;
    seen.add(t.to.uid);
    const p = dto.payInfo[t.to.uid];
    if (p?.bankText) acct.push(`${t.to.nickname}: ${p.bankText}`);
    if (p?.kakaopayUrl) acct.push(`${t.to.nickname} 카카오페이: ${p.kakaopayUrl}`);
  }
  if (acct.length) lines.push('', '받는 사람 계좌', ...acct);
  return lines.join('\n');
}

/* ── 항목 고치기 창 ── */
export interface ItemDraft {
  label: string;
  amount: number | null;
  payerUid: string;
  /* 같이 낸 사람(고를 수 있는 사람 순서) */
  sharers: string[];
  /* 사람별로 고친 금액 — null 이면 똑같이 나눈다 */
  custom: Record<string, number> | null;
}

export function draftFrom(it: SettlementItemDto | null, people: (Who & { gone?: boolean })[], meUid: string, firstItem: boolean): ItemDraft {
  if (it) {
    const order = people.map((p) => p.uid).filter((u) => it.shares.some((s) => s.uid === u));
    const even = isEven(it.amount, it.shares, it.payer.uid);
    return {
      label: it.label, amount: it.amount, payerUid: it.payer.uid, sharers: order,
      custom: even ? null : Object.fromEntries(it.shares.map((s) => [s.uid, s.amount])),
    };
  }
  const now = people.filter((p) => !p.gone);
  return {
    label: firstItem ? '방탈출' : '', amount: null,
    payerUid: now.some((p) => p.uid === meUid) ? meUid : now[0]?.uid ?? '',
    sharers: now.map((p) => p.uid), custom: null,
  };
}

/* 지금 보일 사람별 금액 — 고친 값이 있으면 그것, 없으면 똑같이 */
export function draftShares(d: ItemDraft): Share[] {
  if (d.custom) return d.sharers.map((uid) => ({ uid, amount: d.custom?.[uid] ?? 0 }));
  return splitEven(d.amount ?? 0, d.sharers, d.payerUid);
}

/* 저장 전 검사 — 문구가 있으면 저장을 막는다 */
export function draftIssue(d: ItemDraft): string {
  const label = d.label.trim();
  if (!label) return '항목 이름을 적어 주세요.';
  if (cpLen(label) > LABEL_MAX) return `항목 이름은 ${LABEL_MAX}자까지예요.`;
  if (!d.amount) return '금액을 적어 주세요.';
  if (d.amount > MAX_AMOUNT) return `금액은 ${won(MAX_AMOUNT)}까지예요.`;
  if (!d.payerUid) return '결제한 사람을 골라 주세요.';
  if (d.sharers.length === 0) return '같이 낸 사람을 한 명 이상 골라 주세요.';
  if (d.sharers.length > MAX_SHARES) return `같이 낸 사람은 ${MAX_SHARES}명까지예요.`;
  return gapText(d.amount, draftShares(d));
}

export const draftInput = (d: ItemDraft): SettlementItemInput =>
  ({ label: d.label.trim(), amount: d.amount ?? 0, payerUid: d.payerUid, shares: draftShares(d) });

/* 항목 하나를 바꾼(at = null 이면 끝에 더한, item = null 이면 지운) 전체 목록 */
export function withItem(items: SettlementItemDto[], at: number | null, item: SettlementItemInput | null): SettlementItemInput[] {
  const list = toInputs(items);
  if (at === null) return item ? [...list, item] : list;
  return item ? list.map((x, i) => (i === at ? item : x)) : list.filter((_, i) => i !== at);
}

/* 카카오페이 송금 링크 검사(§4.13) — 비면 통과 */
export const KAKAO_PREFIX = 'https://qr.kakaopay.com/';
export function payIssue(bankText: string, kakaopayUrl: string): string {
  if (cpLen(bankText.trim()) > 60) return '계좌 글은 60자까지 적을 수 있어요.';
  const u = kakaopayUrl.trim();
  if (u && (!u.startsWith(KAKAO_PREFIX) || u.length <= KAKAO_PREFIX.length || /\s/.test(u))) return `카카오페이 링크는 ${KAKAO_PREFIX} 으로 시작하는 주소만 넣을 수 있어요.`;
  if (u.length > 200) return '카카오페이 링크가 너무 길어요(200자까지).';
  return '';
}
