import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { api, type Ticket } from '../api';
import { Mono, PriorityChip, StatusChip, formatDate } from '../ui';

export function DashboardPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .tickets()
      .then((r) => setTickets(r.tickets))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">My complaints</Typography>
        <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/tickets/new">
          New complaint
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!tickets && !error && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {tickets && tickets.length === 0 && (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">You have no complaints yet. Create one to get started.</Typography>
        </Card>
      )}

      <Stack spacing={1.5}>
        {tickets?.map((t) => (
          <Card
            key={t.id}
            sx={{ '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 40px -18px rgba(11,18,32,.28)' } }}
          >
            <CardActionArea component={RouterLink} to={`/tickets/${t.id}`} sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1">{t.subject ?? '(no subject)'}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.55 }}>
                    {t.body.length > 120 ? `${t.body.slice(0, 120)}…` : t.body}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25, opacity: 0.8 }}>
                    <Mono>{t.id.slice(0, 12)}…</Mono> · opened {formatDate(t.createdAt)}
                  </Typography>
                </Box>
                <Stack spacing={1} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                  <StatusChip status={t.status} />
                  <PriorityChip priority={t.priority} />
                </Stack>
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
