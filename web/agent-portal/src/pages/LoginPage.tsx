import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export function LoginPage() {
  const { profile, login } = useAuth();
  const navigate = useNavigate();
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
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Card sx={{ width: 420, maxWidth: '100%' }} elevation={6}>
        <CardContent sx={{ p: 4 }}>
          <Stack alignItems="center" spacing={1} mb={3}>
            <ShieldMoonIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h5">Agent Console</Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in with your support-agent credentials
            </Typography>
          </Stack>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={submit}>
            <Stack spacing={2}>
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
                Sign in
              </Button>
            </Stack>
          </form>

          <Alert severity="info" sx={{ mt: 3 }}>
            Demo agents: <strong>agent@trustdesk.io</strong> · <strong>supervisor@trustdesk.io</strong> — password{' '}
            <strong>Password123!</strong>
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
}
