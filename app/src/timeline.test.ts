import { describe, expect, it } from 'vitest';
import { barWidth, blockNeed, firstScroll } from './timeline';

describe('blockNeed — 테마 칸 하나에 필요한 폭', () => {
  it('짧은 이름은 한 줄 — 이름과 시각 중 넓은 쪽 + 여백', () => {
    expect(blockNeed(30, 70, 22)).toEqual({ need: 92, two: false });
    expect(blockNeed(150, 70, 22)).toEqual({ need: 172, two: false });
  });

  it('긴 이름(한 줄 180px 넘음)은 두 줄 — 반 + 줄바꿈 여유, 그래도 시각보다 좁아지지 않는다', () => {
    expect(blockNeed(500, 70, 22)).toEqual({ need: 292, two: true });
    expect(blockNeed(181, 120, 22)).toEqual({ need: 142, two: true });
  });
});

describe('barWidth — 막대 폭(분당 픽셀은 가장 빡빡한 칸이 정한다)', () => {
  it('다 들어가면 카드 폭 그대로', () => {
    expect(barWidth([{ dur: 70, need: 100 }, { dur: 60, need: 80 }], 300, 900)).toBe(900);
  });

  it('가장 짧은 칸이 모자라면 그 칸 기준으로 넓힌다', () => {
    // 50분 칸에 100px → 2px/분, 600분이면 1200px
    expect(barWidth([{ dur: 80, need: 100 }, { dur: 50, need: 100 }], 600, 330)).toBe(1200);
  });

  it('더 긴 칸이라도 이름이 길면 그 칸이 정한다(가장 짧은 칸만 보지 않는다)', () => {
    // 80분 칸에 이름 두 줄 292px → 3.65px/분 > 50분 칸 92px(1.84px/분)
    expect(barWidth([{ dur: 50, need: 92 }, { dur: 80, need: 292 }], 800, 330)).toBe(2920);
  });

  it('카드 폭보다 좁아지지 않는다(0분 칸도 나누기 오류 없이)', () => {
    expect(barWidth([], 600, 330)).toBe(330);
    expect(Number.isFinite(barWidth([{ dur: 0, need: 50 }], 60, 330))).toBe(true);
  });
});

describe('firstScroll — 처음 보일 때 첫 테마 시작이 왼쪽에', () => {
  it('앞쪽 빈 시간대를 넘기고 8px 여유', () => {
    // lo 600, 첫 테마 840, span 800, 막대 1600 → 480px - 8
    expect(firstScroll(840, 600, 800, 1600, 330)).toBe(472);
  });

  it('맨 앞이면 0, 끝을 넘지 않는다, 넘칠 게 없으면 0', () => {
    expect(firstScroll(600, 600, 800, 1600, 330)).toBe(0);
    expect(firstScroll(1350, 600, 800, 1600, 330)).toBe(1270);
    expect(firstScroll(840, 600, 800, 330, 330)).toBe(0);
  });
});
