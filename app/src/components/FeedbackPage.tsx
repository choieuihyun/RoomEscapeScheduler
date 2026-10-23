import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MemberLink } from '../clubStore';
import { commentIssue, feedbackIssue, kstDay, replaceById, shownFeedback, statusLine, STATUS_LABEL, STATUSES, type FeedbackSort } from '../feedback';
import {
  deleteFeedback, deleteFeedbackComment, editFeedback, isMissingApi, likeFeedback, listFeedback, listFeedbackComments,
  postFeedback, postFeedbackComment, sayClub, setFeedbackStatus,
  type FeedbackCommentDto, type FeedbackDto, type FeedbackStatus,
} from '../server';
import { showToast } from '../toast';

/* 의견 게시판(작업명세서 §4.15, 2026-10-23 사용자 요청) — 더보기 › 모임 › 의견(넓은 화면은 왼쪽 메뉴).
   사용자 결정: 승인 멤버 모두 보고, 누구나 댓글, 운영진이 처리 상태(접수·검토 중·반영됨·보류). 공감(+1)으로 같은 의견이 겹치지 않게.
   - 위: 쓰기 칸. 그 아래 상태 거르기·정렬(최신순·공감순).
   - 카드: 상태 칩(운영진은 눌러서 바꾼다) · 글(4줄, 펼치기) · 쓴 사람·날짜 · 공감 · 댓글(펼치면 댓글과 댓글 칸) · 내 글 고치기 · 지우기.
   - 들어올 때마다 목록을 새로 받는다. 서버가 이 API 를 모르면(404) onMissing — 메뉴를 숨기고 더보기로 돌아간다. */

const token = async () => {
  const t = await (await import('../cloud')).idToken();
  if (!t) throw Object.assign(new Error('로그인해 주세요.'), { body: { message: '로그인해 주세요.' } });
  return t;
};

const Ic = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Heart = ({ on }: { on: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </svg>
);

export function FeedbackPage({ active, isAdmin, onBack, onMissing }: {
  active: boolean; isAdmin: boolean; onBack: () => void; onMissing: () => void;
}) {
  const [list, setList] = useState<FeedbackDto[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<FeedbackStatus | 'ALL'>('ALL');
  const [sort, setSort] = useState<FeedbackSort>('new');
  const [draft, setDraft] = useState('');
  const [draftErr, setDraftErr] = useState('');
  const [posting, setPosting] = useState(false);
  const seq = useRef(0);
  const missingRef = useRef(onMissing);
  useEffect(() => { missingRef.current = onMissing; }, [onMissing]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const got = await listFeedback(await token());
      if (my === seq.current) { setList(got); setErr(''); }
    } catch (e) {
      if (my !== seq.current) return;
      if (isMissingApi(e)) { showToast('서버가 아직 의견 게시판을 몰라요. 잠시 뒤에 다시 열어 주세요.'); missingRef.current(); return; }
      setErr(sayClub(e));
    }
  }, []);
  useEffect(() => { if (active) void Promise.resolve().then(load); }, [active, load]);

  /* 카드가 바꾼 글 하나로 목록을 고친다(null 이면 뺀다) */
  const put = useCallback((dto: FeedbackDto | null, id?: number) => setList((l) => (l ? replaceById(l, dto, id) : l)), []);

  const submit = async () => {
    const issue = feedbackIssue(draft);
    if (issue) { setDraftErr(issue); return; }
    setPosting(true); setDraftErr('');
    try {
      const n = await postFeedback(draft.trim(), await token());
      setList((l) => [n, ...(l ?? [])]);
      setDraft('');
      setFilter('ALL');
      showToast('의견을 올렸어요.');
    } catch (e) {
      setDraftErr(sayClub(e));
    } finally {
      setPosting(false);
    }
  };

  const shown = list ? shownFeedback(list, filter, sort) : [];
  const countOf = (s: FeedbackStatus) => (list ?? []).filter((f) => f.status === s).length;

  return (<>
    <header className="page-head">
      <button type="button" className="page-back" onClick={onBack}><span aria-hidden="true">‹</span> 더보기</button>
      <h1>의견</h1>
      <p>앱이나 모임에 바라는 점을 남겨 주세요. 멤버 모두 볼 수 있고, 같은 생각이면 공감을 눌러 주세요.</p>
    </header>
    <div className="fb">
      <div className="fb-write">
        <label className="sr-only" htmlFor="fb-draft">의견 쓰기</label>
        <textarea id="fb-draft" rows={draft ? 4 : 2} value={draft} placeholder="예: 캘린더에서 지난 달로 넘길 때 더 빨랐으면 좋겠어요."
          onChange={(e) => { setDraft(e.target.value); setDraftErr(''); }} />
        <div className="fb-write-b">
          {draftErr ? <p className="merr" role="alert">{draftErr}</p> : <span className="fb-count">{[...draft.trim()].length}/1000</span>}
          <button type="button" className="btn-go fb-post" disabled={posting || !draft.trim()} onClick={() => void submit()}>{posting ? '올리는 중…' : '올리기'}</button>
        </div>
      </div>

      <div className="fb-bar">
        <div className="fb-filter" role="group" aria-label="처리 상태로 거르기">
          <button type="button" className="chip-pick" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>전체{list ? ` ${list.length}` : ''}</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" className="chip-pick" aria-pressed={filter === s} onClick={() => setFilter(filter === s ? 'ALL' : s)}>
              {STATUS_LABEL[s]}{list ? ` ${countOf(s)}` : ''}
            </button>
          ))}
        </div>
        <div className="fb-sort" role="group" aria-label="정렬">
          {(['new', 'likes'] as const).map((k) => (
            <button key={k} type="button" className={'fb-sort-b' + (sort === k ? ' on' : '')} aria-pressed={sort === k} onClick={() => setSort(k)}>
              {k === 'new' ? '최신순' : '공감순'}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="home-empty"><p>{err}</p><button type="button" className="btn" onClick={() => void load()}>다시 시도</button></div>}
      {!err && list === null && <p className="mem-empty">불러오는 중이에요…</p>}
      {list && shown.length === 0 && <p className="mem-empty">{filter === 'ALL' ? '아직 의견이 없어요. 처음으로 남겨 주세요.' : `${STATUS_LABEL[filter]} 의견이 없어요.`}</p>}
      {shown.length > 0 && (
        <ul className="fb-list">
          {shown.map((f) => <FeedbackCard key={f.id} f={f} isAdmin={isAdmin} onChange={put} />)}
        </ul>
      )}
    </div>
  </>);
}

