import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Stack, Tab, Tabs, Typography } from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { ValidatedTextField, validators, firstError, type Validator } from '../components/ValidatedTextField';

const nameRules: Validator[] = [validators.required('Name is required'), validators.maxLen(120)];
const emailRules: Validator[] = [validators.required('Email is required'), validators.email()];

/** Sign-in form — its own state, so nothing leaks to the Create-account tab. */
function SignInForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordRules: Validator[] = [validators.required('Password is required')];
  const valid = !firstError(email, emailRules) && !firstError(password, passwordRules);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
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
    <form onSubmit={submit} noValidate>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <ValidatedTextField label="Email" type="email" value={email} onChange={setEmail} rules={emailRules} required fullWidth />
        <ValidatedTextField label="Password" type="password" value={password} onChange={setPassword} rules={passwordRules} required fullWidth />
        <Button type="submit" variant="contained" size="large" disabled={busy || !valid}>
          Sign in
        </Button>
      </Stack>
    </form>
  );
}

/** Create-account form — independent state; enforces a strong password. */
function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordRules: Validator[] = [validators.required('Password is required'), validators.minLen(8)];
  const valid =
    !firstError(name, nameRules) && !firstError(email, emailRules) && !firstError(password, passwordRules);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await register(name, email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <ValidatedTextField label="Full name" value={name} onChange={setName} rules={nameRules} required fullWidth />
        <ValidatedTextField label="Email" type="email" value={email} onChange={setEmail} rules={emailRules} required fullWidth />
        <ValidatedTextField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          rules={passwordRules}
          required
          fullWidth
          helperText="At least 8 characters"
        />
        <Button type="submit" variant="contained" size="large" disabled={busy || !valid}>
          Create account
        </Button>
      </Stack>
    </form>
  );
}

export function LoginPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(0);

  if (profile) return <Navigate to="/" replace />;

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 440, maxWidth: '100%', borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          <Stack alignItems="center" spacing={1.5} mb={3}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 3.5,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #0EA5A4, #7C5CFF)',
                boxShadow: '0 10px 26px -8px rgba(14,165,164,.75)',
              }}
            >
              <SupportAgentIcon sx={{ fontSize: 30, color: '#fff' }} />
            </Box>
            <Box textAlign="center">
              <Typography variant="h5">Trust Desk</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Help Center
              </Typography>
            </Box>
          </Stack>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 3 }}>
            <Tab label="Sign in" />
            <Tab label="Create account" />
          </Tabs>

          {/* Only the active tab's form is mounted → the two forms are fully independent. */}
          {tab === 0 ? <SignInForm /> : <RegisterForm />}
        </CardContent>
      </Card>
    </Box>
  );
}
