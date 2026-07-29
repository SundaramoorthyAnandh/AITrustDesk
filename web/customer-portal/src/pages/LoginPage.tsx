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
  Typography,
} from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { ValidatedTextField, validators, firstError, type Validator } from '../components/ValidatedTextField';

const nameRules: Validator[] = [validators.required('Name is required'), validators.maxLen(120)];
const emailRules: Validator[] = [validators.required('Email is required'), validators.email()];

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

  const isRegister = tab === 1;
  // Registration enforces a strong password; login only needs a non-empty one.
  const passwordRules: Validator[] = isRegister
    ? [validators.required('Password is required'), validators.minLen(8)]
    : [validators.required('Password is required')];

  const formValid =
    !firstError(email, emailRules) &&
    !firstError(password, passwordRules) &&
    (!isRegister || !firstError(name, nameRules));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(name, email, password);
      else await login(email, password);
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

          <Tabs
            value={tab}
            onChange={(_, v) => {
              setTab(v);
              setError(null);
            }}
            variant="fullWidth"
            sx={{ mb: 2 }}
          >
            <Tab label="Sign in" />
            <Tab label="Create account" />
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={submit} noValidate>
            <Stack spacing={2}>
              {isRegister && (
                <ValidatedTextField label="Full name" value={name} onChange={setName} rules={nameRules} required fullWidth />
              )}
              <ValidatedTextField label="Email" type="email" value={email} onChange={setEmail} rules={emailRules} required fullWidth />
              <ValidatedTextField
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                rules={passwordRules}
                required
                fullWidth
                helperText={isRegister ? 'At least 8 characters' : undefined}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || !formValid}>
                {isRegister ? 'Create account' : 'Sign in'}
              </Button>
            </Stack>
          </form>

          {!isRegister && (
            <Alert severity="info" sx={{ mt: 3 }}>
              Demo login: <strong>alice.johnson@example.com</strong> / <strong>Password123!</strong>
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
