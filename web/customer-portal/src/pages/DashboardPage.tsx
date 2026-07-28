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
import { PriorityChip, StatusChip, formatDate } from '../ui';

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
          <Card key={t.id} variant="outlined">
            <CardActionArea component={RouterLink} to={`/tickets/${t.id}`} sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {t.subject ?? '(no subject)'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t.body.length > 120 ? `${t.body.slice(0, 120)}…` : t.body}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.id} · opened {formatDate(t.createdAt)}
                  </Typography>
                </Box>
                <Stack spacing={1} alignItems="flex-end">
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
