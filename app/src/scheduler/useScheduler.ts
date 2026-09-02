import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fmt, pairKey, parseClock, parseSessions, search, sessionsToText,
  type SearchOutcome, type SearchResultRow, type SearchTheme, type Session, type SortDef,
} from '../core';
import {
  inflateShare, readShareHash, restore, serialize, shareHash,
  type AppState, type OptionsState, type TeamState,
} from '../serialize';
import { blankTheme, type Theme } from './types';
import { OcrError, recognizeSessions } from '../ocr';

export const SHOW = 12;
const AUTOSAVE_KEY = 'resched.laststate';

const DEFAULT_OPTIONS: OptionsState = {
  oStart: '', oEnd: '', oMinGap: '10', oMaxGap: '',
  oPartial: false, oMeal: false, oMealFrom: '11:30', oMealTo: '14:00', oMealMin: '40',
  oMove: '10', oTeam: false, oIncludeSoldout: false,
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
  /* restoredOnMount 와 나눠 둔 이유: 그건 "이 effect 가 이미 돌았나"(중복 실행 방지)
     이고, 이건 "복원이 실제로 끝났나"(자동저장 개폐)다. #z= 복원이 async 가 되면서
     둘이 갈렸다 — 예전처럼 하나로 쓰면 ref 가 먼저 켜져 400ms 디바운스가 **빈
     상태를 받는 사람 자동저장 위에 덮어쓴다.** */
  const hydrated = useRef(false);

  /* serializeNow 에서 상태 조립만 떼어냈다 — 공유 링크(#z=)는 base64 문자열이
     아니라 AppState 를 받아야 압축할 수 있기 때문. 조립 규칙이 두 벌이 되면
     둘이 어긋나므로 한 곳에 둔다. */
  const stateNow = useCallback((): AppState => ({
    themes: themes.map(t => ({ id: t.id, name: t.name, dur: t.dur, raw: t.raw, place: t.place, sessions: t.sessions, source: t.source, date: t.date })),
    moveMap, options, sortKey, teams, nextId: nextId.current,
  }), [themes, moveMap, options, sortKey, teams]);

  const serializeNow = useCallback(() => serialize(stateNow()), [stateNow]);

  const hydrate = useCallback((hash: string) => {
    const state = restore(hash);
    setThemes(state.themes.map(t => ({
      ...blankTheme(t.id, t.name),
      dur: t.dur, raw: t.raw, place: t.place, sessions: t.sessions, source: t.source, date: t.date,
    })));
    nextId.current = state.nextId;
    setMoveMap(state.moveMap);
    setOptions(state.options);
    setSortKey(state.sortKey);
    setTeams(state.teams);
  }, []);

  /* F-12 "내 일정"에서 저장된 snapshot을 불러온다. index.html의 plan-load 핸들러(불러오기
     버튼) 이식 — 옛 결과 카드를 남겨두면 그 "저장" 버튼이 이전 계산을 붙든 채 저장되므로
     found/themesReady/lastSnapshot을 전부 비운다 (작업명세서 §7.1). */
  const loadSnapshot = useCallback((snapshot: string, date: string) => {
    try {
      hydrate(snapshot);
      setFound([]); setThemesReady([]); lastSnapshot.current = null;
      setTabCount(null); setTabSet(null); setShowCount(SHOW);
      setRunNote(`${date} 일정의 입력값을 불러왔습니다. 계산을 누르면 다시 짤 수 있습니다.`);
      return true;
    } catch {
      setRunNote('이 일정은 불러올 수 없는 형식입니다.');
      return false;
    }
  }, [hydrate]);

  /* 공유 링크 우선, 없으면 자동저장(localStorage) — index.html의 init 순서와 동일
     (§4.16/§4.26). 읽는 형식은 두 가지다: #s=(그대로) · #z=(deflate, serialize.ts).

     **`#` 에 페이로드가 실려 있으면 그건 공유 링크다 — 우리가 읽을 수 있든 없든.**
     예전엔 `#s=` 로 시작하지 않으면 곧장 else 로 떨어져 **받는 사람 자신의
     자동저장**을 복원했다. 에러도 안내도 없이 화면이 멀쩡히 채워지니, 공유받은
     게 아니라는 걸 알 방법이 없었다 — "조회 실패와 결과 없음을 같은 값으로 두지
     않는다" 가 프론트에서 깨지던 자리다. 옛 번들을 캐시한 사람이 #z= 를 받는
     경우가 정확히 이 상황이라, **쓰기를 켜기 전에 이 가드가 먼저 퍼져 있어야
     한다.** 지금은 못 읽으면 말하고, 자동저장은 (지우지 않고) 대신 띄운다. */
  useEffect(() => {
    if (restoredOnMount.current) return;
    restoredOnMount.current = true;

    /* 복원했으면 true. 실패 안내 문구가 "마지막 작업 상태를 띄워 뒀다"고 말하려면
       실제로 띄웠는지를 알아야 한다 — 자동저장이 없는 첫 방문자에게 그 문장은
       거짓말이고, 안내를 못 믿게 만든다. */
    const fromAutosave = () => {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) return false;
      try { hydrate(saved); return true; }
      catch (err) { console.warn('저장된 상태 복원 실패:', (err as Error).message); return false; }
    };

    const share = readShareHash(location.hash);
    if (share.kind === 'none') { fromAutosave(); hydrated.current = true; return; }

    (async () => {
      try {
        if (share.kind === 'plain') hydrate(share.payload);
        else if (share.kind === 'packed') hydrate(await inflateShare(share.payload));
        else throw new Error(`알 수 없는 링크 형식(#${share.tag}=)`);
      } catch (err) {
        console.warn('링크 복원 실패:', (err as Error).message);
        const fellBack = fromAutosave();
        setRunNote(
          '이 공유 링크를 열지 못했습니다 — 링크가 중간에 잘렸거나, 이 브라우저가 아직 모르는 형식입니다. '
          + '새로고침해도 그대로면 링크를 다시 받아 주세요.'
          + (fellBack ? ' 우선 마지막 작업 상태를 띄워 뒀습니다.' : ''),
        );
      } finally {
        hydrated.current = true;
      }
    })();
  }, [hydrate]);

  /* 400ms 디바운스 자동저장 — index.html의 scheduleAutosave(), 위임 리스너 대신
     상태 변화를 직접 의존성으로 건다(동등한 효과). */
  useEffect(() => {
    if (!hydrated.current) return;   // 복원 전에는 안 쓴다 — 위 hydrated 주석 참고
    const t = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY, serializeNow()); } catch { /* 저장공간 꽉 참 등 */ }
    }, 400);
    return () => clearTimeout(t);
  }, [serializeNow]);

  const addTheme = useCallback(() => {
    setThemes(ts => [...ts, blankTheme(nextId.current++)]);
  }, []);

  /* F-15 "회차 불러오기"로 고른 항목들을 카드로 추가한다. index.html의 ldAddPicked() 이식.
     매진 회차도 그대로 담는다 — 계산에서 빼는 건 excludeSoldout이 이미 한다(기획 §4.30),
     카드에 남아야 "왜 이 시간대가 후보에 없지"가 조건 탓인지 매진 탓인지 갈린다.
     fresh는 항목마다 다르다 — 매장 A·B·C에서 하나씩 골랐다면 지점마다 서버가
     확인한 시각이 다르므로, 공통 값 하나로 뭉뚱그리지 않는다. */
  const addServerThemes = useCallback((
    items: { name: string; place: string; dur: number; sessions: Session[]; fresh: string; date?: string }[],
  ) => {
    setThemes(ts => [
      ...ts,
      ...items.map(it => {
        const sessions = it.sessions;
        return {
          ...blankTheme(nextId.current++, it.name),
          place: it.place, dur: it.dur || 70, sessions,
          raw: sessionsToText(sessions), source: 'server', fresh: it.fresh, date: it.date,
        };
      }),
    ]);
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
      excludeSoldout: !options.oIncludeSoldout, minCount: partial ? 2 : ready.length, meal, taken,
    });
    setFound(out); setSearchCapped(capped);
    setTabCount(null); setTabSet(null); setShowCount(SHOW);
    setRunNote(`${Math.round(performance.now() - t0)}ms`);
  }, [themes, options, moveMap, teams, serializeNow]);

  const confirmTeam = useCallback((r: SearchResultRow) => {
    const next = [...teams, {
      name: `${teams.length + 1} 팀`,
      steps: r.steps.map(s => ({ id: themesReady[s.i].id!, name: s.name, t: s.start })),
      start: r.start, end: r.end,
      row: r,
    }];
    setTeams(next);
    runSearch(next);
  }, [teams, themesReady, runSearch]);

  /* 순서 상관없이 아무 팀이나 지운다 — 뒤 팀들의 "N 팀" 표기는 배열 인덱스로
     다시 매기므로(TeamPanel.tsx) 여기서 이름을 새로 붙일 필요는 없다.
     남은 팀들의 taken 제외 대상은 이 지운 결과 그대로 다음 계산에 반영된다. */
  const removeTeam = useCallback((index: number) => {
    const next = teams.filter((_, i) => i !== index);
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

  /* 해시 형식은 shareHash() 가 정한다(#s= / #z=) — 여기서 형식을 다시 판단하면
     스위치가 두 곳이 된다. 클립보드가 막힌 경로도 **같은 해시**를 쓴다. */
  const copyShareLink = useCallback(async () => {
    const h = await shareHash(stateNow());
    const url = location.origin + location.pathname + '#' + h;
    try {
      await navigator.clipboard.writeText(url);
      setRunNote('링크를 복사했습니다.');
      return true;
    } catch {
      location.hash = h;
      setRunNote('복사가 막혀 주소창에 넣었습니다. 주소창 링크를 복사해 주세요.');
      return false;
    }
  }, [stateNow]);

  return {
    themes, addTheme, addServerThemes, updateTheme, updateRaw, deleteTheme, reorderTheme, attachImages,
    moveMap, placeList, setMoveMapValue,
    options, setOption,
    sortKey, selectSort,
    themesReady, found, searchCapped, runSearch, runNote,
    tabCount, tabSet, selectTab, selectTabSet,
    showCount, showMore,
    teams, confirmTeam, removeTeam, resetTeams,
    currentList,
    copyShareLink,
    lastSnapshot,
    loadSnapshot,
    serializeNow,
  };
}

export type Scheduler = ReturnType<typeof useScheduler>;
export type { SortDef };
export { fmt };
