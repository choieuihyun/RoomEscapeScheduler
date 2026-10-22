import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useBackClose, hist } from '../backStack';
import { closedNoticeId, closeNotice, linkParts, noticeIssue, noticeMeta, NOTICE_MAX } from '../notice';
import { deleteNotice, getNotice, isMissingApi, putNotice, sayClub, type NoticeDto } from '../server';
import { showToast } from '../toast';

/* 홈 공지(작업명세서 §4.14, 2026-10-23 사용자 요청) — 홈 맨 위 카드. 운영진이 하나 고정한다.
   - 멤버: 글(3줄까지, 넘으면 "더 보기") + "10/23 · 열쇠" + ×(이 기기에서 그 공지만 닫기 — 새로 쓰면 다시 보인다).
   - 운영진: "고치기"·"내리기", 공지가 없으면 흐린 "공지 쓰기" 줄. 쓰기 창에 "멤버들에게 알림 보내기"(기본 꺼짐).
   - 홈이 보일 때와 창이 다시 보일 때 새로 받는다. 서버가 이 경로를 모르면(404) 카드도 쓰기 줄도 없다.
   - 알림을 눌러 `#notice` 로 열리면 닫아 둔 공지여도 보이고, 해시는 지운다. */

const token = async () => {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return t;
};

const Ic = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export function NoticeCard({ active, isAdmin }: { active: boolean; isAdmin: boolean }) {
  const [notice, setNotice] = useState<NoticeDto | null | undefined>(undefined);   // undefined = 아직 모름
  const [missing, setMissing] = useState(false);
  const [closed, setClosed] = useState<number | null>(() => closedNoticeId());
  const [force, setForce] = useState(false);
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const n = await getNotice(await token());
      if (my === seq.current) setNotice(n);
    } catch (e) {
      if (my !== seq.current) return;
      if (isMissingApi(e)) setMissing(true);
      /* 그 밖의 실패(연결 끊김 등)는 조용히 — 받아 둔 공지가 있으면 그대로 둔다 */
    }
  }, []);

  useEffect(() => { if (active && !missing) void Promise.resolve().then(load); }, [active, missing, load]);
  useEffect(() => {
    if (!active || missing) return;
    const on = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [active, missing, load]);

  /* 알림에서 `#notice` 로 열렸다 — 닫아 둔 공지여도 이번엔 보이고, 주소의 해시는 지운다 */
  useEffect(() => {
    const read = () => {
      if (location.hash !== '#notice') return;
      setForce(true);
      setMore(true);
      hist.replace(history.state, location.pathname + location.search);
    };
    read();
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, []);

  if (missing) return null;

  const shown = notice && (force || closed !== notice.id);
  const close = () => {
    if (!notice) return;
    closeNotice(notice.id);
    setClosed(notice.id);
    setForce(false);
  };
  const takeDown = async () => {
    if (!confirm('공지를 내릴까요? 모든 멤버의 홈에서 사라져요.')) return;
    try {
      await deleteNotice(await token());
      setNotice(null);
      showToast('공지를 내렸어요.');
    } catch (e) {
      showToast(sayClub(e));
    }
  };
  const long = !!notice && (notice.text.split('\n').length > 3 || [...notice.text].length > 120);

  return (<>
    {shown && notice && (
      <section className="hm-card nt-card" aria-label="공지">
        <div className="nt-top">
          <span className="nt-ic"><Ic><path d="M3.5 10v4a1 1 0 0 0 1 1H7l5 4V5L7 9H4.5a1 1 0 0 0-1 1z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></Ic></span>
          <span className="nt-label">공지</span>
          <button type="button" className="nt-x" aria-label="공지 닫기" title="이 기기에서 닫기" onClick={close}>
            <Ic size={16}><path d="M6 6l12 12M18 6 6 18" /></Ic>
          </button>
        </div>
        <p className={'nt-text' + (long && !more ? ' clip' : '')}>
          {linkParts(notice.text).map((p, i) => ('url' in p
            ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">{p.url}</a>
            : <span key={i}>{p.text}</span>))}
        </p>
        {long && <button type="button" className="nt-more" onClick={() => setMore(!more)}>{more ? '접기' : '더 보기'}</button>}
        <div className="nt-foot">
          <span className="nt-meta">{noticeMeta(notice)}</span>
          {isAdmin && (
            <span className="nt-acts">
              <button type="button" className="nt-act" onClick={() => setEditing(true)}>고치기</button>
              <button type="button" className="nt-act danger" onClick={() => void takeDown()}>내리기</button>
            </span>
          )}
        </div>
      </section>
    )}
    {isAdmin && notice === null && (
      <button type="button" className="nt-write" onClick={() => setEditing(true)}>
        <Ic size={16}><path d="M3.5 10v4a1 1 0 0 0 1 1H7l5 4V5L7 9H4.5a1 1 0 0 0-1 1z" /></Ic>
        멤버들에게 보일 공지 쓰기
      </button>
    )}
    {editing && (
      <NoticeEditor
        initial={notice?.text ?? ''}
        onClose={() => setEditing(false)}
        onSaved={(n) => { setNotice(n); setEditing(false); setForce(true); }}
      />
    )}
  </>);
}

function NoticeEditor({ initial, onClose, onSaved }: { initial: string; onClose: () => void; onSaved: (n: NoticeDto) => void }) {
  const [text, setText] = useState(initial);
  const [notify, setNotify] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);
  useBackClose(true, onClose);
  useEffect(() => {
    boxRef.current?.querySelector('textarea')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  const len = [...text.trim()].length;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = noticeIssue(text);
    if (issue) { setErr(issue); return; }
    setBusy(true); setErr('');
    try {
      const n = await putNotice({ text: text.trim(), notify }, await token());
      showToast(notify ? '공지를 올리고 멤버들에게 알렸어요.' : '공지를 올렸어요.');
      onSaved(n);
    } catch (x) {
      setErr(sayClub(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="mbox nt-box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="nt-h" onSubmit={(e) => void submit(e)} noValidate>
        <h3 id="nt-h">{initial ? '공지 고치기' : '공지 쓰기'}</h3>
        <p className="msub">홈 맨 위에 모든 멤버에게 보여요. 공지는 하나만 걸려요.</p>
        <label className="nt-field">
          <span className="sr-only">공지 내용</span>
          <textarea rows={6} value={text} placeholder={'예: 이번 달 정모는 11/8(토) 강남이에요.\n참여는 캘린더에서 눌러 주세요.'}
            onChange={(e) => { setText(e.target.value); setErr(''); }} />
          <i className={'nt-count' + (len > NOTICE_MAX ? ' over' : '')}>{len}/{NOTICE_MAX}</i>
        </label>
        <label className="evf-check nt-notify">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          멤버들에게 알림 보내기
        </label>
        {err && <p className="merr" role="alert">{err}</p>}
        <div className="mbtns">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn-go" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
        </div>
      </form>
    </div>
  );
}
