import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { Currency, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/Ui.jsx';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function BooksPage() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setBooks((await api.get('/books')).data.data.books); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return <>
    <PageHeader eyebrow="YOUR CATALOGUE" title="My books" description="Your BookLeaf titles and the latest supplied royalty details." action={<Link to="/support/new" className="secondary-button">Ask about a book <ArrowUpRight size={16} /></Link>} />
    {loading ? <LoadingState label="Loading your books…" /> : error ? <ErrorState message={error} onRetry={load} /> : books.length === 0 ?
      <div className="surface"><EmptyState title="Your catalogue is empty">Book details will appear here when they’re available.</EmptyState></div> :
      <section className="surface table-surface"><div className="table-meta"><div className="table-title"><span className="table-icon"><BookOpen size={18} /></span><div><strong>Your catalogue</strong><span>{books.length} {books.length === 1 ? 'title' : 'titles'}</span></div></div><span className="table-caption">Royalty figures from supplied records</span></div>
        <div className="table-scroll"><table className="data-table books-table"><thead><tr>
          <th>Book</th><th>ISBN</th><th>Genre</th><th>Publication date</th><th>Status</th><th>MRP</th><th>Copies sold</th><th>Royalty earned</th><th>Royalty paid</th><th>Royalty pending</th>
        </tr></thead><tbody>{books.map((book) => <tr key={book._id}>
          <td><div className="table-book"><span className="mini-cover">{book.title?.slice(0, 1)}</span><strong>{book.title || 'Untitled book'}</strong></div></td>
          <td className="mono">{book.isbn || '—'}</td><td>{book.genre || '—'}</td><td>{formatDate(book.publicationDate)}</td>
          <td><StatusBadge value={book.status} /></td><td><Currency value={book.mrp} /></td>
          <td>{book.totalCopiesSold == null ? '—' : new Intl.NumberFormat('en-IN').format(book.totalCopiesSold)}</td>
          <td><Currency value={book.totalRoyaltyEarned} /></td><td><Currency value={book.royaltyPaid} /></td>
          <td className="pending-cell"><Currency value={book.royaltyPending} /></td>
        </tr>)}</tbody></table></div>
        <div className="table-footnote">A dash means the source record did not include a value. Royalty amounts are displayed as supplied.</div>
      </section>}
  </>;
}
