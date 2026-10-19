import { useToasts } from '../toast';

/* toast.ts 의 showToast() 를 받아 화면 아래 가운데에 띄운다. 스크린 리더가 읽도록
   aria-live="polite". 단추가 붙은 알림은 마우스·포커스가 있는 동안 시간이 멈추고,
   단추를 누르면 그 일을 하고 바로 닫힌다(onClose 'action'). */
export function Toaster() {
  const { items, close, hold, release } = useToasts();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {items.map(t => (
        <div
          key={t.id} className={'toast' + (t.action ? ' has-act' : '')}
          onMouseEnter={t.action ? () => hold(t.id, 'hover') : undefined}
          onMouseLeave={t.action ? () => release(t.id, 'hover') : undefined}
          onFocus={t.action ? () => hold(t.id, 'focus') : undefined}
          onBlur={t.action ? () => release(t.id, 'focus') : undefined}
        >
          {t.msg}
          {t.action && (
            <button type="button" className="toast-act" onClick={() => { t.action!.run?.(); close(t.id, 'action'); }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
