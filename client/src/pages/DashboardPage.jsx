import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, CircleHelp, IndianRupee, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { Currency, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, StatusBadge } from '../components/Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const sumField = (items, field) => items.reduce((sum, item) => sum + (Number.isFinite(Number(item[field])) ? Number(item[field]) : 0), 0);

export default function DashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', books: [], tickets: [] });
  async function load() {
    setState((old) => ({ ...old, loading: true, error: '' }));
    try {
      const [bookResponse, ticketResponse] = await Promise.all([api.get('/books'), api.get('/tickets?limit=100')]);
      setState({ loading: false, error: '', books: bookResponse.data.data.books, tickets: ticketResponse.data.data.tickets });
    } catch (error) { setState((old) => ({ ...old, loading: false, error: errorMessage(error) })); }
  }
  useEffect(() => { load(); }, []);

  if (state.loading) return <LoadingState />;
  if (state.error) return <><PageHeader eyebrow="YOUR PUBLISHING SPACE" title={`Good to see you, ${user?.name?.split(' ')[0] || 'Author'}`} />
    <ErrorState message={state.error} onRetry={load} /></>;
  const published = state.books.filter((book) => book.status === 'Published & Live').length;
  const pending = sumField(state.books, 'royalty_pending');
  const openTickets = state.tickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status)).length;

  return <>
    <PageHeader eyebrow="YOUR PUBLISHING SPACE" title={`Good to see you, ${user?.name?.split(' ')[0] || 'Author'}`} description="A clear view of your books, earnings, and conversations." />
    <section className="welcome-banner"><div><span className="welcome-kicker">YOUR BOOKLEAF SNAPSHOT</span><h2>Your words are out in the world.</h2>
      <p>Keep an eye on your catalogue and reach us whenever you need a hand.</p></div><div className="banner-leaf" aria-hidden="true">✳</div>
    </section>
    <section className="metric-grid" aria-label="Author summary">
      <MetricCard label="Books in your catalogue" value={state.books.length} detail={`${published} published & live`} icon={BookOpen} />
      <MetricCard label="Copies sold" value={new Intl.NumberFormat('en-IN').format(sumField(state.books, 'total_copies_sold'))} detail="Across your book catalogue" icon={ArrowUpRight} tone="peach" />
      <MetricCard label="Royalty pending" value={<Currency value={pending} />} detail="From supplied royalty records" icon={IndianRupee} tone="lavender" />
      <MetricCard label="Open support queries" value={openTickets} detail="We’re here to help" icon={Ticket} tone="blue" />
    </section>
    <div className="dashboard-columns">
      <section className="surface recent-books"><div className="section-heading"><div><p className="eyebrow">YOUR CATALOGUE</p><h2>Recently published</h2></div><Link className="inline-link" to="/books">View all books <ArrowUpRight size={15} /></Link></div>
        {state.books.length ? <div className="book-list">{state.books.slice(0, 3).map((book) => <div className="book-list-row" key={book._id}>
          <div className="mini-cover">{book.title?.slice(0, 1)}</div><div className="book-list-copy"><strong>{book.title}</strong><span>{book.genre || 'Genre not provided'}</span></div>
          <StatusBadge value={book.status} />
        </div>)}</div> : <EmptyState title="No books in your catalogue yet">Your book details will appear here.</EmptyState>}
      </section>
      <section className="surface recent-tickets"><div className="section-heading"><div><p className="eyebrow">SUPPORT</p><h2>Recent queries</h2></div><Link className="inline-link" to="/tickets">All tickets <ArrowUpRight size={15} /></Link></div>
        {state.tickets.length ? <div className="ticket-mini-list">{state.tickets.slice(0, 4).map((ticket) => <Link className="ticket-mini-row" to={`/tickets/${ticket._id}`} key={ticket._id}>
          <span className="ticket-mini-icon"><CircleHelp size={16} /></span><span className="ticket-mini-copy"><strong>{ticket.subject}</strong><small>{ticket.category?.replaceAll('_', ' ') || 'Uncategorized'}</small></span><StatusBadge value={ticket.status} />
        </Link>)}</div> : <EmptyState title="No support queries yet">Start a conversation with our team whenever you need help.</EmptyState>}
      </section>
    </div>
    <p className="snapshot-note">Royalty amounts shown are taken from the latest data provided for your books.</p>
  </>;
}
