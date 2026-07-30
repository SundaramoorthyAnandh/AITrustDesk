import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';
import { AccountMenu } from './AccountMenu';

const NAV = [
  { label: 'Complaints', to: '/' },
  { label: 'Orders', to: '/orders' },
  { label: 'Warranty Info', to: '/warranty-info' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
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

          {profile && <AccountMenu />}
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        {children}
      </Container>
    </Box>
  );
}
