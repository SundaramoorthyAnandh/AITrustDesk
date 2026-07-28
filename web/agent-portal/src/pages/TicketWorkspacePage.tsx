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
  Divider,
  Link,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SearchIcon from '@mui/icons-material/Search';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SendIcon from '@mui/icons-material/Send';
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
import { CategoryChip, DraftStatusChip, PriorityChip, StatusChip, formatDate, money } from '../ui';

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

  if (error && !ctx) return <Alert severity="error">{error}</Alert>;
  if (!ctx)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );

  const { ticket, customer, order } = ctx;
  const latestDraft = drafts[0] ?? null;

  return (
    <Stack spacing={2}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/" underline="hover">
          Queue
        </Link>
        <Typography color="text.primary">{ticket.id}</Typography>
      </Breadcrumbs>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">{ticket.subject ?? '(no subject)'}</Typography>
        <Stack direction="row" spacing={1}>
          <CategoryChip category={ticket.category} />
          <PriorityChip priority={ticket.priority} />
          <StatusChip status={ticket.status} />
          {ticket.escalated && <Chip size="small" color="warning" icon={<GppMaybeIcon />} label="escalated" />}
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* Left column: context + message */}
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
              <Typography variant="body2" color="text.secondary">
                {customer.email} · {customer.id}
              </Typography>

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="overline" color="text.secondary">
                Order context
              </Typography>
              {order ? (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {order.id} · {order.itemName} ({order.itemSku}) · {money(order.amountCents, order.currency)}
                  <br />
                  ordered {formatDate(order.orderDate)} · status {order.status}
                  {order.deliveredAt ? ` · delivered ${formatDate(order.deliveredAt)}` : ''}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  No linked order
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Customer message
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{ticket.body}</Typography>
            </CardContent>
          </Card>

          <RetrievalCard hits={hits} busy={busy === 'search'} onSearch={doSearch} />
        </Stack>

        {/* Right column: AI actions */}
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  <PsychologyIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  AI triage
                </Typography>
                <Button size="small" variant="contained" onClick={doTriage} disabled={busy === 'triage'}>
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

          <DraftCard
            draft={latestDraft}
            busy={busy === 'draft'}
            onGenerate={doDraft}
            onSend={doSend}
            onEdit={doEdit}
            sending={busy === 'send'}
            editing={busy === 'edit'}
          />

          <ActionCard
            ticket={ticket}
            order={order}
            catalog={catalog}
            actions={actions}
            busy={busy}
            onChanged={refresh}
            setError={setError}
          />
        </Stack>
      </Box>

      <TracesCard traces={traces} />
    </Stack>
  );
}

