import { AppBar, Avatar, Box, Button, Chip, Container, Stack, Toolbar, Typography } from '@mui/material';
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon';
import AssessmentIcon from '@mui/icons-material/Assessment';
import InboxIcon from '@mui/icons-material/Inbox';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';

const NAV = [
  { label: 'Queue', to: '/', icon: <InboxIcon sx={{ fontSize: 18 }} /> },
  { label: 'Evaluations', to: '/eval', icon: <AssessmentIcon sx={{ fontSize: 18 }} /> },
];

export function Layout({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (to: string) => (to === '/' ? pathname === '/' || pathname.startsWith('/tickets') : pathname.startsWith(to));

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2, py: 0.5 }}>
          {/* Brand */}
          <Stack
            direction="row"
            spacing={1.25}
            alignItems="center"
            component={RouterLink}
            to="/"
            sx={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2.5,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #6366F1, #22D3EE)',
                boxShadow: '0 6px 18px -6px rgba(99,102,241,.9)',
              }}
            >
              <ShieldMoonIcon sx={{ fontSize: 21, color: '#0B1020' }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Trust Desk</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                Agent Console
              </Typography>
            </Box>
          </Stack>

          {/* Nav */}
          <Stack direction="row" spacing={0.5} sx={{ ml: 2, display: { xs: 'none', sm: 'flex' } }}>
            {NAV.map((n) => (
              <Button
                key={n.to}
                component={RouterLink}
                to={n.to}
                size="small"
                startIcon={n.icon}
                sx={{
                  color: isActive(n.to) ? 'primary.light' : 'text.secondary',
                  bgcolor: isActive(n.to) ? 'rgba(129,140,248,0.14)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(129,140,248,0.12)' },
                }}
              >
                {n.label}
              </Button>
            ))}
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          {profile && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Stack direction="row" spacing={1} alignItems="center">
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
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Typography variant="body2" sx={{ fontWeight: 650, lineHeight: 1.15 }}>
                    {profile.name}
                  </Typography>
                  <Chip
                    label={profile.role}
                    size="small"
                    sx={{ height: 17, fontSize: 10, bgcolor: 'rgba(255,255,255,0.08)', fontWeight: 700 }}
                  />
                </Box>
              </Stack>
              <Button
                size="small"
                sx={{ color: 'text.secondary' }}
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
              >
                Sign out
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        {children}
      </Container>
    </Box>
  );
}
