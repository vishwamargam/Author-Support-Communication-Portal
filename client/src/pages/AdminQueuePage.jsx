import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/Ui.jsx';
import { useRealtimeInvalidation } from '../hooks/useRealtimeInvalidation.js';

const categories = [
  ['Royalty & Payments', 'Royalty & Payments'], ['ISBN & Metadata Issues', 'ISBN & Metadata Issues'],
  ['Printing & Quality', 'Printing & Quality'], ['Distribution & Availability', 'Distribution & Availability'],
  ['Book Status & Production Updates', 'Book Status & Production Updates'], ['General Inquiry', 'General Inquiry']
];
function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function ticketId(id) { return id ? `BL-${String(id).toUpperCase()}` : '—'; }

export default function AdminQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    q: searchParams.get('q') || '', status: searchParams.get('status') || '', category: searchParams.get('category') || '',
    priority: searchParams.get('priority') || '', from: searchParams.get('from') || '', to: searchParams.get('to') || '',
    sort: searchParams.get('sort') || 'oldest', assignee: searchParams.get('assignee') || 'any'
  });
  const [result, setResult] = useState({ tickets: [], meta: { page: 1, pages: 0, total: 0, oldestUnresolvedTicketId: null } });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  async function load(nextPage = page, applied = filters, quiet = false) {
    const sequence = ++requestSequence.current;
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    const params = { ...applied, page: nextPage, limit: 25 };
    Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
    try {
      const response = await api.get('/admin/tickets', { params });
      if (sequence === requestSequence.current) {
        setResult({ tickets: response.data.data.tickets, meta: response.data.meta });
        setPage(nextPage);
        setError('');
      }
    } catch (err) { if (sequence === requestSequence.current) setError(errorMessage(err)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }

  useEffect(() => {
    const current = Object.fromEntries(searchParams.entries());
    const requestedPage = Number(current.page || 1);
    delete current.page;
    const next = { ...filters, ...current };
    setFilters(next);
    load(requestedPage, next);
    // Initial URL state and explicit filter submissions drive the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeInvalidation({
    events: ['queue:ticket-created', 'queue:ticket-updated'],
    onInvalidate: () => load(page, filters, true),
    pollMs: 15000,
    pollWhenConnected: true
  });

  function update(name, value) { setFilters((old) => ({ ...old, [name]: value })); }
  function submitFilters(event) {
    event.preventDefault();
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    setSearchParams(params);
    load(1, filters);
  }
  function changePage(nextPage) {
    if (nextPage < 1 || nextPage > result.meta.pages) return;
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    params.page = String(nextPage);
    setSearchParams(params);
    load(nextPage, filters);
  }
  function clearFilters() {
    const cleared = { q: '', status: '', category: '', priority: '', from: '', to: '', sort: 'oldest', assignee: 'any' };
    setFilters(cleared); setSearchParams({}); load(1, cleared);
  }

  const oldestId = result.meta.oldestUnresolvedTicketId;
  const unresolvedCount = result.tickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status)).length;
  const urgentCount = result.tickets.filter((ticket) => ['Critical', 'High'].includes(ticket.priority)).length;

  return <>
    <PageHeader eyebrow="SUPPORT OPERATIONS" title="Ticket queue" description="Review author queries, make decisions, and keep every conversation moving." />
    <div className="admin-summary-strip"><div><span className="summary-icon"><SlidersHorizontal size={16} /></span><span><strong>{result.meta.total}</strong><small>matching tickets</small></span></div>
      <span className="summary-divider" /><div><span className="summary-dot dot-open" /><span><strong>{unresolvedCount}</strong><small>unresolved on this page</small></span></div>
      <span className="summary-divider" /><div><span className="summary-dot dot-urgent" /><span><strong>{urgentCount}</strong><small>critical / high on this page</small></span></div>
      {oldestId && <span className="oldest-summary"><Clock3 size={14} /> Oldest unresolved highlighted</span>}
    </div>
    <form className="surface admin-filters" onSubmit={submitFilters}>
      <div className="admin-filter-search"><Search size={16} /><input aria-label="Search subject, ticket ID, author" value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Search subject, ticket ID, or author" maxLength={120} /><kbd>⌕</kbd></div>
      <div className="filter-control-grid">
        <label>Status<select value={filters.status} onChange={(e) => update('status', e.target.value)}><option value="">All statuses</option>{['Open', 'In Progress', 'Waiting on Author', 'Resolved', 'Closed'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Category<select value={filters.category} onChange={(e) => update('category', e.target.value)}><option value="">All categories</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Priority<select value={filters.priority} onChange={(e) => update('priority', e.target.value)}><option value="">All priorities</option>{['Critical', 'High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Assignee<select value={filters.assignee} onChange={(e) => update('assignee', e.target.value)}><option value="any">Any assignee</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
        <label>Created from<input type="date" value={filters.from} onChange={(e) => update('from', e.target.value)} /></label>
        <label>Created to<input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} /></label>
        <label>Sort by<select value={filters.sort} onChange={(e) => update('sort', e.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="activity">Recent activity</option></select></label>
      </div>
      <div className="filter-actions"><button className="primary-button" type="submit"><SlidersHorizontal size={15} /> Apply filters</button><button className="text-button" type="button" onClick={clearFilters}>Clear all</button></div>
    </form>
    {loading ? <LoadingState label="Loading ticket queue…" /> : error ? <ErrorState message={error} onRetry={() => load(page)} /> :
      <section className="surface admin-queue-surface">
        <div className="admin-table-head"><div><strong>Support tickets</strong><span>Prioritize, assign, and respond to author requests.</span></div><span className="result-count">{result.meta.total} results</span></div>
        {result.tickets.length === 0 ? <div className="admin-empty"><span>✳</span><h3>No tickets match these filters</h3><p>Adjust the search or filters to see more tickets.</p><button className="secondary-button" onClick={clearFilters}>Clear filters</button></div> :
          <div className="admin-table-scroll"><table className="data-table admin-ticket-table"><thead><tr><th>Ticket</th><th>Author</th><th>Book</th><th>Category</th><th>Priority</th><th>Status</th><th>Created</th><th>Assignee</th><th aria-label="Open ticket" /></tr></thead>
            <tbody>{result.tickets.map((ticket) => {
              const unresolved = !['Resolved', 'Closed'].includes(ticket.status);
              const urgent = ['Critical', 'High'].includes(ticket.priority);
              const oldest = unresolved && ticket._id === oldestId;
              return <tr key={ticket._id} className={`${urgent ? `urgent-row priority-row-${ticket.priority.toLowerCase()}` : ''}${oldest ? ' oldest-row' : ''}`}>
                <td><Link className="admin-ticket-link" to={`/admin/tickets/${ticket._id}`}><span className="ticket-id-label">{ticketId(ticket._id)}{oldest && <small className="oldest-tag">OLDEST OPEN</small>}</span><strong>{ticket.subject}</strong></Link></td>
                <td><div className="author-cell"><span className="author-avatar">{ticket.author?.name?.slice(0, 1) || '?'}</span><span><strong>{ticket.author?.name || 'Author unavailable'}</strong><small>{ticket.author?.email || ticket.authorId}</small></span></div></td>
                <td className="book-cell">{ticket.book?.title || <span className="unassigned-label">General / Account</span>}</td>
                <td><span className="capitalize">{categories.find(([value]) => value === ticket.category)?.[1] || ticket.category}</span></td>
                <td><span className={`admin-priority priority-${String(ticket.priority).toLowerCase()}`}><i />{ticket.priority}</span></td>
                <td><StatusBadge value={ticket.status} /></td><td className="created-cell">{dateTime(ticket.createdAt)}</td>
                <td>{ticket.assignee?.name || <span className="unassigned-label">Unassigned</span>}</td>
                <td><Link aria-label={`Open ${ticket.subject}`} className="open-ticket-arrow" to={`/admin/tickets/${ticket._id}`}>↗</Link></td>
              </tr>;
            })}</tbody></table></div>}
        <div className="pagination"><span>Page {result.meta.pages ? page : 0} of {result.meta.pages}</span><div><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}><ChevronLeft size={16} /></button><button aria-label="Next page" disabled={page >= result.meta.pages || loading} onClick={() => changePage(page + 1)}><ChevronRight size={16} /></button></div></div>
      </section>}
  </>;
}
