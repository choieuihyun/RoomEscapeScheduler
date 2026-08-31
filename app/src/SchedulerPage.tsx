import { useScheduler } from './scheduler/useScheduler';
import { useTheme } from './useTheme';
import { ThemeList } from './components/ThemeList';
import { ConditionsPanel } from './components/ConditionsPanel';
import { ResultsPanel } from './components/ResultsPanel';

export function SchedulerPage() {
  const s = useScheduler();
  const theme = useTheme();
  return (
    <div className="wrap">
      <header>
        <div className="hrow">
          <div className="hleft">
            <button className="btn tourbtn" type="button" disabled title="다음 단계에서 연결됩니다">사용법 보기</button>
            <button className="btn tourbtn" type="button" onClick={theme.toggle}>
              {theme.dark ? '라이트 모드' : '다크 모드'}
            </button>
          </div>
          <div className="acct" />
        </div>
        <h1>Flo<span className="dim">duler</span></h1>
        <p>테마별 회차 시간을 넣으면 겹치지 않는 조합을 전부 계산해서, 공백이 어디에 얼마나 생기는지 보여줍니다.</p>
      </header>

      <ThemeList s={s} />
      <ConditionsPanel s={s} />
      <ResultsPanel s={s} />
    </div>
  );
}
