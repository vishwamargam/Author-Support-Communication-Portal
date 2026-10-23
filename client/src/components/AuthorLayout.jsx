import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronDown, CircleHelp, LayoutDashboard, LogOut, Ticket } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import RealtimeIndicator from './RealtimeIndicator.jsx';

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/books', label: 'My books', icon: BookOpen },
  { to: '/tickets', label: 'My tickets', icon: Ticket },
  { to: '/support/new', label: 'Submit a query', icon: CircleHelp }
];

export default function AuthorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  async function handleLogout() { await logout(); navigate('/login', { replace: true }); }

  return <div className="portal-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">B</div><div><strong>BookLeaf</strong><span>AUTHOR PORTAL</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'My tickets' && <ChevronDown className="nav-chevron" size={14} />}
        </NavLink>)}
      </nav>
      <div className="sidebar-help"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong>
        <p>Our support team is here to help with your publishing journey.</p>
        <button onClick={() => navigate('/support/new')}>Contact support <span>↗</span></button>
      </div>
      <div className="sidebar-bottom"><span className="online-dot" /> BookLeaf Author Support <span className="version">v1.0</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Author workspace <span>/</span> <b>BookLeaf Support</b></div>
        <RealtimeIndicator />
        <div className="profile-menu"><div className="avatar">{user?.name?.slice(0, 1) || 'A'}</div>
          <div className="profile-copy"><strong>{user?.name}</strong><span>Author account</span></div>
          <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={handleLogout}><LogOut size={17} /></button>
        </div>
      </header>
      <div className="content"><Outlet /></div>
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`}>
        <Icon size={19} /><span>{label === 'Overview' ? 'Home' : label.replace('My ', '')}</span>
      </NavLink>)}
    </nav>
  </div>;
}