function RetrievalCard({ hits, busy, onSearch }: { hits: SearchHit[] | null; busy: boolean; onSearch: () => void }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight={700}>
            <SearchIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Policy retrieval
          </Typography>
          <Button size="small" variant="outlined" onClick={onSearch} disabled={busy}>
            {busy ? 'Searching…' : 'Search KB'}
          </Button>
        </Stack>
        {hits && (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {hits.length === 0 && <Typography variant="body2" color="text.secondary">No matching policy.</Typography>}
            {hits.map((h) => (
              <Box key={h.docId}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={h.docId} variant="outlined" />
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

function DraftCard({
  draft,
  busy,
  sending,
  editing,
  onGenerate,
  onSend,
  onEdit,
}: {
  draft: Draft | null;
  busy: boolean;
  sending: boolean;
  editing: boolean;
  onGenerate: () => void;
  onSend: (draftId: string) => void;
  onEdit: (draftId: string, text: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState('');

  const startEdit = () => {
    if (!draft) return;
    setText(draft.text);
    setIsEditing(true);
  };
  const save = async () => {
    if (!draft) return;
    await onEdit(draft.id, text);
    setIsEditing(false);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1" fontWeight={700}>
            <EditNoteIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
            Cited draft reply
          </Typography>
          <Button size="small" variant="contained" onClick={onGenerate} disabled={busy || isEditing}>
            {busy ? 'Generating…' : draft ? 'Regenerate' : 'Generate draft'}
          </Button>
        </Stack>

        {!draft && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No draft yet. Generate a grounded reply from retrieved policy.
          </Typography>
        )}

        {draft && (
          <Box sx={{ mt: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
              <DraftStatusChip status={draft.status} />
              {draft.editedAt && <Chip size="small" variant="outlined" label="edited by agent" />}
            </Stack>
            {draft.status === 'refused' && (
              <Alert severity="error" sx={{ mb: 1 }}>
                Guardrail refused this request — nothing was sent.
              </Alert>
            )}
            {draft.status === 'escalated' && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Escalated to a human — no grounded policy fully supported an answer.
              </Alert>
            )}

            {isEditing ? (
              <TextField
                value={text}
                onChange={(e) => setText(e.target.value)}
                fullWidth
                multiline
                minRows={6}
                autoFocus
                disabled={editing}
                helperText="Edit the reply before sending. Citations are preserved."
              />
            ) : (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {draft.text}
              </Typography>
            )}

            {draft.citations.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  Citations:
                </Typography>
                {draft.citations.map((c) => (
                  <Chip key={c} label={c} size="small" color="primary" variant="outlined" />
                ))}
              </Stack>
            )}

            {draft.status === 'draft' && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                {isEditing ? (
                  <>
                    <Button size="small" variant="contained" onClick={save} disabled={editing || !text.trim()}>
                      {editing ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button size="small" onClick={() => setIsEditing(false)} disabled={editing}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditNoteIcon />} onClick={startEdit}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<SendIcon />}
                      disabled={sending}
                      onClick={() => onSend(draft.id)}
                    >
                      Send to customer
                    </Button>
                  </>
                )}
              </Stack>
            )}
            {draft.status === 'sent' && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Sent to the customer.
              </Alert>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

const TOOL_FIELDS: Record<string, string[]> = {
  start_refund_review: ['order_id', 'amount_cents', 'reason'],
  create_replacement_order: ['order_id', 'sku', 'reason'],
};

function ActionCard({
  ticket,
  order,
  catalog,
  actions,
  busy,
  onChanged,
  setError,
}: {
  ticket: Ticket;
  order: Order | null;
  catalog: ToolCatalogEntry[];
  actions: ToolCall[];
  busy: string | null;
  onChanged: () => Promise<void>;
  setError: (m: string | null) => void;
}) {
  const [tool, setTool] = useState('start_refund_review');
  const [args, setArgs] = useState<Record<string, string>>({});

  useEffect(() => {
    setArgs({
      order_id: ticket.orderId ?? '',
      amount_cents: order ? String(order.amountCents) : '',
      sku: order?.itemSku ?? '',
      reason: '',
    });
  }, [ticket.orderId, order]);

  const fields = TOOL_FIELDS[tool] ?? [];
  // order_id (and the replacement sku) come from the ticket's linked order, so
  // they're pre-filled and read-only — the agent never hand-types an identifier.
  const orderMissing = !ticket.orderId;

  const recommend = async () => {
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) payload[f] = f === 'amount_cents' ? Number(args[f] ?? 0) : args[f] ?? '';
      await api.recommend(ticket.id, tool, payload);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recommend');
    }
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
          Sensitive action (human approval required)
        </Typography>

        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField select label="Tool" value={tool} onChange={(e) => setTool(e.target.value)} size="small">
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

          {fields.map((f) => {
            const readOnly = f === 'order_id' || (f === 'sku' && Boolean(order?.itemSku));
            return (
              <TextField
                key={f}
                label={f}
                size="small"
                value={args[f] ?? ''}
                onChange={readOnly ? undefined : (e) => setArgs((prev) => ({ ...prev, [f]: e.target.value }))}
                InputProps={{ readOnly }}
                helperText={
                  readOnly
                    ? "From the ticket’s order (read-only)"
                    : f === 'amount_cents'
                      ? 'Editable — e.g. for a partial refund'
                      : undefined
                }
              />
            );
          })}
          <Button variant="outlined" onClick={recommend} disabled={busy != null || orderMissing}>
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
                      {a.toolName}
                    </Typography>
                    <Chip
                      size="small"
                      label={a.status}
                      color={
                        a.status === 'executed' ? 'success' : a.status === 'rejected' ? 'error' : a.status === 'failed' ? 'error' : 'warning'
                      }
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {JSON.stringify(a.args)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    idempotency: {a.idempotencyKey.slice(0, 12)}…
                  </Typography>
                  {a.result && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'success.main' }}>
                      result: {JSON.stringify(a.result)}
                    </Typography>
                  )}
                  {a.status === 'pending' && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button size="small" variant="contained" color="success" onClick={() => decide(a.id, 'approve')}>
                        Approve
                      </Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => decide(a.id, 'reject')}>
                        Reject
                      </Button>
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
  if (traces.length === 0) return null;
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700}>
          Audit trace ({traces.length})
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {traces.map((t) => (
            <Stack key={t.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip size="small" label={t.runType} variant="outlined" />
              <Typography variant="caption">status={t.finalStatus}</Typography>
              <Typography variant="caption" color="text.secondary">
                guardrail={t.guardrailResult ?? '—'}
              </Typography>
              {t.retrievedDocIds.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  docs=[{t.retrievedDocIds.join(', ')}]
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {t.provider ?? ''} {t.latencyMs != null ? `${t.latencyMs}ms` : ''} · {formatDate(t.createdAt)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
