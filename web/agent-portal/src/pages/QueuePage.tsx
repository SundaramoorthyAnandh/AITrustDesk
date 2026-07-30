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

/** Progressive column disclosure — hide low-priority columns on narrow screens. */
const SM_UP = { display: { xs: 'none', sm: 'table-cell' } } as const;
const MD_UP = { display: { xs: 'none', md: 'table-cell' } } as const;
const LG_UP = { display: { xs: 'none', lg: 'table-cell' } } as const;

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

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} size="small" sx={{ minWidth: 160, flex: { xs: '1 1 45%', sm: '0 0 auto' } }}>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s === '' ? 'All' : s.replace(/_/g, ' ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} size="small" sx={{ minWidth: 180, flex: { xs: '1 1 45%', sm: '0 0 auto' } }}>
          {CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {c === '' ? 'All' : c.replace(/_/g, ' ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Escalated" value={escalated} onChange={(e) => setEscalated(e.target.value)} size="small" sx={{ minWidth: 140, flex: { xs: '1 1 45%', sm: '0 0 auto' } }}>
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
        // Table stays readable on small screens: low-priority columns drop out at
        // each breakpoint (their data folds into the first cell), and whatever is
        // still too wide scrolls horizontally instead of being clipped.
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: { xs: 0, sm: 560 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Ticket</TableCell>
                <TableCell sx={SM_UP}>Customer</TableCell>
                <TableCell sx={MD_UP}>Category</TableCell>
                <TableCell sx={MD_UP}>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={LG_UP}>Opened</TableCell>
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
                  <TableCell sx={{ maxWidth: { xs: 200, sm: 260, md: 320 } }}>
                    <Typography variant="body2" fontWeight={650} noWrap title={t.subject ?? ''}>
                      {t.subject ?? '(no subject)'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.75 }} title={t.id} noWrap>
                      <Mono>{t.id.slice(0, 14)}…</Mono>
                    </Typography>
                    {/* Columns hidden at this width, folded in so nothing is lost. */}
                    <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 0.75 }}>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ display: { sm: 'none' } }}>
                          {t.customerName}
                        </Typography>
                        <CategoryChip category={t.category} />
                        <PriorityChip priority={t.priority} />
                      </Stack>
                    </Box>
                  </TableCell>
                  <TableCell sx={SM_UP}>
                    <Typography variant="body2" noWrap>
                      {t.customerName}
                    </Typography>
                  </TableCell>
                  <TableCell sx={MD_UP}><CategoryChip category={t.category} /></TableCell>
                  <TableCell sx={MD_UP}><PriorityChip priority={t.priority} /></TableCell>
                  <TableCell><StatusChip status={t.status} /></TableCell>
                  <TableCell sx={LG_UP}>
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
