/**
 * 계획서 "Step 1/3" 게이트: test/fixtures/legacy-links.json 에 박아 둔 실제 v1/v2/v3
 * 공유 링크 해시가 새 restore()에서도 (실측으로 검증해 둔) 같은 결과를 내는지 확인한다.
 * 이 테스트가 초록불이 아니면 직렬화 포맷이 깨진 것 — 사용자의 공유 링크·자동저장·
 * Firestore snapshot이 전부 이 포맷에 의존한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { restore, serialize, type AppState } from './serialize';

const fixturesPath = fileURLToPath(new URL('../../test/fixtures/legacy-links.json', import.meta.url));
const { fixtures } = JSON.parse(readFileSync(fixturesPath, 'utf8'));

describe('legacy-links 픽스처 왕복 (v1/v2/v3early/v3current)', () => {
  for (const fx of fixtures as any[]) {
    it(fx.label, () => {
      const state = restore(fx.hash);
      const exp = fx.expectedAfterRestore;

      expect(state.themes.map(t => t.name)).toEqual(exp.themeNames);
      expect(state.themes.map(t => t.place)).toEqual(exp.places);
      expect(state.options.oStart).toBe(exp.oStart);
      expect(state.options.oEnd).toBe(exp.oEnd);
      expect(state.options.oMinGap).toBe(exp.oMinGap);
      expect(state.options.oMove).toBe(exp.oMove);
      expect(state.sortKey).toBe(exp.sortKey);

      if (exp.themeIds) {
        expect(state.themes.map(t => t.id)).toEqual(exp.themeIds);
      }
      if (exp.oMaxGap !== undefined) expect(state.options.oMaxGap).toBe(exp.oMaxGap);
      if (exp.oPartial !== undefined) expect(state.options.oPartial).toBe(exp.oPartial);
      if (exp.oMeal !== undefined) expect(state.options.oMeal).toBe(exp.oMeal);
      if (exp.oMealFrom !== undefined) expect(state.options.oMealFrom).toBe(exp.oMealFrom);
      if (exp.oMealTo !== undefined) expect(state.options.oMealTo).toBe(exp.oMealTo);
      if (exp.oMealMin !== undefined) expect(state.options.oMealMin).toBe(exp.oMealMin);
      if (exp.oTeam !== undefined) expect(state.options.oTeam).toBe(exp.oTeam);

      if (exp.moveMapPairs) {
        for (const [a, b, v] of exp.moveMapPairs as [string, string, number][]) {
          // moveMap is keyed by pairKey(a,b) — re-derive via restore()'s own state, not by
          // reaching into internals: just check the pair resolved to the expected value.
          const key = Object.keys(state.moveMap).find(k => {
            const [x, y] = k.split('\u0000');
            return (x === a && y === b) || (x === b && y === a);
          });
          expect(key).toBeDefined();
          expect(state.moveMap[key!]).toBe(v);
        }
      } else {
        expect(Object.keys(state.moveMap)).toHaveLength(0);
      }

      if (exp.teams) {
        expect(state.teams).toHaveLength(exp.teams.length);
        exp.teams.forEach((t: any, i: number) => {
          expect(state.teams[i].name).toBe(t.name);
          expect(state.teams[i].start).toBe(t.start);
          expect(state.teams[i].end).toBe(t.end);
          expect(state.teams[i].steps).toHaveLength(t.stepCount);
        });
      } else {
        expect(state.teams).toHaveLength(0);
      }
    });
  }

  it('v1/v2/v3early(설명 없음, id 없음)는 기본 startId=1부터 순서대로 새 id를 받는다', () => {
    const v1 = fixtures.find((f: any) => f.version === 1);
    const state = restore(v1.hash);
    expect(state.themes.map(t => t.id)).toEqual([1, 2, 3]);
    expect(state.nextId).toBe(4);
  });
});

describe('restore() — mid-session id 충돌 방지 (index.html에서 실측 재현·수정한 버그의 회귀 테스트)', () => {
  it('startId를 넘기면 명시적 id가 없는 테마들이 거기서부터 이어진다', () => {
    const v1 = fixtures.find((f: any) => f.version === 1);
    const state = restore(v1.hash, 7);
    expect(state.themes.map(t => t.id)).toEqual([7, 8, 9]);
    expect(state.nextId).toBe(10);
  });

  it('명시적 id(v3current)가 있으면 startId를 무시하고 그 id를 그대로 쓴다 — 팀 배정이 가리키는 게 이 id다', () => {
    const v3current = fixtures.find((f: any) => f.label.startsWith('v3current'));
    // 이미 세션에서 id 7,8,9 까지 써버린 상태에서(nextId=10) 저장된 계획을 불러온 상황을 흉내낸다.
    const state = restore(v3current.hash, 10);
    expect(state.themes.map(t => t.id)).toEqual([1, 2, 3]);
    // 그리고 teams[].steps[].id 도 1,2,3 이므로 두 값이 반드시 일치해야 F-14 제외가 작동한다.
    expect(state.teams[0].steps.map(s => s.id)).toEqual(state.themes.map(t => t.id));
    // 다음 새 카드는 기존 세션의 10과 방금 복원한 3 중 더 큰 쪽보다 커야 한다.
    expect(state.nextId).toBe(10);
  });
});

/* F-16 — "새로고침하면 감시 벨이 사라진다" 의 회귀 테스트.
   복원은 raw 텍스트를 parseSessions()로 다시 읽는데 그 함수는 Session.id 를
   만들지 않는다. 튜플 7번째 자리가 그걸 메운다 (serialize.ts themeExtra). */
