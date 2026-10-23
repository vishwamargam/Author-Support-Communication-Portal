import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, Clock3, MessageSquareText, Paperclip, Send, Shield, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { Currency, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtimeInvalidation } from '../hooks/useRealtimeInvalidation.js';

const categories = [
  ['Royalty & Payments', 'Royalty & Payments'], ['ISBN & Metadata Issues', 'ISBN & Metadata Issues'],
  ['Printing & Quality', 'Printing & Quality'], ['Distribution & Availability', 'Distribution & Availability'],
  ['Book Status & Production Updates', 'Book Status & Production Updates'], ['General Inquiry', 'General Inquiry']
];
const statuses = ['Open', 'In Progress', 'Waiting on Author', 'Resolved', 'Closed'];
const priorities = ['Critical', 'High', 'Medium', 'Low'];
function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function idLabel(id) { return id ? `BL-${String(id).toUpperCase()}` : 'Ticket'; }

export default function AdminTicketDetailPage() {
  const { ticketId } = useParams();
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const requestSequence = useRef(0);

  async function load(quiet = false) {
    const sequence = ++requestSequence.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const result = (await api.get(`/admin/tickets/${ticketId}`)).data.data;
      if (sequence !== requestSequence.current) return;
      setDetail(result);
      if (result.ticket?.aiDraft?.status === 'complete') setDraft((current) => current || result.ticket.aiDraft.text || '');
    }
    catch (err) { if (sequence === requestSequence.current) setError(errorMessage(err)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }
  useEffect(() => { load(); }, [ticketId]);
  useRealtimeInvalidation({
    events: ['ticket:updated', 'ticket:message', 'ticket:internal-note'],
    ticketIds: [ticketId], onInvalidate: () => load(true)
  });

  async function perform(label, request, successText) {
    setBusyAction(label); setActionError(''); setSuccess('');
    try { await request(); await load(); setSuccess(successText); return true; }
    catch (err) { setActionError(errorMessage(err)); }
    finally { setBusyAction(''); }
    return false;
  }
  function updateField(field, value) {
    return perform(field, () => api.patch(`/admin/tickets/${ticketId}/${field}`, { [field]: value }), `${field[0].toUpperCase()}${field.slice(1)} updated.`);
  }
  const ticket = detail?.ticket;
  const author = detail?.author;
  const book = detail?.book;

  if (loading) return <><Link to="/admin" className="back-link"><ArrowLeft size={15} /> Back to queue</Link><LoadingState label="Loading ticket and author context…" /></>;
  if (error) return <><Link to="/admin" className="back-link"><ArrowLeft size={15} /> Back to queue</Link><ErrorState message={error} onRetry={load} /></>;

  async function sendPublicReply(event) {
    event.preventDefault();
    if (!draft.trim()) { setActionError('Write a reply before sending.'); return; }
    if (await perform('reply', () => api.post(`/admin/tickets/${ticketId}/replies`, { body: draft }), 'Your reply was sent to the author.')) setDraft('');
  }
  async function saveNote(event) {
    event.preventDefault();
    if (!note.trim()) { setActionError('Write a note before saving.'); return; }
    if (await perform('note', () => api.post(`/admin/tickets/${ticketId}/notes`, { body: note }), 'Internal note added.')) setNote('');
  }

  async function regenerateDraft() {
    setBusyAction('draft'); setActionError(''); setSuccess('');
    try {
      const result = (await api.post(`/admin/tickets/${ticketId}/draft`, {})).data.data.aiDraft;
      if (result?.status === 'complete') { setDraft(result.text || ''); setSuccess('A new draft is ready for review.'); }
      else setActionError('AI drafting is unavailable. You can write and send a manual reply.');
      await load();
    } catch (err) { setActionError(errorMessage(err)); }
    finally { setBusyAction(''); }
  }

  return <>
    <Link to="/admin" className="back-link"><ArrowLeft size={15} /> Back to queue</Link>
    <PageHeader eyebrow={`SUPPORT TICKET · ${idLabel(ticket._id)}`} title={ticket.subject} description={`Created ${dateTime(ticket.createdAt)} · last activity ${dateTime(ticket.lastActivityAt)}`} action={<StatusBadge value={ticket.status} />} />
    {actionError && <div className="admin-alert" role="alert">{actionError}</div>}
    {success && <div className="admin-success" role="status"><Check size={16} />{success}</div>}
    <div className="admin-detail-layout">
      <div className="admin-detail-main">
        <section className="surface admin-original-query"><div className="admin-section-heading"><div><span className="admin-section-icon"><MessageSquareText size={17} /></span><div><strong>Original query</strong><small>Submitted by {author?.name || 'author'} · {dateTime(detail.messages[0]?.createdAt)}</small></div></div><span className="public-label">AUTHOR VISIBLE</span></div>
          <div className="query-subject">{ticket.subject}</div><p>{detail.messages.find((message) => message.senderRole === 'author')?.body || 'No original query message is available.'}</p>
        </section>
        <section className="surface admin-conversation"><div className="admin-section-heading"><div><span className="admin-section-icon"><MessageSquareText size={17} /></span><div><strong>Conversation</strong><small>{detail.messages.length} messages · public replies and private notes</small></div></div></div>
          {detail.messages.length === 0 ? <div className="admin-detail-empty">No conversation messages yet.</div> : <div className="admin-message-list">{detail.messages.map((message) => {
            const internal = message.visibility === 'internal';
            const isAdmin = message.senderRole === 'admin';
            return <article key={message._id} className={`admin-message ${internal ? 'internal-message' : ''}`}>
              <div className={`admin-message-avatar ${isAdmin ? 'support-avatar' : ''}`}>{internal ? <Shield size={14} /> : isAdmin ? 'B' : author?.name?.slice(0, 1) || 'A'}</div>
              <div className="admin-message-main"><div className="admin-message-meta"><strong>{internal ? `${message.senderId === 'ADMIN001' ? 'You' : 'Support'} · Internal note` : isAdmin ? 'BookLeaf Support' : author?.name || 'Author'}</strong><time>{dateTime(message.createdAt)}</time></div>
                <div className="admin-message-body">{message.body}</div></div>
              {!internal && <span className="public-label">PUBLIC</span>}
            </article>;
          })}</div>}
        </section>
        <section className="surface admin-draft-card"><div className="admin-section-heading"><div><span className="draft-icon"><Bot size={18} /></span><div><strong>AI reply draft</strong><small>Review and edit before sending to the author.</small></div></div><span className="draft-unavailable">{ticket.aiDraft?.status === 'complete' ? 'Draft ready' : ticket.aiDraft?.status === 'generating' ? 'Generating…' : 'Manual reply available'}</span></div>
          <div className="draft-notice">{ticket.aiDraft?.status === 'complete' ? `Suggested using ${ticket.aiDraft.articleIds?.length || 0} policy reference(s). Check all details before sending.` : ticket.aiDraft?.status === 'failed' ? 'AI drafting is unavailable. Write a manual reply; the author only sees it after you send it.' : 'A draft is generated for review when the ticket opens. You can write a manual reply at any time.'}</div>
          <button className="secondary-button" type="button" onClick={regenerateDraft} disabled={busyAction === 'draft'}>{busyAction === 'draft' ? 'Generating…' : 'Regenerate draft'} <Bot size={14} /></button>
          <form onSubmit={sendPublicReply}><textarea aria-label="Reply draft" rows={5} maxLength={10000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a helpful reply grounded in your support knowledge…" />
            <div className="composer-footer"><span>{draft.length}/10000 · Public reply</span><button className="primary-button" disabled={busyAction === 'reply' || !draft.trim()}>{busyAction === 'reply' ? 'Sending…' : 'Send reply'} <Send size={14} /></button></div></form>
        </section>
        <section className="surface admin-note-card"><div className="admin-section-heading"><div><span className="note-icon"><Shield size={17} /></span><div><strong>Internal note</strong><small>Visible to BookLeaf admins only. Authors will not see this note.</small></div></div></div>
          <form onSubmit={saveNote}><textarea aria-label="Internal note" rows={3} maxLength={10000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for another support teammate…" />
            <div className="composer-footer"><span>Private to the support team</span><button className="secondary-button" disabled={busyAction === 'note' || !note.trim()}>{busyAction === 'note' ? 'Saving…' : 'Add internal note'} <Shield size={14} /></button></div></form>
        </section>
      </div>
      <aside className="admin-detail-side">
        <section className="surface admin-controls"><p className="eyebrow">TICKET CONTROLS</p><h2>Manage ticket</h2>
          <label>Status<select value={ticket.status} onChange={(e) => updateField('status', e.target.value)} disabled={busyAction === 'status'}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Category<select value={ticket.category} onChange={(e) => updateField('category', e.target.value)} disabled={busyAction === 'category'}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Priority<select value={ticket.priority} onChange={(e) => updateField('priority', e.target.value)} disabled={busyAction === 'priority'}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          {ticket.aiClassification?.priorityExplanation && <div className="draft-notice"><strong>AI priority suggestion:</strong> {ticket.aiClassification.priority} — {ticket.aiClassification.priorityExplanation}{ticket.prioritySource === 'human' ? ' The current priority was set by an admin.' : ''}</div>}
          <div className="assignee-control"><div><span>Assigned to</span><strong>{detail.assignee?.name || 'Unassigned'}</strong></div><button className="secondary-button" disabled={ticket.assignedTo === user?.id || busyAction === 'assignment'} onClick={() => perform('assignment', () => api.post(`/admin/tickets/${ticketId}/assign-to-me`, {}), 'Ticket assigned to you.')}>{ticket.assignedTo === user?.id ? 'Assigned to you' : 'Assign to me'}</button></div>
          <div className="detail-control-foot"><Clock3 size={14} /> Updated {dateTime(ticket.updatedAt)}</div>
        </section>
        <section className="surface author-context"><p className="eyebrow">AUTHOR CONTEXT</p><div className="author-profile"><span className="author-profile-avatar"><UserRound size={19} /></span><div><strong>{author?.name || 'Author unavailable'}</strong><small>{author?.email || ticket.authorId}</small></div></div>
          <div className="context-row"><span>Phone</span><strong>{author?.phone || '—'}</strong></div><div className="context-row"><span>City</span><strong>{author?.city || '—'}</strong></div><div className="context-row"><span>Author ID</span><strong>{ticket.authorId}</strong></div>
        </section>
        <section className="surface selected-book-card"><p className="eyebrow">SELECTED BOOK</p>{book ? <><div className="selected-book-title">{book.title}</div><div className="book-context-line">{book.isbn || 'ISBN unavailable'}</div><div className="book-context-line">{book.genre || 'Genre unavailable'}</div><StatusBadge value={book.status} /><div className="context-row"><span>Royalty pending</span><strong><Currency value={book.royaltyPending} /></strong></div></> : <div className="general-query"><Paperclip size={15} /> General / Account Level</div>}</section>
        {ticket.auditTrail?.length > 0 && <section className="surface audit-card"><p className="eyebrow">ACTIVITY HISTORY</p><div className="audit-list">{[...ticket.auditTrail].reverse().slice(0, 10).map((event, index) => <div className="audit-entry" key={`${event.eventType}-${index}`}><span className="audit-dot" /><div><strong>{event.eventType.replaceAll('_', ' ')}</strong><small>{event.fromValue && event.toValue ? `${event.fromValue} → ${event.toValue}` : ''}{event.fromValue && event.toValue ? ' · ' : ''}{event.actorId === user?.id ? 'You' : event.actorId} · {dateTime(event.createdAt)}</small></div></div>)}</div></section>}
      </aside>
    </div>
  </>;
}
