import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { QueuePage } from './pages/QueuePage';
import { TicketWorkspacePage } from './pages/TicketWorkspacePage';
import { EvalPage } from './pages/EvalPage';

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
      <Route path="/" element={<Protected><QueuePage /></Protected>} />
      <Route path="/tickets/:id" element={<Protected><TicketWorkspacePage /></Protected>} />
      <Route path="/eval" element={<Protected><EvalPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
