import { Component, Suspense, type ReactNode } from 'react';
import { STALE_MSG } from '../lazyRetry';

/* 늦게 받는 부분(React.lazy)이 끝내 안 받아져도 그 자리만 안내로 바꾼다 — 계산 화면 등 진입 청크는 그대로 산다 */
export class LazyBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <StaleNotice />;
    return <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}

export function StaleNotice() {
  return (
    <div className="listfail" role="alert">
      <span>{STALE_MSG}</span>
      <button type="button" className="btn" onClick={() => location.reload()}>새로 고침</button>
    </div>
  );
}
