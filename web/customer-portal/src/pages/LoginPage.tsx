import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export function LoginPage() {
  const { profile, login, register } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 0) await login(email, password);
      else await register(name, email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Card sx={{ width: 420, maxWidth: '100%' }} elevation={3}>
        <CardContent sx={{ p: 4 }}>
          <Stack alignItems="center" spacing={1} mb={2}>
            <SupportAgentIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h5">TrustDesk Help Center</Typography>
            <Typography variant="body2" color="text.secondary">
              File and track your support complaints
            </Typography>
          </Stack>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 2 }}>
            <Tab label="Sign in" />
            <Tab label="Create account" />
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={submit}>
            <Stack spacing={2}>
              {tab === 1 && (
                <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
              )}
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={busy}>
                {tab === 0 ? 'Sign in' : 'Create account'}
              </Button>
            </Stack>
          </form>

          {tab === 0 && (
            <Alert severity="info" sx={{ mt: 3 }}>
              Demo login: <strong>alice.johnson@example.com</strong> / <strong>Password123!</strong>
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
