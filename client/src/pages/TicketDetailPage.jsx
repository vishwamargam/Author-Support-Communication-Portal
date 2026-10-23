import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Ticket } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { Currency, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/Ui.jsx';
import { useRealtimeInvalidation } from '../hooks/useRealtimeInvalidation.js';

function dateTime(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [sending, setSending] = useState(false);
  const requestSequence = useRef(0);

  async function load(quiet = false) {
    const sequence = ++requestSequence.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try {
      const response = await api.get(`/tickets/${ticketId}`);
      const detail = response.data.data;
      if (sequence !== requestSequence.current) return;
      setTicket(detail.ticket); setMessages(detail.messages);
      setBook(detail.book || null);
    } catch (err) { if (sequence === requestSequence.current) setError(errorMessage(err)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }
  useEffect(() => { load(); }, [ticketId]);
  useRealtimeInvalidation({
    events: ['ticket:updated', 'ticket:message'], ticketIds: [ticketId], onInvalidate: () => load(true)
  });

  async function handleReply(event) {
    event.preventDefault(); setReplyError(''); setSending(true);
    try {
      await api.post(`/tickets/${ticketId}/messages`, { body: reply });
      setReply(''); await load();
    } catch (err) { setReplyError(errorMessage(err)); }
    finally { setSending(false); }
  }

  if (loading) return <><Link to="/tickets" className="back-link"><ArrowLeft size={15} /> Back to my tickets</Link><LoadingState label="Loading ticket conversation…" /></>;
  if (error) return <><Link to="/tickets" className="back-link"><ArrowLeft size={15} /> Back to my tickets</Link><ErrorState message={error} onRetry={load} /></>;

  return <>
    <Link to="/tickets" className="back-link"><ArrowLeft size={15} /> Back to my tickets</Link>
    <PageHeader eyebrow="SUPPORT CONVERSATION" title={ticket.subject} description={`Ticket opened ${dateTime(ticket.createdAt)}`} action={<StatusBadge value={ticket.status} />} />
    <div className="detail-grid"><section className="surface conversation-panel">
      <div className="conversation-title"><div><span className="ticket-card-icon"><Ticket size={17} /></span><div><strong>Conversation</strong><span>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span></div></div>
        <span className="category-pill">{ticket.category?.replaceAll('_', ' ') || 'General support'}</span></div>
      {messages.length === 0 ? <div className="conversation-empty">No messages in this ticket yet.</div> : <div className="message-list">{messages.map((message) => {
        const isAuthor = message.senderRole === 'author';
        return <article className={`message-row ${isAuthor ? 'message-author' : 'message-support'}`} key={message._id}>
          <div className="message-avatar">{isAuthor ? 'Y' : 'B'}</div><div className="message-content"><div className="message-meta"><strong>{isAuthor ? 'You' : 'BookLeaf Support'}</strong><time>{dateTime(message.createdAt)}</time></div>
            <div className="message-bubble">{message.body}</div></div>
        </article>;
      })}</div>}
      {['Closed', 'Resolved'].includes(ticket.status) ? <div className="closed-conversation">This ticket is marked {ticket.status.toLowerCase()}. Contact support to continue the conversation.</div> :
        <form className="reply-form" onSubmit={handleReply}>{replyError && <div className="form-alert" role="alert">{replyError}</div>}
          <label htmlFor="reply">Your reply</label><textarea id="reply" rows={4} required minLength={1} maxLength={10000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply to BookLeaf Support…" />
          <div className="reply-footer"><span>Only you and BookLeaf Support can see this conversation.</span><button className="primary-button" disabled={sending || !reply.trim()}>{sending ? 'Sending…' : 'Send reply'} <Send size={15} /></button></div>
        </form>}
    </section>
      <aside className="surface ticket-info"><p className="eyebrow">TICKET DETAILS</p><h2>At a glance</h2>
        <div className="info-row"><span>Status</span><StatusBadge value={ticket.status} /></div>
        <div className="info-row"><span>Category</span><strong className="capitalize">{ticket.category?.replaceAll('_', ' ') || 'General support'}</strong></div>
        <div className="info-row"><span>Priority</span><strong className={`priority-text priority-${String(ticket.priority || '').toLowerCase()}`}>{ticket.priority || '—'}</strong></div>
        <div className="info-row"><span>Related to</span><strong>{book?.title || 'General / Account Level'}</strong></div>
        {book && <div className="info-row"><span>Pending royalty</span><strong><Currency value={book.royaltyPending} /></strong></div>}
        <div className="aside-tip"><span>✳</span><p>Replies from our team will appear here. You’ll be able to follow every update in this conversation.</p></div>
      </aside></div>
  </>;
}
