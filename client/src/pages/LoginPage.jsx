import { useState } from 'react';
import { ArrowRight, BookOpenCheck, Leaf, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../services/api.js';

export default function LoginPage() {
  const { login, startupError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const user = await login(email, password);
      if (user.role !== 'author') { setError('This sign-in is for author accounts.'); return; }
      navigate('/', { replace: true });
    } catch (err) { setError(errorMessage(err)); }
    finally { setSubmitting(false); }
  }

  return <main className="login-page">
    <section className="login-visual">
      <div className="login-brand"><span className="brand-mark">B</span><strong>BookLeaf</strong></div>
      <div className="visual-copy"><span className="visual-kicker"><Leaf size={15} /> YOUR PUBLISHING PARTNER</span>
        <h1>Your stories<br />deserve to <em>grow.</em></h1>
        <p>One calm place to follow your books, royalties, and conversations with the BookLeaf team.</p>
      </div>
      <div className="book-art" aria-hidden="true"><div className="sun-disc" /><div className="book book-back" /><div className="book book-front"><span>YOUR<br />NEXT<br />CHAPTER</span><i>BOOKLEAF</i></div><div className="art-leaf leaf-one" /><div className="art-leaf leaf-two" /></div>
      <div className="visual-footer">A better way to write what comes next <span>✦</span></div>
    </section>
    <section className="login-panel"><div className="login-form-wrap">
      <div className="login-mobile-brand"><span className="brand-mark">B</span><strong>BookLeaf</strong></div>
      <div className="login-icon"><BookOpenCheck size={21} /></div>
      <p className="eyebrow">AUTHOR PORTAL</p><h2>Welcome back</h2><p className="login-subtitle">Sign in to manage your books and get the support you need.</p>
      {(error || startupError) && <div className="form-alert" role="alert">{error || startupError}</div>}
      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <div className="label-row"><label htmlFor="password">Password</label><span><LockKeyhole size={13} /> Secure sign in</span></div>
        <input id="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        <button className="primary-button login-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button>
      </form>
      <p className="login-contact">Having trouble signing in? <a href="mailto:support@bookleafpublishing.com">Contact support</a></p>
    </div><footer className="login-legal">© {new Date().getFullYear()} BookLeaf Publishing <span>Privacy</span><span>Help</span></footer></section>
  </main>;
}
