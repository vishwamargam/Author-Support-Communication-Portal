import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState } from './Ui.jsx';

export default function ProtectedRoute({ role = 'author' }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Restoring your session…" />;
  const loginPath = role === 'admin' ? '/admin/login' : '/login';
  return user?.role === role ? <Outlet /> : <Navigate to={loginPath} replace />;
}
