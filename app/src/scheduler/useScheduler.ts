import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fmt, pairKey, parseClock, parseSessions, search, sessionsToText,
  type SearchOutcome, type SearchResultRow, type SearchTheme, type Session, type SortDef,
} from '../core';
import { restore, serialize, type OptionsState, type TeamState } from '../serialize';
import { blankTheme, type Theme } from './types';
import { OcrError, recognizeSessions } from '../ocr';

export const SHOW = 12;
const AUTOSAVE_KEY = 'resched.laststate';

const DEFAULT_OPTIONS: OptionsState = {
  oStart: '', oEnd: '', oMinGap: '10', oMaxGap: '',
  oPartial: false, oMeal: false, oMealFrom: '11:30', oMealTo: '14:00', oMealMin: '40',
  oMove: '10', oTeam: false,
};

/* 어떤 테마들로 이루어진 조합인지를 나타내는 키. 부분 조합을 묶어 보여줄 때 쓴다.
   index.html의 setKey/setLabel. */
const setKey = (r: SearchResultRow) => r.steps.map(s => s.i).sort((a, b) => a - b).join(',');

export function useScheduler() {
  const nextId = useRef(1);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [moveMap, setMoveMap] = useState<Record<string, number>>({});
  const [options, setOptions] = useState<OptionsState>(DEFAULT_OPTIONS);
  const [sortKey, setSortKey] = useState('gap');

  const [themesReady, setThemesReady] = useState<SearchTheme[]>([]);
  const [found, setFound] = useState<SearchResultRow[]>([]);
  const [searchCapped, setSearchCapped] = useState(false);
  const [tabCount, setTabCount] = useState<number | null>(null);
  const [tabSet, setTabSet] = useState<string | null>(null);
  const [showCount, setShowCount] = useState(SHOW);
  const [teams, setTeams] = useState<TeamState[]>([]);
  const [runNote, setRunNote] = useState('');
  const lastSnapshot = useRef<string | null>(null);
  const restoredOnMount = useRef(false);

  const serializeNow = useCallback(() => serialize({
    themes: themes.map(t => ({ id: t.id, name: t.name, dur: t.dur, raw: t.raw, place: t.place, sessions: t.sessions, source: t.source })),
    moveMap, options, sortKey, teams, nextId: nextId.current,
  }), [themes, moveMap, options, sortKey, teams]);

  const hydrate = useCallback((hash: string) => {
    const state = restore(hash);
    setThemes(state.themes.map(t => ({
      ...blankTheme(t.id, t.name),
      dur: t.dur, raw: t.raw, place: t.place, sessions: t.sessions, source: t.source,
    })));
    nextId.current = state.nextId;
    setMoveMap(state.moveMap);
    setOptions(state.options);
    setSortKey(state.sortKey);
    setTeams(state.teams);
  }, []);

  /* 공유 링크(#s=) 우선, 없으면 자동저장(localStorage) — index.html의 init 순서와 동일 (§4.16/§4.26) */
  useEffect(() => {
    if (restoredOnMount.current) return;
    restoredOnMount.current = true;
    if (location.hash.startsWith('#s=')) {
      try { hydrate(location.hash.slice(3)); }
      catch (err) { console.warn('링크 복원 실패:', (err as Error).message); }
    } else {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        try { hydrate(saved); }
        catch (err) { console.warn('저장된 상태 복원 실패:', (err as Error).message); }
      }
    }
  }, [hydrate]);

  /* 400ms 디바운스 자동저장 — index.html의 scheduleAutosave(), 위임 리스너 대신
     상태 변화를 직접 의존성으로 건다(동등한 효과). */
  useEffect(() => {
    if (!restoredOnMount.current) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY, serializeNow()); } catch { /* 저장공간 꽉 참 등 */ }
    }, 400);
    return () => clearTimeout(t);
  }, [serializeNow]);

  const addTheme = useCallback(() => {
    setThemes(ts => [...ts, blankTheme(nextId.current++)]);
  }, []);

  const updateTheme = useCallback((id: number, patch: Partial<Theme>) => {
    setThemes(ts => ts.map(t => (t.id !== id ? t : { ...t, ...patch })));
  }, []);

  const updateRaw = useCallback((id: number, raw: string) => {
    setThemes(ts => ts.map(t => {
      if (t.id !== id) return t;
      const source = t.source.startsWith('image') ? 'image-edited'
        : t.source.startsWith('server') ? 'server-edited' : 'manual';
      return { ...t, raw, sessions: parseSessions(raw), source, err: '' };
    }));
  }, []);

  const deleteTheme = useCallback((id: number) => {
    setThemes(ts => ts.filter(t => t.id !== id));
  }, []);

  /* index.html의 ocr(file, th) 이식 — 한 파일 처리 끝. 진행 표시는 즉시(setThemes),
     결과 병합은 성공/실패 각각 한 번씩. 워커가 하나뿐이라 여러 장은 attachImages에서
     차례로(await) 돌린다 — 동시에 돌리면 서로의 진행 표시를 덮어쓴다. */
  const processImage = useCallback(async (id: number, file: File) => {
    setThemes(ts => ts.map(t => (t.id === id ? { ...t, err: '', busy: '엔진 준비 중…' } : t)));
    const t0 = performance.now();
    try {
      const sessions = await recognizeSessions(file, s => {
        setThemes(ts => ts.map(t => (t.id === id ? { ...t, busy: s } : t)));
      });
      setThemes(ts => ts.map(t => {
        if (t.id !== id) return t;
        /* 시간표가 길어 캡처를 나눠 넣는 경우 — 있던 세션에 이번 세션을 절대시각으로 합친다.
           같은 시각이 겹치면 매진 여부만 OR로 합친다 (index.html §4.20 후기). */
        const merged = new Map<number, Session>();
        for (const s of t.sessions) merged.set(s.t, s);
        for (const s of sessions) {
          const prev = merged.get(s.t);
          merged.set(s.t, prev ? { ...s, soldout: prev.soldout || s.soldout } : s);
        }
        const hadRaw = t.raw.trim().length > 0;
        const newSessions = [...merged.values()].sort((a, b) => a.t - b.t);
        const source = (hadRaw && t.source !== 'image' && t.source !== 'image-edited') ? 'image-edited' : 'image';
        return {
          ...t,
          sessions: newSessions, raw: sessionsToText(newSessions),
          imgCount: hadRaw ? (t.imgCount || 0) + 1 : 1,
          source, busy: '',
        };
      }));
    } catch (err) {
      const e = err as OcrError;
      const sec = Math.round((performance.now() - t0) / 1000);
      const msg = '읽기 실패 — 시간을 직접 입력해 주세요. (' + e.message + (e.dim ? ' · ' + e.dim : '') + ' · ' + sec + '초)';
      setThemes(ts => ts.map(t => (t.id === id ? { ...t, err: msg, busy: '' } : t)));
    }
  }, []);

  /* "이어 붙이기"를 껐으면 새 배치를 시작하기 전에 지운다 — 한 번에 여러 장을 고른
     경우 그 장들끼리는 여전히 합쳐진다(덮어쓰는 대상은 "이전에 있던 값"이지
     "이번에 고른 여러 장"이 아니다). index.html의 clearIfOverwrite. */
  const attachImages = useCallback(async (id: number, files: File[]) => {
    if (!files.length) return;
    setThemes(ts => ts.map(t => (
      t.id === id && t.mergeMode === false
        ? { ...t, raw: '', sessions: [], imgCount: 0, source: '' }
        : t
    )));
    for (const file of files) await processImage(id, file);
  }, [processImage]);

  const reorderTheme = useCallback((from: number, to: number) => {
    if (from === to) return;
    setThemes(ts => {
      const next = [...ts];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const placeList = useMemo(
    () => [...new Set(themes.map(t => (t.place || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [themes],
  );

  const setMoveMapValue = useCallback((a: string, b: string, v: number) => {
    setMoveMap(m => ({ ...m, [pairKey(a, b)]: Math.max(0, v) }));
  }, []);

  const setOption = useCallback(<K extends keyof OptionsState>(key: K, value: OptionsState[K]) => {
    setOptions(o => ({ ...o, [key]: value }));
  }, []);

  /* teamsOverride: 팀 확정/취소/초기화 직후 곧바로 다음 팀 후보를 계산할 때 쓴다.
     setTeams()는 비동기라 그 직후 이 함수를 부르면 클로저 안의 teams가 아직
     옛 값이므로, 방금 계산한 새 teams를 직접 넘겨받는다 — go 버튼(teamsOverride
     생략, 현재 teams 사용)과 팀 액션이 같은 함수를 타되 어긋나지 않게 한다. */
  const runSearch = useCallback((teamsOverride?: TeamState[]) => {
    const activeTeams = teamsOverride ?? teams;
    const ready: SearchTheme[] = themes
      .filter(t => t.sessions.length && t.dur > 0)
      .map((t, i) => ({ id: t.id, name: t.name || ('테마 ' + (i + 1)), dur: t.dur, sessions: t.sessions, place: t.place || '' }));
    setThemesReady(ready);

    if (ready.length < 2) {
      setRunNote('회차가 있는 테마가 2개 이상 필요합니다.');
      setFound([]); setShowCount(SHOW);
      return;
    }

    const startMin = parseClock(options.oStart);
    const endMax = parseClock(options.oEnd);
    const minGap = parseInt(options.oMinGap) || 0;
    const maxGap = options.oMaxGap.trim() === '' ? null : (parseInt(options.oMaxGap) || null);
    const moveMin = parseInt(options.oMove) || 0;
    let meal: { from: number; to: number; min: number } | null = null;
    if (options.oMeal) {
      const from = parseClock(options.oMealFrom), to = parseClock(options.oMealTo);
      const min = parseInt(options.oMealMin) || 0;
      if (from != null && to != null && min > 0) meal = { from, to, min };
    }
    const taken = options.oTeam && activeTeams.length
      ? new Set(activeTeams.flatMap(tm => tm.steps.map(s => s.id + '|' + s.t)))
      : null;

    if (meal && maxGap != null && maxGap < meal.min) {
      setRunNote(`최대 공백(${maxGap}분)이 식사 공백(${meal.min}분)보다 작아 조합이 나올 수 없습니다.`);
      setFound([]); setShowCount(SHOW);
      return;
    }

    lastSnapshot.current = serializeNow();
    const t0 = performance.now();
    const partial = options.oPartial;
    const { out, capped }: SearchOutcome = search(ready, {
      startMin, endMax, minGap, maxGap, moveMin, moveMap,
      excludeSoldout: true, minCount: partial ? 2 : ready.length, meal, taken,
    });
    setFound(out); setSearchCapped(capped);
    setTabCount(null); setTabSet(null); setShowCount(SHOW);
    setRunNote(`${Math.round(performance.now() - t0)}ms`);
  }, [themes, options, moveMap, teams, serializeNow]);

  const confirmTeam = useCallback((r: SearchResultRow) => {
    const next = [...teams, {
      name: `팀 ${teams.length + 1}`,
      steps: r.steps.map(s => ({ id: themesReady[s.i].id!, name: s.name, t: s.start })),
      start: r.start, end: r.end,
    }];
    setTeams(next);
    runSearch(next);
  }, [teams, themesReady, runSearch]);

  const undoTeam = useCallback(() => {
    const next = teams.slice(0, -1);
    setTeams(next);
    runSearch(next);
  }, [teams, runSearch]);

  const resetTeams = useCallback(() => {
    setTeams([]);
    runSearch([]);
  }, [runSearch]);

  const currentList = useMemo(() => {
    let list = found;
    if (tabCount != null) list = list.filter(r => r.count === tabCount);
    if (tabSet != null) list = list.filter(r => setKey(r) === tabSet);
    return list;
  }, [found, tabCount, tabSet]);

  const selectTab = useCallback((count: number) => {
    setTabCount(count); setTabSet(null); setShowCount(SHOW);
  }, []);
  const selectTabSet = useCallback((key: string | null) => {
    setTabSet(key); setShowCount(SHOW);
  }, []);
  const selectSort = useCallback((k: string) => {
    setSortKey(k); setShowCount(SHOW);
  }, []);
  const showMore = useCallback(() => setShowCount(c => c + SHOW), []);

  const copyShareLink = useCallback(async () => {
    const url = location.origin + location.pathname + '#s=' + serializeNow();
    try {
      await navigator.clipboard.writeText(url);
      setRunNote('링크를 복사했습니다.');
      return true;
    } catch {
      location.hash = 's=' + serializeNow();
      setRunNote('복사가 막혀 주소창에 넣었습니다. 주소창 링크를 복사해 주세요.');
      return false;
    }
  }, [serializeNow]);

  return {
    themes, addTheme, updateTheme, updateRaw, deleteTheme, reorderTheme, attachImages,
    moveMap, placeList, setMoveMapValue,
    options, setOption,
    sortKey, selectSort,
    themesReady, found, searchCapped, runSearch, runNote,
    tabCount, tabSet, selectTab, selectTabSet,
    showCount, showMore,
    teams, confirmTeam, undoTeam, resetTeams,
    currentList,
    copyShareLink,
    lastSnapshot,
  };
}

export type Scheduler = ReturnType<typeof useScheduler>;
export type { SortDef };
export { fmt };
