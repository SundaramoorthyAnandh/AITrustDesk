import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api, type TicketRow } from '../api';
import { CategoryChip, Mono, PriorityChip, StatusChip, formatDate } from '../ui';

const STATUSES = ['', 'open', 'triaged', 'awaiting_agent', 'awaiting_customer', 'resolved', 'closed'];
const CATEGORIES = ['', 'shipping', 'refund', 'warranty', 'billing', 'account_security', 'general'];

export function QueuePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [escalated, setEscalated] = useState('');

  useEffect(() => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (category) params.category = category;
    if (escalated) params.escalated = escalated;
    setRows(null);
    api
      .tickets(params)
      .then((r) => setRows(r.tickets))
      .catch((e) => setError(e.message));
  }, [status, category, escalated]);

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Ticket queue</Typography>

      <Stack direction="row" spacing={2}>
        <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} size="small" sx={{ minWidth: 160 }}>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s === '' ? 'All' : s.replace(/_/g, ' ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} size="small" sx={{ minWidth: 180 }}>
          {CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {c === '' ? 'All' : c.replace(/_/g, ' ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Escalated" value={escalated} onChange={(e) => setEscalated(e.target.value)} size="small" sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Escalated only</MenuItem>
        </TextField>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {rows && (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ticket</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Opened</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((t) => (
                <TableRow
                  key={t.id}
                  hover
                  sx={{ cursor: 'pointer', ...(t.escalated ? { bgcolor: 'rgba(248,113,113,0.08)' } : {}) }}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography variant="body2" fontWeight={650} noWrap title={t.subject ?? ''}>
                      {t.subject ?? '(no subject)'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.75 }} title={t.id}>
                      <Mono>{t.id.slice(0, 14)}…</Mono>
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {t.customerName}
                    </Typography>
                  </TableCell>
                  <TableCell><CategoryChip category={t.category} /></TableCell>
                  <TableCell><PriorityChip priority={t.priority} /></TableCell>
                  <TableCell><StatusChip status={t.status} /></TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {formatDate(t.createdAt)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
                      No tickets match these filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
