import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import RealtimeIndicator from './RealtimeIndicator.jsx';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  async function handleLogout() {
    try { await logout(); } finally { navigate('/admin/login', { replace: true }); }
  }
  return <div className="portal-shell admin-shell">
    <aside className="sidebar admin-sidebar">
      <div className="brand"><div className="brand-mark">B</div><div><strong>BookLeaf</strong><span>SUPPORT DESK</span></div></div>
      <div className="workspace-label">ADMIN WORKSPACE</div>
      <nav className="side-nav" aria-label="Admin navigation">
        <NavLink to="/admin" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><ClipboardList size={18} /><span>Ticket queue</span></NavLink>
      </nav>
      <div className="admin-sidebar-note"><ShieldCheck size={17} /><strong>Support operations</strong><p>Author conversations, assignments, and internal notes stay in their appropriate places.</p></div>
      <div className="sidebar-bottom"><span className="online-dot" /> Admin access <span className="version">v1.0</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Support desk <span>/</span> <b>Admin workspace</b></div>
        <RealtimeIndicator />
        <div className="profile-menu"><div className="avatar admin-avatar">{user?.name?.slice(0, 1) || 'A'}</div>
          <div className="profile-copy"><strong>{user?.name}</strong><span>Administrator</span></div>
          <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={handleLogout}><LogOut size={17} /></button>
        </div>
      </header>
      <div className="content"><Outlet /></div>
    </main>
  </div>;
}
