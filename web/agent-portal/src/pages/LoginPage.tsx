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

          <Alert severity="info" sx={{ mt: 3 }}>
            Demo agents: <strong>agent@trustdesk.io</strong> · <strong>supervisor@trustdesk.io</strong> — password{' '}
            <strong>Password123!</strong>
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
}
