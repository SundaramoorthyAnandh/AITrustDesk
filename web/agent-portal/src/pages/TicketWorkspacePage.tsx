import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Stack,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import {
  api,
  pollJob,
  type Customer,
  type Draft,
  type Order,
  type SearchHit,
  type Ticket,
  type ToolCall,
  type ToolCatalogEntry,
  type Trace,
} from '../api';
import { CategoryChip, CitationChip, Mono, PriorityChip, StatusChip, formatDate, money } from '../ui';
import { ValidatedTextField, validators, firstError, type Validator } from '../components/ValidatedTextField';

interface TriageJobResult {
  triage: { category: string; priority: string; escalate: boolean; reason: string };
}

export function TicketWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [ctx, setCtx] = useState<{ ticket: Ticket; customer: Customer; order: Order | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [actions, setActions] = useState<ToolCall[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [catalog, setCatalog] = useState<ToolCatalogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [c, d, a, t] = await Promise.all([api.ticket(id), api.drafts(id), api.actions(id), api.traces(id)]);
    setCtx(c);
    setDrafts(d.drafts);
    setActions(a.actions);
    setTraces(t.traces);
  }, [id]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    api.catalog().then((r) => setCatalog(r.tools)).catch(() => undefined);
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const doTriage = () =>
    run('triage', async () => {
      const { jobId } = await api.triage(id!);
      await pollJob<TriageJobResult>(jobId);
      await refresh();
    });

  const doSearch = () =>
    run('search', async () => {
      const r = await api.search(id!);
      setHits(r.hits);
    });

  const doDraft = () =>
    run('draft', async () => {
      const { jobId } = await api.draft(id!);
      await pollJob(jobId);
      await refresh();
    });

  const doSend = (draftId: string) =>
    run('send', async () => {
      await api.sendDraft(draftId);
      await refresh();
    });

  const doEdit = (draftId: string, text: string) =>
    run('edit', async () => {
      await api.editDraft(draftId, text);
      await refresh();
    });

  const doPatchStatus = (status: string) =>
    run('patch', async () => {
      await api.patchTicket(id!, { status });
      await refresh();
    });

  if (error && !ctx) return <Alert severity="error">{error}</Alert>;
  if (!ctx)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );

  const { ticket, customer, order } = ctx;
  // A closed/resolved ticket is read-only: no AI runs, no replies, no actions —
  // only reopening is allowed. (Also enforced server-side.)
  const readOnly = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/" underline="hover">
          Queue
        </Link>
        <Typography color="text.primary" title={ticket.id}>
          <Mono>{ticket.id.slice(0, 14)}…</Mono>
        </Typography>
      </Breadcrumbs>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">{ticket.subject ?? '(no subject)'}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <CategoryChip category={ticket.category} />
          <PriorityChip priority={ticket.priority} />
          <StatusChip status={ticket.status} />
          {ticket.escalated && <Chip size="small" color="warning" icon={<GppMaybeIcon />} label="escalated" />}
          {readOnly ? (
            <Button size="small" variant="outlined" color="primary" onClick={() => doPatchStatus('open')} disabled={busy === 'patch'}>
              Reopen ticket
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" color="success" onClick={() => doPatchStatus('resolved')} disabled={busy === 'patch'}>
                Resolve
              </Button>
              <Button size="small" variant="outlined" color="error" onClick={() => doPatchStatus('closed')} disabled={busy === 'patch'}>
                Close ticket
              </Button>
            </Stack>
          )}
        </Stack>
      </Stack>

      {readOnly && (
        <Alert severity="info">
          This ticket is {ticket.status}. Reopen to reply.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.3fr) minmax(0, 1fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        {/* Left: one unified WhatsApp-style conversation + reply composer */}
        <ConversationPanel
          ticket={ticket}
          drafts={drafts}
          readOnly={readOnly}
          generating={busy === 'draft'}
          sending={busy === 'send'}
          editing={busy === 'edit'}
          onGenerate={doDraft}
          onSend={doSend}
          onEdit={doEdit}
        />

        {/* Right: customer/order context + AI tools — its own scroll, capped at 80vh */}
        <Box
          sx={{
            maxHeight: { md: '80vh' },
            overflowY: { md: 'auto' },
            position: { md: 'sticky' },
            top: { md: 16 },
            pr: { md: 0.5 },
          }}
        >
          <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Customer
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <Typography fontWeight={600}>{customer.name}</Typography>
                {customer.identityVerified ? (
                  <Tooltip title="Identity verified">
                    <VerifiedUserIcon color="success" fontSize="small" />
                  </Tooltip>
                ) : (
                  <Tooltip title="Identity NOT verified">
                    <GppMaybeIcon color="warning" fontSize="small" />
                  </Tooltip>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" title={customer.id}>
                {customer.email} · <Mono>{customer.id.slice(0, 14)}…</Mono>
              </Typography>

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="overline" color="text.secondary">
                Order context
              </Typography>
              {order ? (
                <Box sx={{ mt: 0.75 }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600} noWrap title={order.itemName ?? ''}>
                      {order.itemName ?? 'Item'}
                    </Typography>
                    <Chip size="small" variant="outlined" label={order.status} sx={{ flexShrink: 0 }} />
                  </Stack>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      columnGap: 1.5,
                      rowGap: 0.5,
                      mt: 1,
                      '& .lbl': { color: 'text.secondary' },
                    }}
                  >
                    <Typography variant="caption" className="lbl">SKU</Typography>
                    <Typography variant="caption"><Mono>{order.itemSku ?? '—'}</Mono></Typography>
                    <Typography variant="caption" className="lbl">Amount</Typography>
                    <Typography variant="caption">{money(order.amountCents, order.currency)}</Typography>
                    <Typography variant="caption" className="lbl">Order ID</Typography>
                    <Typography variant="caption" noWrap title={order.id}><Mono>{order.id}</Mono></Typography>
                    <Typography variant="caption" className="lbl">Purchased</Typography>
                    <Typography variant="caption">{formatDate(order.purchaseDate)}</Typography>
                    {order.registeredAt && (
                      <>
                        <Typography variant="caption" className="lbl">Registered</Typography>
                        <Typography variant="caption">{formatDate(order.registeredAt)}</Typography>
                      </>
                    )}
                    {order.deliveredAt && (
                      <>
                        <Typography variant="caption" className="lbl">Delivered</Typography>
                        <Typography variant="caption">{formatDate(order.deliveredAt)}</Typography>
                      </>
                    )}
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  No linked order
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  <PsychologyIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  AI triage
                </Typography>
                <Button size="small" variant="contained" onClick={doTriage} disabled={busy === 'triage' || readOnly}>
                  {busy === 'triage' ? 'Running…' : 'Run triage'}
                </Button>
              </Stack>
              {ticket.category ? (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <CategoryChip category={ticket.category} />
                  <PriorityChip priority={ticket.priority} />
                  {ticket.escalated ? <Chip size="small" color="warning" label="escalate" /> : <Chip size="small" label="no escalation" />}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Not triaged yet.
                </Typography>
              )}
            </CardContent>
          </Card>

          <RetrievalCard hits={hits} busy={busy === 'search'} readOnly={readOnly} onSearch={doSearch} />

          <ActionCard
            ticket={ticket}
            order={order}
            catalog={catalog}
            actions={actions}
            busy={busy}
            readOnly={readOnly}
            onChanged={refresh}
            setError={setError}
          />
          </Stack>
        </Box>
      </Box>

      <TracesCard traces={traces} />
    </Stack>
  );
}

function RetrievalCard({
  hits,
  busy,
  readOnly,
  onSearch,
}: {
  hits: SearchHit[] | null;
  busy: boolean;
  readOnly: boolean;
  onSearch: () => void;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight={700}>
            <SearchIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Policy retrieval
          </Typography>
          <Button size="small" variant="outlined" onClick={onSearch} disabled={busy || readOnly}>
            {busy ? 'Searching…' : 'Search KB'}
          </Button>
        </Stack>
        {hits && (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {hits.length === 0 && <Typography variant="body2" color="text.secondary">No matching policy.</Typography>}
            {hits.map((h) => (
              <Box key={h.docId}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CitationChip id={h.docId} />
                  <Typography variant="caption" color="text.secondary">
                    score {h.score}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {h.snippet}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

const UNSENT_DRAFT = new Set(['draft', 'escalated', 'refused']);

/**
 * One WhatsApp-style panel: conversation history (customer + sent agent replies)
 * as chat bubbles, plus a composer at the bottom. "Generate draft" runs the AI
 * draft job; the result drops into the composer where the agent edits it, and
 * "Send" saves any edit then sends — exactly the jobs the old two cards did.
 */
function ConversationPanel({
  ticket,
  drafts,
  readOnly,
  generating,
  sending,
  editing,
  onGenerate,
  onSend,
  onEdit,
}: {
  ticket: Ticket;
  drafts: Draft[];
  readOnly: boolean;
  generating: boolean;
  sending: boolean;
  editing: boolean;
  onGenerate: () => void;
  onSend: (draftId: string) => Promise<void>;
  onEdit: (draftId: string, text: string) => Promise<void>;
}) {
  // The latest still-unsent draft is what the composer edits + sends.
  const latest = drafts.length > 0 ? drafts[drafts.length - 1] : null;
  const sendable = latest && UNSENT_DRAFT.has(latest.status) ? latest : null;

  const [text, setText] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (sendable) {
      // A freshly generated/regenerated draft loads into the composer once.
      if (sendable.id !== loadedId) {
        setText(sendable.text);
        setLoadedId(sendable.id);
      }
    } else if (loadedId) {
      // The draft we were holding got sent — clear the composer.
      setText('');
      setLoadedId(null);
    }
  }, [sendable, loadedId]);

  const messages = [
    { key: 'initial', role: 'customer' as const, text: ticket.body, at: ticket.createdAt, citations: [], edited: false },
    ...[...drafts]
      .filter((d) => d.status === 'sent' || d.status === 'customer_reply')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((d) => ({
        key: d.id,
        role: (d.status === 'customer_reply' ? 'customer' : 'agent') as 'customer' | 'agent',
        text: d.text,
        at: d.createdAt,
        citations: d.citations,
        edited: Boolean(d.editedAt),
      })),
  ];

  const handleSend = async () => {
    if (!sendable || !text.trim()) return;
    if (text.trim() !== sendable.text.trim()) await onEdit(sendable.id, text);
    await onSend(sendable.id);
  };

  const busyAny = generating || sending || editing || readOnly;

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: { xs: '85vh', md: '80vh' },
        position: { md: 'sticky' },
        top: { md: 16 },
      }}
    >
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 }, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Conversation
          </Typography>
        </Box>
        <Divider />

        {/* Chat thread — grows to fill, scrolls internally when long */}
        <Box
          sx={{
            px: 2,
            py: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            flex: 1,
            minHeight: 140,
            overflowY: 'auto',
            bgcolor: 'background.default',
          }}
        >
          {messages.map((m) => (
            <MessageBubble key={m.key} role={m.role} text={m.text} at={m.at} citations={m.citations} edited={m.edited} />
          ))}
        </Box>

        <Divider />

        {/* Composer — pinned at the bottom of the panel */}
        <Box sx={{ p: 2, flexShrink: 0 }}>
          {sendable?.status === 'refused' && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              Guardrail refused this reply — review it before sending.
            </Alert>
          )}
          {sendable?.status === 'escalated' && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Escalated to human review — edit as needed before sending.
            </Alert>
          )}
          {sendable && sendable.citations.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Grounded in:
              </Typography>
              {sendable.citations.map((c) => (
                <CitationChip key={c} id={c} />
              ))}
            </Stack>
          )}
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              readOnly
                ? 'This ticket is read-only.'
                : sendable
                  ? 'Edit the AI draft, then send to the customer…'
                  : 'Generate an AI draft to reply to the customer…'
            }
            fullWidth
            multiline
            minRows={3}
            maxRows={12}
            disabled={sending || editing || readOnly}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
            <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={onGenerate} disabled={busyAny}>
              {generating ? 'Generating…' : sendable ? 'Regenerate draft' : 'Generate draft'}
            </Button>
            <Button
              variant="contained"
              startIcon={<SendIcon />}
              onClick={handleSend}
              disabled={!sendable || !text.trim() || busyAny}
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </Stack>
          {readOnly ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              * Ticket is {ticket.status} — reopen it to reply.
            </Typography>
          ) : (
            !sendable && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Replies are sent from an AI-generated, policy-grounded draft. Generate one to edit and send.
              </Typography>
            )
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function MessageBubble({
  role,
  text,
  at,
  citations = [],
  edited = false,
}: {
  role: 'customer' | 'agent';
  text: string;
  at: string;
  citations?: string[];
  edited?: boolean;
}) {
  const isAgent = role === 'agent';
  return (
    <Box sx={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
      <Box
        sx={(t) => ({
          maxWidth: '85%',
          px: 1.5,
          py: 1,
          borderRadius: 2,
          borderTopRightRadius: isAgent ? 4 : 16,
          borderTopLeftRadius: isAgent ? 16 : 4,
          border: '1px solid',
          borderColor: isAgent ? alpha(t.palette.primary.main, 0.5) : t.palette.divider,
          bgcolor: isAgent ? alpha(t.palette.primary.main, 0.16) : t.palette.background.paper,
        })}
      >
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
          <Typography variant="caption" fontWeight={700} color={isAgent ? 'primary' : 'text.secondary'}>
            {isAgent ? 'Support agent' : 'Customer'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(at)}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </Typography>
        {citations.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {citations.map((c) => (
              <CitationChip key={c} id={c} />
            ))}
          </Stack>
        )}
        {edited && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
            edited by agent
          </Typography>
        )}
      </Box>
    </Box>
  );
}

