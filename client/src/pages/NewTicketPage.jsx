import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Paperclip, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../services/api.js';
import { ErrorState, LoadingState, PageHeader } from '../components/Ui.jsx';

export default function NewTicketPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bookId, setBookId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadBooks() {
    setLoading(true); setLoadError('');
    try { setBooks((await api.get('/books')).data.data.books); }
    catch (err) { setLoadError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadBooks(); }, []);

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const response = await api.post('/tickets', { bookId: bookId || null, subject, description });
      navigate(`/tickets/${response.data.data.ticket._id}`, { replace: true, state: { created: true } });
    } catch (err) { setError(errorMessage(err)); }
    finally { setSubmitting(false); }
  }

  function chooseAttachment(event) {
    const file = event.target.files?.[0] || null;
    setAttachmentError('');
    if (file && file.size > 10 * 1024 * 1024) {
      setAttachment(null);
      setAttachmentError('Choose a file smaller than 10 MB.');
      event.target.value = '';
      return;
    }
    if (file && !/\.(pdf|doc|docx|jpe?g|png)$/i.test(file.name)) {
      setAttachment(null);
      setAttachmentError('Choose a PDF, DOC, DOCX, JPG, or PNG file.');
      event.target.value = '';
      return;
    }
    setAttachment(file);
  }

  return <>
    <Link to="/tickets" className="back-link"><ArrowLeft size={15} /> Back to my tickets</Link>
    <PageHeader eyebrow="AUTHOR SUPPORT" title="Submit a support query" description="Tell us what’s on your mind. A member of our team will get back to you." />
    {loading ? <LoadingState label="Loading your books…" /> : loadError ? <ErrorState message={loadError} onRetry={loadBooks} /> :
      <div className="form-layout"><form className="surface ticket-form" onSubmit={handleSubmit}>
        <div className="form-section-title"><span className="step-number">01</span><div><h2>Tell us how we can help</h2><p>Share a few details so we can point your query to the right team.</p></div></div>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <label htmlFor="related-book">What is this about?</label>
        <select id="related-book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">General / Account Level</option>
          {books.map((book) => <option key={book._id} value={book._id}>{book.title}</option>)}
        </select>
        <label htmlFor="subject">Subject <span className="required-mark">*</span></label>
        <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={180} required placeholder="A short summary of your query" />
        <div className="field-hint"><span>Keep it clear and specific</span><span>{subject.length}/180</span></div>
        <label htmlFor="description">Detailed description <span className="required-mark">*</span></label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={10000} required rows={7} placeholder="Include any details that will help us understand your query…" />
        <div className="field-hint"><span>Please include at least 10 characters</span><span>{description.length}/10000</span></div>
        <div className="attachment-box"><Paperclip size={18} /><div className="attachment-copy"><strong>Attach a file <span>(optional)</span></strong><small>{attachment ? `${attachment.name} · selected, not uploaded` : 'PDF, DOC, DOCX, JPG or PNG · up to 10 MB'}</small></div>
          <label className="file-button">Browse<input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={chooseAttachment} /></label>
        </div>
        {attachmentError && <p className="attachment-note form-file-error" role="alert">{attachmentError}</p>}
        <p className="attachment-note">File selection is available in this form; attachment upload storage is not enabled yet.</p>
        <div className="form-footer"><span><ShieldCheck size={16} /> Your query is visible only to you and BookLeaf Support.</span>
          <button className="primary-button" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit query'} <ArrowRight size={16} /></button></div>
      </form>
        <aside className="form-aside"><div className="aside-illustration">✳</div><p className="eyebrow">HERE FOR YOU</p><h3>Every good story has a support team.</h3><p>We’ll keep your query in one place so you can follow every update and reply.</p>
          <div className="aside-rule" /><span className="aside-small">Typical response time</span><strong className="response-time">Within 1–2 business days</strong>
        </aside></div>}
  </>;
}
