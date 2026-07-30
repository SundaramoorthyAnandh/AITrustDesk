import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { api, type Order, type Reply, type Ticket } from '../api';
import { PriorityChip, StatusChip, formatDate, money } from '../ui';
import { KbCitationChip } from '../components/KbCitationChip';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ ticket: Ticket; order: Order | null; replies: Reply[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadTicket = () => {
    if (!id) return;
    api.ticket(id).then(setData).catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!id) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const updated = await api.patchTicket(id, { status: newStatus });
      setData(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update complaint status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !replyText.trim()) return;
    setSubmittingReply(true);
    setReplyError(null);
    try {
      await api.replyToTicket(id, replyText.trim());
      setReplyText('');
      loadTicket();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );

  const { ticket, order, replies } = data;
  const isClosed = ticket.status === 'closed';

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
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusChip status={ticket.status} />
            <PriorityChip priority={ticket.priority} />
            {isClosed ? (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() => handleUpdateStatus('open')}
                disabled={updatingStatus}
              >
                Reopen complaint
              </Button>
            ) : (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => handleUpdateStatus('closed')}
                disabled={updatingStatus}
              >
                Close complaint
              </Button>
            )}
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Opened {formatDate(ticket.createdAt)}
        </Typography>
      </Box>

      {/* Conversation Thread */}
      <Box>
        <Typography variant="h6" mb={1.5}>
          Conversation
        </Typography>

        <Stack spacing={2}>
          {/* Initial Customer Message */}
          <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" color="primary" fontWeight={700}>
                  You (Customer)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(ticket.createdAt)}
                </Typography>
              </Stack>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{ticket.body}</Typography>
              {order && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Related order: {order.id} · {order.itemName} · {money(order.amountCents, order.currency)}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>

          {/* Subsequent Messages (Agent & Customer Replies) */}
          {[...replies]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((r) => {
            const isCustomerReply = r.status === 'customer_reply';
            return (
              <Card
                key={r.id}
                variant="outlined"
                sx={{
                  borderColor: isCustomerReply ? 'divider' : 'primary.light',
                  bgcolor: isCustomerReply ? 'background.paper' : 'action.hover',
                  ml: isCustomerReply ? 0 : { xs: 1, sm: 3 },
                  mr: isCustomerReply ? { xs: 1, sm: 3 } : 0,
                }}
              >
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography
                      variant="subtitle2"
                      color={isCustomerReply ? 'primary' : 'secondary'}
                      fontWeight={700}
                    >
                      {isCustomerReply ? 'You (Customer)' : 'Support Agent'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(r.createdAt)}
                    </Typography>
                  </Stack>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{r.text}</Typography>
                  {r.citations && r.citations.length > 0 && (
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                        Based on policy:
                      </Typography>
                      {r.citations.map((c) => (
                        <KbCitationChip key={c} docId={c} />
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      </Box>

      {/* Reply Input or Closed Notice */}
      {isClosed ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          This complaint is closed. If you have a new issue, please file a new complaint.
        </Alert>
      ) : (
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" mb={1.5} fontWeight={600}>
              Send a reply
            </Typography>
            {replyError && <Alert severity="error" sx={{ mb: 2 }}>{replyError}</Alert>}
            <form onSubmit={handleSendReply}>
              <Stack spacing={2}>
                <TextField
                  multiline
                  rows={3}
                  fullWidth
                  placeholder="Type your message to support..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={submittingReply}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="submit"
                    variant="contained"
                    endIcon={<SendIcon />}
                    disabled={submittingReply || !replyText.trim()}
                  >
                    {submittingReply ? 'Sending…' : 'Send reply'}
                  </Button>
                </Box>
              </Stack>
            </form>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
