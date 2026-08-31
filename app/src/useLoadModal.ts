import { useCallback, useState } from 'react';
import type { Session } from './core';
import {
  ago, branches as fetchBranches, say, schedule as fetchSchedule, toSessions,
  type Branch, type ServerTheme,
} from './server';

/* F-15 "회차 불러오기" 모달의 상태. index.html의 openLoad/ldFetch/ldFillDates/
   ldAddPicked 이식 — 전역 변수(ldBranches/ldThemes/ldPick 등) 대신 훅 상태로. */

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
}

export function useLoadModal(onAdd: (items: AddedTheme[], fresh: string) => void) {
  const [open, setOpen] = useState(false);
  const [listMsg, setListMsg] = useState('');
  const [err, setErr] = useState('');
  const [branchList, setBranchList] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [people, setPeople] = useState('');
  const [themes, setThemes] = useState<ServerTheme[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [fresh, setFresh] = useState('');

  const fetchForBranchDate = useCallback(async (bId: string, d: string) => {
    setPicked(new Set());
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
    setErr(''); setFresh(''); setPicked(new Set());
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
    setPicked(p => {
      const next = new Set(p);
      if (checked) next.add(i); else next.delete(i);
      return next;
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const addPicked = useCallback(() => {
    const items: AddedTheme[] = [...picked].sort((a, b) => a - b).map(i => themes[i]).map(t => ({
      name: t.name, place: t.place || '', dur: t.dur || 70, sessions: toSessions(t.sessions),
    }));
    onAdd(items, fresh);
    setOpen(false);
  }, [picked, themes, fresh, onAdd]);

  return {
    open, listMsg, err, branchList, branchId, dates, date, people, themes, picked, fresh,
    setPeople, openModal, changeBranch, changeDate, togglePick, close, addPicked, dateLabel, stars,
  };
}

export type LoadModalState = ReturnType<typeof useLoadModal>;
