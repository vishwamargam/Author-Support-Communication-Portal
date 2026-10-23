import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Plus, Search, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/Ui.jsx';
import { useRealtimeInvalidation } from '../hooks/useRealtimeInvalidation.js';

function dateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('All tickets');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  async function load(quiet = false) {
    const sequence = ++requestSequence.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try { const result = (await api.get('/tickets?limit=100')).data.data.tickets; if (sequence === requestSequence.current) setTickets(result); }
    catch (err) { if (sequence === requestSequence.current) setError(errorMessage(err)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useRealtimeInvalidation({
    events: ['ticket:updated', 'ticket:message'],
    ticketIds: tickets.map((ticket) => ticket._id),
    onInvalidate: () => load(true)
  });
  const shownTickets = useMemo(() => tickets.filter((ticket) => {
    const statusMatches = filter === 'All tickets' || (filter === 'Open' ? !['Resolved', 'Closed'].includes(ticket.status) : ticket.status === filter);
    const query = search.trim().toLowerCase();
    const searchMatches = !query || `${ticket.subject} ${ticket.originalQuery?.body || ''} ${ticket.category || ''}`.toLowerCase().includes(query);
    return statusMatches && searchMatches;
  }), [tickets, filter, search]);

  return <>
    <PageHeader eyebrow="AUTHOR SUPPORT" title="My tickets" description="Every query and reply, together in one place." action={<Link to="/support/new" className="primary-button"><Plus size={17} /> New query</Link>} />
    <section className="surface ticket-board">
      <div className="ticket-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter tickets">{['All tickets', 'Open', 'Resolved'].map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}<span>{item === 'All tickets' ? tickets.length : item === 'Open' ? tickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status)).length : tickets.filter((ticket) => ['Resolved', 'Closed'].includes(ticket.status)).length}</span></button>)}</div>
        <label className="search-box"><Search size={16} /><input aria-label="Search tickets" placeholder="Search tickets" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
      {loading ? <LoadingState label="Loading your tickets…" /> : error ? <ErrorState message={error} onRetry={load} /> : shownTickets.length === 0 ?
        <EmptyState title={tickets.length ? 'No matching tickets' : 'No support queries yet'}>{tickets.length ? 'Try changing your filter or search term.' : 'Your conversations with the BookLeaf team will appear here.'}
          {!tickets.length && <Link to="/support/new" className="primary-button empty-action"><Plus size={16} /> Submit a query</Link>}</EmptyState> :
        <div className="ticket-list">{shownTickets.map((ticket) => <Link to={`/tickets/${ticket._id}`} className="ticket-card" key={ticket._id}>
          <div className="ticket-card-top"><div className="ticket-subject-wrap"><span className="ticket-card-icon"><Ticket size={17} /></span><div><h3>{ticket.subject}</h3><p>Updated {dateLabel(ticket.lastActivityAt)}</p></div></div><ArrowRight className="ticket-arrow" size={17} /></div>
          <p className="query-preview">{ticket.originalQuery?.body || 'Original query unavailable.'}</p>
          <div className="ticket-card-bottom"><div className="ticket-meta"><span className="category-pill">{ticket.category?.replaceAll('_', ' ') || 'General support'}</span><span className={`priority-text priority-${String(ticket.priority || '').toLowerCase()}`}>{ticket.priority || 'Priority pending'}</span></div><StatusBadge value={ticket.status} /></div>
        </Link>)}</div>}
    </section>
  </>;
}
