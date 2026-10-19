import { useToasts } from '../toast';

/* toast.ts 의 showToast() 를 받아 화면 아래 가운데에 띄운다. 스크린 리더가 읽도록
   aria-live="polite". */
export function Toaster() {
  const items = useToasts();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {items.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
    </div>
  );
}
