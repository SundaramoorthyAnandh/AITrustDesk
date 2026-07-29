import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, type Order } from '../api';
import { money } from '../ui';
import { ValidatedTextField, validators, firstError, type Validator } from '../components/ValidatedTextField';

const subjectRules: Validator[] = [validators.required('Subject is required'), validators.maxLen(200)];
const bodyRules: Validator[] = [validators.required('Please describe the issue'), validators.maxLen(5000)];

export function NewComplaintPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.orders().then((r) => setOrders(r.orders)).catch(() => undefined);
  }, []);

  const formValid = !firstError(subject, subjectRules) && !firstError(body, bodyRules);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createTicket({ subject, body, orderId: orderId || null });
      navigate(`/tickets/${r.ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        File a complaint
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ p: 3 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={submit}>
            <Stack spacing={2.5}>
              <ValidatedTextField
                label="Subject"
                value={subject}
                onChange={setSubject}
                rules={subjectRules}
                required
                fullWidth
                placeholder="e.g. Headphones stopped working"
              />
              <TextField
                select
                label="Related order (optional)"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                fullWidth
                helperText="Link an order so our team has full context"
              >
                <MenuItem value="">
                  <em>No specific order</em>
                </MenuItem>
                {orders.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.id} · {o.itemName} · {money(o.amountCents, o.currency)} · {o.status}
                  </MenuItem>
                ))}
              </TextField>
              <ValidatedTextField
                label="Describe the issue"
                value={body}
                onChange={setBody}
                rules={bodyRules}
                required
                fullWidth
                multiline
                minRows={5}
              />
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button onClick={() => navigate('/')}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={busy || !formValid}>
                  Submit complaint
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