function FeedbackCard({ f, isAdmin, onChange }: { f: FeedbackDto; isAdmin: boolean; onChange: (dto: FeedbackDto | null, id?: number) => void }) {
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<FeedbackCommentDto[] | null>(null);
  const [cErr, setCErr] = useState('');
  const [reply, setReply] = useState('');
  const [replyErr, setReplyErr] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editErr, setEditErr] = useState('');
  const [stMenu, setStMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  /* 실패는 알림 띠로 — 지워진 글(NO_SUCH_FEEDBACK)이면 목록에서도 뺀다 */
  const run = async <T,>(fn: (t: string) => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try { return await fn(await token()); } catch (e) {
      showToast(sayClub(e));
      if ((e as { body?: { error?: string } })?.body?.error === 'NO_SUCH_FEEDBACK') onChange(null, f.id);
      return null;
    } finally { setBusy(false); }
  };

  const loadComments = async () => {
    setCErr('');
    try { setComments(await listFeedbackComments(f.id, await token())); } catch (e) { setCErr(sayClub(e)); }
  };
  const toggleOpen = () => { const next = !open; setOpen(next); if (next && comments === null) void loadComments(); };

  const like = async () => { const r = await run((t) => likeFeedback(f.id, !f.liked, t)); if (r) onChange(r); };
  const setStatus = async (s: FeedbackStatus) => {
    setStMenu(false);
    if (s === f.status) return;
    const r = await run((t) => setFeedbackStatus(f.id, s, t));
    if (r) onChange(r);
  };
  const remove = async () => {
    if (!confirm(f.mine ? '이 의견을 지울까요? 댓글과 공감도 같이 사라져요.' : '이 의견을 지울까요? 쓴 사람의 글과 댓글·공감이 모두 사라져요.')) return;
    const r = await run((t) => deleteFeedback(f.id, t));
    if (r) { onChange(null, f.id); showToast('의견을 지웠어요.'); }
  };
  const saveEdit = async () => {
    if (editing === null) return;
    const issue = feedbackIssue(editing);
    if (issue) { setEditErr(issue); return; }
    const r = await run((t) => editFeedback(f.id, editing.trim(), t));
    if (r) { onChange(r); setEditing(null); setEditErr(''); }
  };
  const sendReply = async () => {
    const issue = commentIssue(reply);
    if (issue) { setReplyErr(issue); return; }
    const r = await run((t) => postFeedbackComment(f.id, reply.trim(), t));
    if (r) {
      setComments((c) => [...(c ?? []), r]);
      setReply(''); setReplyErr('');
      onChange({ ...f, comments: f.comments + 1 });
    }
  };
  const removeComment = async (c: FeedbackCommentDto) => {
    if (!confirm('이 댓글을 지울까요?')) return;
    const r = await run((t) => deleteFeedbackComment(c.id, t));
    if (r) {
      setComments((cs) => (cs ?? []).filter((x) => x.id !== c.id));
      onChange({ ...f, comments: Math.max(0, f.comments - 1) });
    }
  };

  const long = f.text.split(/\r\n|\r|\n/).length > 4 || [...f.text].length > 160;
  const edited = f.updatedAt !== f.createdAt;

  return (
    <li className="fb-card">
      <div className="fb-top">
        {isAdmin ? (
          <span className="fb-st-w">
            <button type="button" className={'fb-st ' + f.status.toLowerCase()} aria-haspopup="menu" aria-expanded={stMenu} disabled={busy}
              aria-label={`처리 상태 바꾸기: 지금 ${STATUS_LABEL[f.status]}`} onClick={() => setStMenu(!stMenu)}>
              {STATUS_LABEL[f.status]}<Ic size={12}><path d="m6 9 6 6 6-6" /></Ic>
            </button>
            {stMenu && (
              <span className="fb-st-menu" role="menu" aria-label="처리 상태">
                {STATUSES.map((s) => (
                  <button key={s} type="button" role="menuitemradio" aria-checked={f.status === s} onClick={() => void setStatus(s)}>
                    <i className={'fb-dot ' + s.toLowerCase()} />{STATUS_LABEL[s]}
                  </button>
                ))}
              </span>
            )}
          </span>
        ) : <span className={'fb-st ' + f.status.toLowerCase()}>{STATUS_LABEL[f.status]}</span>}
        {/* 운영진이 상태를 바꿨으면 언제·누가(statusLine 의 뒷부분 — 칩이 상태 이름을 이미 보인다) */}
        {f.statusAt && f.statusBy && <span className="fb-st-by" title={statusLine(f)}>{kstDay(f.statusAt)} {f.statusBy.nickname}</span>}
      </div>

      {editing === null ? (<>
        <p className={'fb-text' + (long && !more ? ' clip' : '')}>{f.text}</p>
        {long && <button type="button" className="fb-more" onClick={() => setMore(!more)}>{more ? '접기' : '더 보기'}</button>}
      </>) : (
        <div className="fb-edit">
          <textarea rows={4} value={editing} aria-label="의견 고치기" onChange={(e) => { setEditing(e.target.value); setEditErr(''); }} />
          {editErr && <p className="merr" role="alert">{editErr}</p>}
          <div className="fb-edit-b">
            <button type="button" className="btn" onClick={() => { setEditing(null); setEditErr(''); }}>취소</button>
            <button type="button" className="btn-go" disabled={busy} onClick={() => void saveEdit()}>저장</button>
          </div>
        </div>
      )}

      <div className="fb-meta">
        <MemberLink uid={f.author.uid} name={f.author.nickname} />
        <span>· {kstDay(f.createdAt)}{edited ? ' · 고침' : ''}</span>
      </div>

      <div className="fb-acts">
        <button type="button" className={'fb-act fb-like' + (f.liked ? ' on' : '')} aria-pressed={f.liked} disabled={busy} onClick={() => void like()}
          aria-label={`공감 ${f.likes}${f.liked ? ', 내가 공감함' : ''}`}>
          <Heart on={f.liked} />공감 {f.likes}
        </button>
        <button type="button" className={'fb-act' + (open ? ' on' : '')} aria-expanded={open} onClick={toggleOpen}>
          <Ic><path d="M4 5h16v11H8l-4 4z" /></Ic>댓글 {f.comments}
        </button>
        <span className="fb-acts-r">
          {f.mine && editing === null && <button type="button" className="fb-link" onClick={() => setEditing(f.text)}>고치기</button>}
          {f.canDelete && <button type="button" className="fb-link danger" disabled={busy} onClick={() => void remove()}>지우기</button>}
        </span>
      </div>

      {open && (
        <div className="fb-cmts">
          {cErr && <p className="merr">{cErr} <button type="button" className="stl-link" onClick={() => void loadComments()}>다시 시도</button></p>}
          {!cErr && comments === null && <p className="fb-note">불러오는 중이에요…</p>}
          {comments && comments.length === 0 && <p className="fb-note">아직 댓글이 없어요.</p>}
          {comments && comments.length > 0 && (
            <ul className="fb-cmt-list">
              {comments.map((c) => (
                <li key={c.id} className="fb-cmt">
                  <div className="fb-cmt-h">
                    <MemberLink uid={c.author.uid} name={c.author.nickname} />
                    {c.admin && <span className="chip-info role">운영진</span>}
                    <span className="fb-cmt-d">{kstDay(c.createdAt)}</span>
                    {c.canDelete && <button type="button" className="fb-link danger" disabled={busy} onClick={() => void removeComment(c)}>지우기</button>}
                  </div>
                  <p className="fb-cmt-t">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="fb-reply">
            <input value={reply} aria-label="댓글 쓰기" placeholder="댓글 달기" maxLength={400}
              onChange={(e) => { setReply(e.target.value); setReplyErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void sendReply(); } }} />
            <button type="button" className="btn" disabled={busy || !reply.trim()} onClick={() => void sendReply()}>등록</button>
          </div>
          {replyErr && <p className="merr" role="alert">{replyErr}</p>}
        </div>
      )}
    </li>
  );
}
