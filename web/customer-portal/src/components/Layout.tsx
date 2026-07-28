import { AppBar, Avatar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';

export function Layout({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary">
        <Toolbar>
          <SupportAgentIcon sx={{ mr: 1.5 }} />
          <Typography variant="h6" component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', flexGrow: 1 }}>
            TrustDesk · Help Center
          </Typography>
          {profile && (
            <Stack direction="row" spacing={2} alignItems="center">
              <Button color="inherit" component={RouterLink} to="/">
                Complaints
              </Button>
              <Button color="inherit" component={RouterLink} to="/orders">
                Orders
              </Button>
              <Button color="inherit" component={RouterLink} to="/tickets/new" variant="outlined">
                New complaint
              </Button>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar sx={{ width: 30, height: 30, bgcolor: 'secondary.main', fontSize: 14 }}>
                  {profile.name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="body2">{profile.name}</Typography>
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
      <Container maxWidth="md" sx={{ py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
