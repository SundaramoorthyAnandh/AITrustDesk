import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Breadcrumbs,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { api, type Order, type Reply, type Ticket } from '../api';
import { PriorityChip, StatusChip, formatDate, money } from '../ui';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ ticket: Ticket; order: Order | null; replies: Reply[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.ticket(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );

  const { ticket, order, replies } = data;

  return (
    <Stack spacing={3}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/" underline="hover">
          My complaints
        </Link>
        <Typography color="text.primary">{ticket.id}</Typography>
      </Breadcrumbs>

      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h5">{ticket.subject ?? '(no subject)'}</Typography>
          <Stack direction="row" spacing={1}>
            <StatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Opened {formatDate(ticket.createdAt)}
        </Typography>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            Your message
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{ticket.body}</Typography>
          {order && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary">
                Related order
              </Typography>
              <Typography sx={{ mt: 0.5 }}>
                {order.id} · {order.itemName} · {money(order.amountCents, order.currency)} · ordered{' '}
                {formatDate(order.orderDate)} · {order.status}
              </Typography>
            </>
          )}
        </CardContent>
      </Card>

      <Box>
        <Typography variant="h6" mb={1}>
          Responses from support
        </Typography>
        {replies.length === 0 ? (
          <Alert severity="info">
            No response yet. Our support team is reviewing your complaint and will reply here.
          </Alert>
        ) : (
          <Stack spacing={2}>
            {replies.map((r) => (
              <Card key={r.id} variant="outlined" sx={{ borderColor: 'primary.light' }}>
                <CardContent>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{r.text}</Typography>
                  {r.citations.length > 0 && (
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                        Based on policy:
                      </Typography>
                      {r.citations.map((c) => (
                        <Chip key={c} label={c} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {formatDate(r.createdAt)}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
