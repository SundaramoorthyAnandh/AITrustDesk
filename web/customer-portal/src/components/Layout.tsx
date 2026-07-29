import { AppBar, Avatar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import AddIcon from '@mui/icons-material/Add';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';

const NAV = [
  { label: 'Complaints', to: '/' },
  { label: 'Orders', to: '/orders' },
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
                background: 'linear-gradient(135deg, #0EA5A4, #7C5CFF)',
                boxShadow: '0 6px 16px -6px rgba(14,165,164,.7)',
              }}
            >
              <SupportAgentIcon sx={{ fontSize: 21, color: '#fff' }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Trust Desk</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                Help Center
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
                sx={{
                  color: isActive(n.to) ? 'primary.dark' : 'text.secondary',
                  bgcolor: isActive(n.to) ? 'rgba(14,165,164,0.12)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(14,165,164,0.1)' },
                }}
              >
                {n.label}
              </Button>
            ))}
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          {profile && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button variant="contained" size="small" startIcon={<AddIcon />} component={RouterLink} to="/tickets/new">
                New complaint
              </Button>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar
                  sx={{
                    width: 34,
                    height: 34,
                    fontSize: 14,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #7C5CFF, #0EA5A4)',
                  }}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 600, display: { xs: 'none', md: 'block' } }}>
                  {profile.name}
                </Typography>
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

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        {children}
      </Container>
    </Box>
  );
}
