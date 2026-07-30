import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { api, pollJob, type EvalSummary } from '../api';
import { CitationChip, Mono } from '../ui';

/** Progressive column disclosure — hide low-priority columns on narrow screens. */
const SM_UP = { display: { xs: 'none', sm: 'table-cell' } } as const;
const MD_UP = { display: { xs: 'none', md: 'table-cell' } } as const;
const LG_UP = { display: { xs: 'none', lg: 'table-cell' } } as const;

const METRIC_LABELS: Record<string, string> = {
  triageAccuracy: 'Triage accuracy',
  priorityAccuracy: 'Priority accuracy',
  citationCoverage: 'Citation coverage',
  unsafeActionBlockingRate: 'Unsafe-action blocking',
  escalationBehavior: 'Escalation behavior',
};

function MetricTile({ label, value, denom }: { label: string; value: number; denom?: number }) {
  const color = value >= 90 ? 'success.main' : value >= 70 ? 'warning.main' : 'error.main';
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 170 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" sx={{ color, fontWeight: 700 }}>
          {value}%
        </Typography>
        {denom != null && (
          <Typography variant="caption" color="text.secondary">
            {denom} cases checked
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function EvalPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadLatest = () =>
    api
      .latestEval()
      .then((r) => {
        setSummary(r.run?.summary ?? null);
        setLastRunAt(r.run?.startedAt ?? null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadLatest();
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const { jobId } = await api.runEval();
      // A real-LLM eval runs many calls; the backend bounds it, but give the
      // poller a wide enough window to catch the result (mock finishes instantly).
      const result = await pollJob<EvalSummary>(jobId, 180_000);
      setSummary(result);
      setLastRunAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eval failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Evaluation harness</Typography>
        <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run eval'}
        </Button>
      </Stack>

      {running && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!summary && !running && <Alert severity="info">No evaluation run yet. Click “Run eval”.</Alert>}

      {summary && (
        <>
          <Typography variant="body2" color="text.primary">
            Provider: <strong>{summary.provider}</strong> · {summary.totalCases} evaluation cases in total
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {lastRunAt && `Last run: ${new Date(lastRunAt).toLocaleString()}`}
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {Object.entries(summary.metrics).map(([k, v]) => (
              <MetricTile key={k} label={METRIC_LABELS[k] ?? k} value={v} denom={summary.denominators[metricDenomKey(k)]} />
            ))}
          </Stack>

          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: { xs: 0, md: 900 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Case</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell sx={MD_UP}>Priority</TableCell>
                  <TableCell sx={SM_UP}>Draft status</TableCell>
                  <TableCell sx={LG_UP}>Escalated</TableCell>
                  <TableCell sx={LG_UP}>Guardrail</TableCell>
                  <TableCell sx={MD_UP}>Citations</TableCell>
                  <TableCell>Checks</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.cases.map((c) => {
                  const failed = Object.values(c.checks).some((v) => v === false);
                  return (
                    <TableRow key={c.id} sx={failed ? { bgcolor: 'rgba(248,113,113,0.12)' } : undefined}>
                      <TableCell sx={{ maxWidth: 260 }}>
                        <Typography variant="body2" fontWeight={700}>
                          <Mono>{c.id}</Mono>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.description}
                        </Typography>
                      </TableCell>
                      <TableCell>{c.predictedCategory}</TableCell>
                      <TableCell sx={MD_UP}>{c.predictedPriority}</TableCell>
                      <TableCell sx={SM_UP}>{c.draftStatus}</TableCell>
                      <TableCell sx={LG_UP}>{c.systemEscalated ? 'yes' : 'no'}</TableCell>
                      <TableCell sx={LG_UP}>{c.guardrailKind}</TableCell>
                      <TableCell sx={MD_UP}>
                        {c.citations.length ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {c.citations.map((id) => (
                              <CitationChip key={id} id={id} />
                            ))}
                          </Stack>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {Object.entries(c.checks)
                            .filter(([, v]) => v !== null)
                            .map(([k, v]) => (
                              <Chip
                                key={k}
                                size="small"
                                label={k.replace('Correct', '').replace('Covered', '')}
                                color={v ? 'success' : 'error'}
                                variant="outlined"
                                sx={{ height: 18, fontSize: 10 }}
                              />
                            ))}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Stack>
  );
}

function metricDenomKey(metric: string): string {
  const map: Record<string, string> = {
    triageAccuracy: 'triage',
    priorityAccuracy: 'priority',
    citationCoverage: 'citation',
    unsafeActionBlockingRate: 'unsafeAction',
    escalationBehavior: 'escalation',
  };
  return map[metric] ?? metric;
}
