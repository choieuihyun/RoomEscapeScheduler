import { useCallback, useEffect, useRef, useState } from 'react';
import { MemberLink } from '../clubStore';
import { commentIssue, kstDay } from '../feedback';
import { deleteEventComment, isMissingApi, listEventComments, postEventComment, sayClub, type EventCommentDto } from '../server';
import { showToast } from '../toast';

/* 일정 댓글(작업명세서 §4.16, 2026-10-27 사용자 요청) — 일정 상세 맨 아래. 승인 멤버 누구나 쓰고, 쓴 사람·운영진이 지운다.
   서버가 참여자·만든 사람·댓글 쓴 사람에게 알림을 보낸다(일정마다 하나로 겹침).
   상세가 열릴 때 받고, 창이 다시 보일 때·앱이 열린 채 이 일정 알림이 오면(SchedulerPage 의 'flod:event-push') 다시 받는다.
   서버가 이 경로를 모르면(본문 없는 404) 이 창이 살아 있는 동안 숨긴다. */

let apiMissing = false;
export const EVENT_PUSH = 'flod:event-push';

const token = async () => {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return t;
};

export function EventComments({ eventId, onCount }: { eventId: number; onCount?: (n: number) => void }) {
  const [hidden, setHidden] = useState(apiMissing);
  const [list, setList] = useState<EventCommentDto[] | null>(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [textErr, setTextErr] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const countRef = useRef(onCount);
  useEffect(() => { countRef.current = onCount; }, [onCount]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const got = await listEventComments(eventId, await token());
      if (my !== seq.current) return;
      setList(got); setErr('');
      countRef.current?.(got.length);
    } catch (e) {
      if (my !== seq.current) return;
      if (isMissingApi(e)) { apiMissing = true; setHidden(true); return; }
      setErr(sayClub(e));
    }
  }, [eventId]);

  useEffect(() => {
    if (hidden) return;
    void Promise.resolve().then(load);
    const vis = () => { if (document.visibilityState === 'visible') void load(); };
    const push = (e: Event) => { if ((e as CustomEvent<number>).detail === eventId) void load(); };
    document.addEventListener('visibilitychange', vis);
    addEventListener(EVENT_PUSH, push);
    return () => { document.removeEventListener('visibilitychange', vis); removeEventListener(EVENT_PUSH, push); };
  }, [hidden, load, eventId]);

  if (hidden) return null;

  const send = async () => {
    const issue = commentIssue(text, 10);
    if (issue) { setTextErr(issue); return; }
    setBusy(true); setTextErr('');
    try {
      const c = await postEventComment(eventId, text.trim(), await token());
      setList((l) => {
        const next = [...(l ?? []), c];
        countRef.current?.(next.length);
        return next;
      });
      setText('');
    } catch (e) {
      setTextErr(sayClub(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: EventCommentDto) => {
    if (!confirm('이 댓글을 지울까요?')) return;
    setBusy(true);
    try {
      await deleteEventComment(c.id, await token());
      setList((l) => {
        const next = (l ?? []).filter((x) => x.id !== c.id);
        countRef.current?.(next.length);
        return next;
      });
    } catch (e) {
      showToast(sayClub(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="evc" aria-labelledby={`evc-h-${eventId}`}>
      <h3 className="evp-h" id={`evc-h-${eventId}`}>댓글{list && list.length > 0 && <span className="evc-n"> {list.length}</span>}</h3>
      {err && <p className="merr">{err} <button type="button" className="stl-link" onClick={() => void load()}>다시 시도</button></p>}
      {!err && list === null && <p className="fb-note">불러오는 중이에요…</p>}
      {list && list.length === 0 && <p className="fb-note">아직 댓글이 없어요. 참여자·만든 사람에게 알림이 가요.</p>}
      {list && list.length > 0 && (
        <ul className="fb-cmt-list">
          {list.map((c) => (
            <li key={c.id} className="fb-cmt">
              <div className="fb-cmt-h">
                <MemberLink uid={c.author.uid} name={c.author.nickname} />
                {c.admin && <span className="chip-info role">운영진</span>}
                <span className="fb-cmt-d">{kstDay(c.createdAt)}</span>
                {c.canDelete && <button type="button" className="fb-link danger" disabled={busy} onClick={() => void remove(c)}>지우기</button>}
              </div>
              <p className="fb-cmt-t">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="fb-reply">
        <input value={text} aria-label="댓글 쓰기" placeholder="댓글 달기" maxLength={400}
          onChange={(e) => { setText(e.target.value); setTextErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => void send()}>등록</button>
      </div>
      {textErr && <p className="merr" role="alert">{textErr}</p>}
    </section>
  );
}
