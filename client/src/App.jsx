import { Navigate, Route, Routes } from 'react-router-dom';
import AuthorLayout from './components/AuthorLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import BooksPage from './pages/BooksPage.jsx';
import NewTicketPage from './pages/NewTicketPage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import TicketDetailPage from './pages/TicketDetailPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import AdminQueuePage from './pages/AdminQueuePage.jsx';
import AdminTicketDetailPage from './pages/AdminTicketDetailPage.jsx';

export default function App() {
  if (__BOOKLEAF_PORTAL__ === 'author') return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute role="author" />}>
      <Route element={<AuthorLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/support/new" element={<NewTicketPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;

  if (__BOOKLEAF_PORTAL__ === 'admin') return <Routes>
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route element={<ProtectedRoute role="admin" />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminQueuePage />} />
        <Route path="tickets/:ticketId" element={<AdminTicketDetailPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes>;

  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route element={<ProtectedRoute role="admin" />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminQueuePage />} />
        <Route path="tickets/:ticketId" element={<AdminTicketDetailPage />} />
      </Route>
    </Route>
    <Route element={<ProtectedRoute />}>
      <Route element={<AuthorLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="books" element={<BooksPage />} />
        <Route path="support/new" element={<NewTicketPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