const TOOL_FIELDS: Record<string, string[]> = {
  start_refund_review: ['order_id', 'amount_cents', 'reason'],
  create_replacement_order: ['order_id', 'sku', 'reason'],
};

// Human-readable labels for the proposed/executed panel — we never surface raw
// tool names or internal identifiers to the agent.
const TOOL_LABELS: Record<string, string> = {
  start_refund_review: 'Refund review',
  create_replacement_order: 'Replacement order',
};

// Validation for the editable action fields (order_id/sku are read-only from the ticket).
const FIELD_RULES: Record<string, Validator[]> = {
  amount_cents: [validators.integerMin(0, 'Enter a whole number ≥ 0')],
  reason: [validators.required('A reason is required')],
};

function ActionCard({
  ticket,
  order,
  catalog,
  actions,
  busy,
  readOnly,
  onChanged,
  setError,
}: {
  ticket: Ticket;
  order: Order | null;
  catalog: ToolCatalogEntry[];
  actions: ToolCall[];
  busy: string | null;
  readOnly: boolean;
  onChanged: () => Promise<void>;
  setError: (m: string | null) => void;
}) {
  const [tool, setTool] = useState('start_refund_review');
  const [args, setArgs] = useState<Record<string, string>>({});
  // Bumped whenever the base data resets or an action is staged, so the validated
  // fields remount and clear their "touched" state — otherwise a just-cleared
  // reason field would keep flashing a stale "reason is required" error.
  const [formKey, setFormKey] = useState(0);

  // Depend on stable primitives (not the `order` object identity): a refetch that
  // returns the same order must NOT wipe a reason the agent is typing.
  useEffect(() => {
    setArgs({
      order_id: ticket.orderId ?? '',
      amount_cents: order ? String(order.amountCents) : '',
      sku: order?.itemSku ?? '',
      reason: '',
    });
    setFormKey((k) => k + 1);
  }, [ticket.orderId, order?.id, order?.amountCents, order?.itemSku]);

  const fields = TOOL_FIELDS[tool] ?? [];
  // order_id (and the replacement sku) come from the ticket's linked order, so
  // they're pre-filled and read-only — the agent never hand-types an identifier.
  const orderMissing = !ticket.orderId;

  // An order can be refunded OR replaced — never both, and each at most once.
  // If ANY action already executed for this ticket's order, both tools lock out
  // (the server enforces this too; the UI just mirrors it).
  const executedForOrder = actions.filter(
    (a) => a.status === 'executed' && String((a.args as Record<string, unknown>).order_id ?? '') === (ticket.orderId ?? ''),
  );
  const orderResolved = executedForOrder.length > 0;
  const resolvedRemedy: 'refund' | 'replacement' | null = orderResolved
    ? executedForOrder[0].toolName === 'start_refund_review'
      ? 'refund'
      : 'replacement'
    : null;

  // Policy gate (KB-REFUND-002): non-refundable items can't be refunded.
  const refundBlocked = tool === 'start_refund_review' && order?.refundable === false;

  const isReadOnly = (f: string) => f === 'order_id' || (f === 'sku' && Boolean(order?.itemSku));
  const argsValid = fields.every((f) => isReadOnly(f) || !firstError(args[f] ?? '', FIELD_RULES[f] ?? []));
  const recommendDisabled =
    busy != null || orderMissing || !argsValid || readOnly || orderResolved || refundBlocked;

  const recommend = async () => {
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) payload[f] = f === 'amount_cents' ? Number(args[f] ?? 0) : args[f] ?? '';
      await api.recommend(ticket.id, tool, payload);
      // Clear the reason and remount fields so no stale "required" error lingers
      // on the now-submitted action.
      setArgs((prev) => ({ ...prev, reason: '' }));
      setFormKey((k) => k + 1);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recommend');
    }
  };

  // Human-readable action summary for the proposed/executed panel. Deliberately
  // omits internal identifiers (order id, review id, idempotency key) and the raw
  // reason — the agent sees the remedy and the amount/item, nothing sensitive.
  const describeAction = (a: ToolCall): string => {
    const aa = a.args as Record<string, unknown>;
    if (a.toolName === 'start_refund_review') {
      const cents = Number(aa.amount_cents ?? 0);
      return cents > 0 ? `Refund of ${money(cents)} to the customer’s original payment method` : 'Refund to the customer';
    }
    if (a.toolName === 'create_replacement_order') {
      return `Free replacement of ${order?.itemName ?? 'the item'} at no cost to the customer`;
    }
    return TOOL_LABELS[a.toolName] ?? a.toolName;
  };

  const decide = async (actionId: string, decision: 'approve' | 'reject') => {
    setError(null);
    try {
      if (decision === 'approve') await api.approve(actionId);
      else await api.reject(actionId);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed');
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700}>
          Human Approval
        </Typography>

        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField select label="Tool" value={tool} onChange={(e) => setTool(e.target.value)} size="small" disabled={readOnly}>
            {(catalog.length
              ? catalog.map((c) => ({ name: c.name, label: c.label || c.name }))
              : Object.keys(TOOL_FIELDS).map((name) => ({ name, label: name }))
            ).map((opt) => (
              <MenuItem key={opt.name} value={opt.name}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          {orderMissing && (
            <Alert severity="info">
              This ticket has no linked order, so an order-based action can’t be started here.
            </Alert>
          )}
          {orderResolved && (
            <Alert severity="success">
              This order has already been {resolvedRemedy === 'refund' ? 'refunded' : 'replaced'}. An order can be
              refunded or replaced, but not both.
            </Alert>
          )}
          {!orderResolved && refundBlocked && (
            <Alert severity="warning">
              This item is non-refundable per policy (KB-REFUND-002). You can arrange a replacement instead.
            </Alert>
          )}

          {fields.map((f) =>
            isReadOnly(f) ? (
              <TextField
                key={`${f}-${formKey}`}
                label={f}
                size="small"
                value={args[f] ?? ''}
                InputProps={{ readOnly: true }}
                disabled
                helperText="From the ticket’s order (read-only)"
              />
            ) : (
              <ValidatedTextField
                key={`${f}-${formKey}`}
                label={f}
                size="small"
                value={args[f] ?? ''}
                onChange={(v) => setArgs((prev) => ({ ...prev, [f]: v }))}
                rules={FIELD_RULES[f] ?? []}
                disabled={orderResolved || refundBlocked}
                helperText={f === 'amount_cents' ? 'Editable — e.g. for a partial refund' : undefined}
              />
            ),
          )}
          <Button variant="outlined" onClick={recommend} disabled={recommendDisabled}>
            Recommend action
          </Button>
        </Stack>

        {actions.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="overline" color="text.secondary">
              Proposed / executed actions
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {actions.map((a) => (
                <Box key={a.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={600}>
                      {TOOL_LABELS[a.toolName] ?? a.toolName}
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        a.status === 'executed'
                          ? 'Completed'
                          : a.status === 'pending'
                            ? 'Awaiting approval'
                            : a.status === 'rejected'
                              ? 'Rejected'
                              : 'Failed'
                      }
                      color={
                        a.status === 'executed' ? 'success' : a.status === 'rejected' ? 'error' : a.status === 'failed' ? 'error' : 'warning'
                      }
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {describeAction(a)}
                  </Typography>
                  {a.status === 'executed' && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'success.main' }}>
                      {a.toolName === 'start_refund_review'
                        ? 'Refund approved — the customer was notified and the ticket resolved.'
                        : 'Replacement arranged — the customer was notified and the ticket resolved.'}
                    </Typography>
                  )}
                  {a.status === 'failed' && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'error.main' }}>
                      This action couldn’t be completed. Please review and try again.
                    </Typography>
                  )}
                  {a.status === 'pending' && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => decide(a.id, 'approve')}
                        disabled={readOnly || orderResolved}
                      >
                        Approve
                      </Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => decide(a.id, 'reject')} disabled={readOnly}>
                        Reject
                      </Button>
                      {orderResolved && (
                        <Typography variant="caption" color="text.secondary">
                          This order is already {resolvedRemedy === 'refund' ? 'refunded' : 'replaced'}
                        </Typography>
                      )}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TracesCard({ traces }: { traces: Trace[] }) {
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  if (traces.length === 0) return null;

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedTraces = traces.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: expanded ? 2 : '16px !important' }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setExpanded(!expanded)}
        >
          <Typography variant="subtitle1" fontWeight={700}>
            Audit trace ({traces.length})
          </Typography>
          <IconButton size="small" aria-label="toggle audit trace section">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>

        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Divider sx={{ my: 1.5 }} />
          <Stack spacing={1}>
            {paginatedTraces.map((t) => (
              <Box
                key={t.id}
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={t.runType} variant="outlined" color="primary" />
                  <Typography variant="caption" fontWeight={600}>
                    status={t.finalStatus}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    guardrail={t.guardrailResult ?? '—'}
                  </Typography>
                  {t.retrievedDocIds.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      docs=[<Mono>{t.retrievedDocIds.join(', ')}</Mono>]
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {t.provider ?? ''} {t.latencyMs != null ? `${t.latencyMs}ms` : ''} · {formatDate(t.createdAt)}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </Stack>

          <TablePagination
            component="div"
            count={traces.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25]}
            sx={{ borderTop: 'none', mt: 1, px: 0 }}
          />
        </Collapse>
      </CardContent>
    </Card>
  );
}
