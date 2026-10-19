import { useToasts } from '../toast';

/* toast.ts 의 showToast() 를 받아 화면 아래 가운데에 띄운다. 스크린 리더가 읽도록
   aria-live="polite". 단추가 붙은 알림은 누르면 그 일을 하고 바로 닫힌다. */
export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {items.map(t => (
        <div key={t.id} className={'toast' + (t.action ? ' has-act' : '')}>
          {t.msg}
          {t.action && (
            <button type="button" className="toast-act" onClick={() => { dismiss(t.id); t.action!.run(); }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
