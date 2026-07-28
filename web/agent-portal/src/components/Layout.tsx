import { AppBar, Avatar, Box, Button, Chip, Container, Stack, Toolbar, Typography } from '@mui/material';
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';

export function Layout({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" enableColorOnDark sx={{ bgcolor: 'background.paper' }}>
        <Toolbar>
          <ShieldMoonIcon color="primary" sx={{ mr: 1.5 }} />
          <Typography variant="h6" component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', flexGrow: 1 }}>
            TrustDesk · Agent Console
          </Typography>
          {profile && (
            <Stack direction="row" spacing={2} alignItems="center">
              <Button color="inherit" component={RouterLink} to="/" >
                Queue
              </Button>
              <Button color="inherit" startIcon={<AssessmentIcon />} component={RouterLink} to="/eval">
                Evaluations
              </Button>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 14 }}>
                  {profile.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="body2" lineHeight={1.1}>
                    {profile.name}
                  </Typography>
                  <Chip label={profile.role} size="small" sx={{ height: 16, fontSize: 10 }} />
                </Box>
              </Stack>
              <Button
                color="inherit"
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
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  );
}
