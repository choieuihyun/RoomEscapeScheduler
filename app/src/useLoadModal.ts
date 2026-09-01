import { useCallback, useState } from 'react';
import type { Session } from './core';
import {
  ago, branches as fetchBranches, say, schedule as fetchSchedule, toSessions,
  type Branch, type ServerTheme,
} from './server';

/* F-15 "회차 불러오기" 모달의 상태. index.html의 openLoad/ldFetch/ldFillDates/
   ldAddPicked 이식 — 전역 변수(ldBranches/ldThemes/ldPick 등) 대신 훅 상태로.

   지점을 바꿔도 이미 고른 테마가 안 사라진다 — 매장 A·B·C에서 하나씩 고르는
   실제 쓰임을 처음엔 놓쳤다(사용자가 발견). 고르는 걸 "지금 보이는 목록의
   인덱스"가 아니라 "지점+날짜+테마 id" 조합으로 기억해야 지점을 넘나들어도
   유지된다 — 테마 자체에 서버가 이미 안정적인 id를 주는데(예:
   "bitphobia-dungeon101:1") 이전엔 안 쓰고 있었다. */

function pickKey(branchId: string, date: string, themeId: string): string {
  return `${branchId}::${date}::${themeId}`;
}

/* 오늘/내일을 글자로 밝힌다 — 날짜만 있으면 어느 게 오늘인지 매번 세어 봐야 한다 */
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  const w = '일월화수목금토'[dt.getDay()];
  return `${m}/${d}(${w})` + (diff === 0 ? ' 오늘' : diff === 1 ? ' 내일' : '');
}

/* 난이도는 0.5 단위로 온다. '★'.repeat(2.5)는 소수를 버려서 2.5를 ★★로 만든다 —
   반 칸을 ½로 남겨 둔다. */
function stars(d?: number): string | null {
  if (typeof d !== 'number' || !isFinite(d) || d <= 0) return null;
  const n = Math.min(d, 5);
  return '★'.repeat(Math.floor(n)) + (n % 1 >= 0.5 ? '½' : '');
}

export interface AddedTheme {
  name: string;
  place: string;
  dur: number;
  sessions: Session[];
  fresh: string;
}

interface PickedEntry {
  key: string;
  branchLabel: string;
  date: string;
  theme: ServerTheme;
  fresh: string;
}

export function useLoadModal(onAdd: (items: AddedTheme[]) => void) {
  const [open, setOpen] = useState(false);
  const [listMsg, setListMsg] = useState('');
  const [err, setErr] = useState('');
  const [branchList, setBranchList] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [people, setPeople] = useState('');
  const [themes, setThemes] = useState<ServerTheme[]>([]);
  const [fresh, setFresh] = useState('');
  const [pickedItems, setPickedItems] = useState<Map<string, PickedEntry>>(new Map());

  const branchLabel = useCallback((bId: string) => {
    const b = branchList.find(x => x.id === bId);
    return b ? (b.store ? b.store + ' ' + b.branch : b.branch) : bId;
  }, [branchList]);

  const fetchForBranchDate = useCallback(async (bId: string, d: string) => {
    setErr(''); setFresh('');
    setListMsg('회차를 불러오는 중…');
    try {
      const data = await fetchSchedule(bId, d);
      setThemes(data.themes || []);
      setFresh(ago(data.checkedAt));
      setListMsg('');
    } catch (e) {
      setThemes([]);
      setListMsg('회차를 받지 못했습니다.');
      setErr(say(e));
    }
  }, []);

  const openModal = useCallback(async () => {
    setOpen(true);
    setErr(''); setFresh(''); setPickedItems(new Map());
    setListMsg('지점을 불러오는 중…');
    let list: Branch[];
    try {
      list = (await fetchBranches()).filter(b => b.dates && b.dates.length);
    } catch (e) {
      setListMsg('지점 목록을 받지 못했습니다.');
      setErr(say(e));
      return;
    }
    if (!list.length) {
      setListMsg('아직 수집된 지점이 없습니다.\n서버가 한 바퀴 돈 뒤에 다시 열어 주세요.');
      return;
    }
    setBranchList(list);
    const first = list[0];
    setBranchId(first.id);
    setDates(first.dates);
    setDate(first.dates[0]);
    await fetchForBranchDate(first.id, first.dates[0]);
  }, [fetchForBranchDate]);

  /* 지점·날짜를 바꿔도 pickedItems는 건드리지 않는다 — 다른 지점에서 고른
     테마가 여기서 사라지면 안 된다. */
  const changeBranch = useCallback(async (bId: string) => {
    setBranchId(bId);
    const b = branchList.find(x => x.id === bId) || branchList[0];
    setDates(b.dates);
    setDate(b.dates[0]);
    await fetchForBranchDate(bId, b.dates[0]);
  }, [branchList, fetchForBranchDate]);

  const changeDate = useCallback(async (d: string) => {
    setDate(d);
    await fetchForBranchDate(branchId, d);
  }, [branchId, fetchForBranchDate]);

  const togglePick = useCallback((i: number, checked: boolean) => {
    const theme = themes[i];
    if (!theme) return;
    const key = pickKey(branchId, date, theme.id);
    setPickedItems(m => {
      const next = new Map(m);
      if (checked) next.set(key, { key, branchLabel: branchLabel(branchId), date, theme, fresh });
      else next.delete(key);
      return next;
    });
  }, [themes, branchId, date, fresh, branchLabel]);

  const removePicked = useCallback((key: string) => {
    setPickedItems(m => { const n = new Map(m); n.delete(key); return n; });
  }, []);

  const isPicked = useCallback((i: number) => {
    const theme = themes[i];
    return !!theme && pickedItems.has(pickKey(branchId, date, theme.id));
  }, [themes, branchId, date, pickedItems]);

  const close = useCallback(() => setOpen(false), []);

  const addPicked = useCallback(() => {
    const items: AddedTheme[] = [...pickedItems.values()].map(p => ({
      name: p.theme.name, place: p.theme.place || '', dur: p.theme.dur || 70,
      sessions: toSessions(p.theme.sessions), fresh: p.fresh,
    }));
    onAdd(items);
    setPickedItems(new Map());
    setOpen(false);
  }, [pickedItems, onAdd]);

  return {
    open, listMsg, err, branchList, branchId, dates, date, people, themes, fresh,
    pickedItems, isPicked,
    setPeople, openModal, changeBranch, changeDate, togglePick, removePicked, close, addPicked, dateLabel, stars,
  };
}

export type LoadModalState = ReturnType<typeof useLoadModal>;
