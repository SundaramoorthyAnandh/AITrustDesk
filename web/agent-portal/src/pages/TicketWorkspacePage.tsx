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
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SearchIcon from '@mui/icons-material/Search';
import EditNoteIcon from '@mui/icons-material/EditNote';
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
import { CategoryChip, CitationChip, DraftStatusChip, Mono, PriorityChip, StatusChip, formatDate, money } from '../ui';
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
  const latestDraft = drafts.length > 0 ? drafts[drafts.length - 1] : null;

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
          {ticket.status === 'closed' ? (
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
              <Typography variant="body2" color="text.secondary" title={customer.id}>
                {customer.email} · <Mono>{customer.id.slice(0, 14)}…</Mono>
              </Typography>

              <Divider sx={{ my: 1.5 }} />
              <Typography variant="overline" color="text.secondary">
                Order context
              </Typography>
              {order ? (
                <Typography variant="body2" sx={{ mt: 0.5 }} title={order.id}>
                  <Mono>{order.id.slice(0, 14)}…</Mono> · {order.itemName} (<Mono>{order.itemSku}</Mono>) ·{' '}
                  {money(order.amountCents, order.currency)}
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
                Conversation History
              </Typography>
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="caption" fontWeight={700} color="primary">
                      Customer (Initial message)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(ticket.createdAt)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{ticket.body}</Typography>
                </Box>

                {[...drafts]
                  .filter((d) => d.status === 'sent' || d.status === 'customer_reply')
                  .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                  .map((d) => {
                    const isCustomer = d.status === 'customer_reply';
                    return (
                      <Box
                        key={d.id}
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          bgcolor: isCustomer ? 'background.default' : 'action.hover',
                          border: '1px solid',
                          borderColor: isCustomer ? 'divider' : 'primary.light',
                          ml: isCustomer ? 0 : 2,
                          mr: isCustomer ? 2 : 0,
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                          <Typography variant="caption" fontWeight={700} color={isCustomer ? 'primary' : 'secondary'}>
                            {isCustomer ? 'Customer (Reply)' : 'Support Agent (Sent reply)'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(d.createdAt)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{d.text}</Typography>
                      </Box>
                    );
                  })}
              </Stack>
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
              <Alert severity="error" sx={{ mb: 1.5 }}>
                Guardrail blocked / refused — reason: {draft.text}
              </Alert>
            )}
            {draft.status === 'escalated' && (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                Guardrail blocked or escalated to human review — reason: {draft.text}
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
                  <CitationChip key={c} id={c} />
                ))}
              </Stack>
            )}

            {draft.status !== 'sent' && (
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
                      color="primary"
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

  const isReadOnly = (f: string) => f === 'order_id' || (f === 'sku' && Boolean(order?.itemSku));
  const argsValid = fields.every((f) => isReadOnly(f) || !firstError(args[f] ?? '', FIELD_RULES[f] ?? []));

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

          {fields.map((f) =>
            isReadOnly(f) ? (
              <TextField
                key={f}
                label={f}
                size="small"
                value={args[f] ?? ''}
                InputProps={{ readOnly: true }}
                helperText="From the ticket’s order (read-only)"
              />
            ) : (
              <ValidatedTextField
                key={f}
                label={f}
                size="small"
                value={args[f] ?? ''}
                onChange={(v) => setArgs((prev) => ({ ...prev, [f]: v }))}
                rules={FIELD_RULES[f] ?? []}
                helperText={f === 'amount_cents' ? 'Editable — e.g. for a partial refund' : undefined}
              />
            ),
          )}
          <Button variant="outlined" onClick={recommend} disabled={busy != null || orderMissing || !argsValid}>
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
                    <Mono>{JSON.stringify(a.args)}</Mono>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    idempotency: <Mono>{a.idempotencyKey.slice(0, 12)}…</Mono>
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
