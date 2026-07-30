import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { ValidatedTextField, validators, firstError, type Validator } from '../components/ValidatedTextField';

const emailRules: Validator[] = [validators.required('Email is required'), validators.email()];
const passwordRules: Validator[] = [validators.required('Password is required')];

export function LoginPage() {
  const { profile, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile) return <Navigate to="/" replace />;

  const formValid = !firstError(email, emailRules) && !firstError(password, passwordRules);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 440, maxWidth: '100%', borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          <Stack alignItems="center" spacing={1.5} mb={3.5}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 3.5,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #6366F1, #22D3EE)',
                boxShadow: '0 10px 28px -8px rgba(99,102,241,.9)',
              }}
            >
              <ShieldMoonIcon sx={{ fontSize: 30, color: '#0B1020' }} />
            </Box>
            <Box textAlign="center">
              <Typography variant="h5">Agent Console</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Sign in with your support-agent credentials
              </Typography>
            </Box>
          </Stack>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={submit} noValidate>
            <Stack spacing={2}>
              <ValidatedTextField label="Email" type="email" value={email} onChange={setEmail} rules={emailRules} required fullWidth />
              <ValidatedTextField
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                rules={passwordRules}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || !formValid}>
                Sign in
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
