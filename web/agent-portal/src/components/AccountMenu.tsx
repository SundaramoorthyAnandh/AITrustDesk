import { useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ValidatedTextField, validators, firstError, type Validator } from './ValidatedTextField';

const currentRules: Validator[] = [validators.required('Current password is required')];
const newRules: Validator[] = [validators.required('New password is required'), validators.minLen(8)];

/** Avatar button that opens an account menu (reset password / sign out). */
export function AccountMenu() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  if (!profile) return null;

  return (
    <>
      <Tooltip title={profile.name}>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} size="small" sx={{ p: 0.5 }}>
          <Avatar
            sx={{
              width: 34,
              height: 34,
              fontSize: 14,
              fontWeight: 700,
              color: '#0B1020',
              background: 'linear-gradient(135deg, #22D3EE, #6366F1)',
            }}
          >
            {profile.name.charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
      >
        <Stack sx={{ px: 2, py: 1.25 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
            {profile.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {profile.email} · {profile.role}
          </Typography>
        </Stack>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setResetOpen(true);
          }}
        >
          <ListItemIcon>
            <LockResetIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Reset password</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await logout();
            navigate('/login');
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>

      <ResetPasswordDialog open={resetOpen} onClose={() => setResetOpen(false)} />
    </>
  );
}

function ResetPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const valid = !firstError(current, currentRules) && !firstError(next, newRules);

  const reset = () => {
    setCurrent('');
    setNext('');
    setError(null);
    setDone(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setDone(true);
      // All sessions were revoked server-side — sign out and back in.
      setTimeout(async () => {
        await logout();
        navigate('/login');
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy && !done) {
          reset();
          onClose();
        }
      }}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4 } } }}
    >
      <DialogTitle sx={{ fontWeight: 800 }}>Reset password</DialogTitle>
      <form onSubmit={submit} noValidate>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2}>
            {done ? (
              <Alert severity="success">Password updated. Signing you out…</Alert>
            ) : (
              <>
                {error && <Alert severity="error">{error}</Alert>}
                <Typography variant="body2" color="text.secondary">
                  For your security, changing your password signs out all sessions.
                </Typography>
                <ValidatedTextField
                  label="Current password"
                  type="password"
                  value={current}
                  onChange={setCurrent}
                  rules={currentRules}
                  fullWidth
                />
                <ValidatedTextField
                  label="New password"
                  type="password"
                  value={next}
                  onChange={setNext}
                  rules={newRules}
                  fullWidth
                  helperText="At least 8 characters"
                />
              </>
            )}
          </Stack>
        </DialogContent>
        {!done && (
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={busy || !valid}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </DialogActions>
        )}
      </form>
    </Dialog>
  );
}
