import { AlertCircle, LoaderCircle } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
    {action && <div className="page-action">{action}</div>}
  </div>;
}

export function LoadingState({ label = 'Loading your information…' }) {
  return <div className="state-card" role="status"><LoaderCircle className="spin" size={20} /> {label}</div>;
}

export function ErrorState({ message, onRetry }) {
  return <div className="state-card state-error" role="alert"><AlertCircle size={20} /><span>{message}</span>
    {onRetry && <button type="button" className="text-button" onClick={onRetry}>Try again</button>}
  </div>;
}

export function EmptyState({ title, children, action }) {
  return <div className="empty-state"><div className="empty-mark">✦</div><h3>{title}</h3>
    {children && <p>{children}</p>}{action}</div>;
}

export function StatusBadge({ value }) {
  const slug = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return <span className={`badge badge-${slug}`}>{value || 'Unknown'}</span>;
}

export function Currency({ value }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  return <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))}</span>;
}

export function MetricCard({ label, value, detail, icon: Icon, tone = 'green' }) {
  return <article className={`metric-card tone-${tone}`}><div className="metric-top"><span>{label}</span>
    {Icon && <span className="metric-icon"><Icon size={18} /></span>}</div><strong>{value}</strong>
    {detail && <small>{detail}</small>}</article>;
}
