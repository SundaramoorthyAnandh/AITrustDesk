import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewComplaintPage } from './pages/NewComplaintPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { WarrantyInfoPage } from './pages/WarrantyInfoPage';

function Protected({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/tickets/new" element={<Protected><NewComplaintPage /></Protected>} />
      <Route path="/tickets/:id" element={<Protected><TicketDetailPage /></Protected>} />
      <Route path="/orders" element={<Protected><OrdersPage /></Protected>} />
      <Route path="/orders/new" element={<Protected><NewOrderPage /></Protected>} />
      <Route path="/warranty-info" element={<Protected><WarrantyInfoPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