describe('serialize()↔restore() — 서버에서 불러온 회차의 slotId·출처가 살아남는다', () => {
  const serverTheme = {
    id: 1, name: '목격자', dur: 65, place: '플레이33 건대점',
    raw: '10:35  13:00 매진  18:15  22:30 매진',
    source: 'server',
    sessions: [
      { t: 635, soldout: false, id: 172 },
      { t: 780, soldout: true, id: 173 },
      { t: 1095, soldout: false, id: 174 },
      { t: 1350, soldout: true, id: 175 },
    ],
  };
  const state = (themes: any[]): AppState => ({
    themes, moveMap: {}, sortKey: 'gap', teams: [], nextId: 9,
    options: {
      oStart: '', oEnd: '', oMinGap: '', oMaxGap: '', oPartial: false,
      oMeal: false, oMealFrom: '', oMealTo: '', oMealMin: '',
      oMove: '10', oTeam: false, oIncludeSoldout: false,
    },
  });

  it('slotId 가 시각(t)으로 되붙고, 매진 여부도 그대로다 — 벨이 뜨는 조건 자체', () => {
    const back = restore(serialize(state([serverTheme]))).themes[0];
    expect(back.sessions.map(s => s.t)).toEqual([635, 780, 1095, 1350]);
    expect(back.sessions.map(s => s.id)).toEqual([172, 173, 174, 175]);
    expect(back.sessions.map(s => s.soldout)).toEqual([false, true, false, true]);
    // 벨의 실제 조건 (ThemeCard/ResultCard)
    expect(back.sessions.filter(s => s.soldout && s.id != null)).toHaveLength(2);
  });

  it('출처(source)도 살아남는다 — 예전에는 새로고침하면 manual 로 되돌아갔다', () => {
    const back = restore(serialize(state([serverTheme]))).themes[0];
    expect(back.source).toBe('server');
  });

  it('회차를 손으로 고쳐 없어진 시각의 id 는 그냥 안 붙는다 (엉뚱한 칩에 붙지 않는다)', () => {
    const edited = { ...serverTheme, raw: '10:35  13:00 매진  19:00' };
    const back = restore(serialize(state([edited]))).themes[0];
    expect(back.sessions.map(s => s.t)).toEqual([635, 780, 1140]);
    expect(back.sessions.map(s => s.id)).toEqual([172, 173, undefined]);
  });

  it('손으로 친 테마는 7번째 자리가 아예 안 붙는다 — 옛 링크와 바이트가 같다', () => {
    const manual = {
      id: 1, name: '방', dur: 70, place: '', raw: '10:00 12:00', source: 'manual',
      sessions: [{ t: 600, soldout: false }, { t: 720, soldout: false }],
    };
    const json = JSON.parse(atob(serialize(state([manual])).replace(/-/g, '+').replace(/_/g, '/')));
    expect(json.t[0]).toHaveLength(6);
  });

  it('날짜(date)도 살아남는다 — 테마 간 날짜 불일치 경고(§4.41)가 새로고침 후에도 유지된다', () => {
    const dated = { ...serverTheme, date: '2026-09-02' };
    const back = restore(serialize(state([dated]))).themes[0];
    expect(back.date).toBe('2026-09-02');
  });

  it('날짜 없는 서버 테마는 date가 undefined로 복원된다', () => {
    const back = restore(serialize(state([serverTheme]))).themes[0];
    expect(back.date).toBeUndefined();
  });
});
