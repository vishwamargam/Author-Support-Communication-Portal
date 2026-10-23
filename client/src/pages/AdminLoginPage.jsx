import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../services/api.js';

export default function AdminLoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (!loading && user?.role === 'admin') return <Navigate to="/admin" replace />;

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const authenticatedUser = await login(email, password);
      if (authenticatedUser.role !== 'admin') { setError('This sign-in is for BookLeaf administrators.'); return; }
      navigate('/admin', { replace: true });
    } catch (err) { setError(errorMessage(err)); }
    finally { setSubmitting(false); }
  }

  return <main className="admin-login-page">
    <div className="admin-login-card">
      <div className="admin-login-brand"><span className="brand-mark">B</span><div><strong>BookLeaf</strong><small>SUPPORT DESK</small></div></div>
      <div className="admin-login-icon"><ShieldCheck size={21} /></div>
      <p className="eyebrow">ADMINISTRATOR ACCESS</p><h1>Welcome to the support desk</h1>
      <p className="admin-login-copy">Sign in with your BookLeaf administrator account to manage author support tickets.</p>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="admin-email">Work email</label>
        <input id="admin-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@bookleaf.test" />
        <div className="label-row"><label htmlFor="admin-password">Password</label><span><LockKeyhole size={13} /> Secure session</span></div>
        <input id="admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        <button className="primary-button login-submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in to support desk'} <ArrowRight size={17} /></button>
      </form>
      <p className="admin-login-foot">Administrator credentials are configured by your BookLeaf system owner.</p>
    </div>
  </main>;
}
