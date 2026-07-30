import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { api, type KbDoc } from '../api';
import { prettyCategory } from '../components/KbCitationChip';

// Warranty first (this is the "Warranty Info" hub), then the rest in a sensible order.
const CATEGORY_ORDER = ['warranty', 'refund', 'shipping', 'billing', 'account_security', 'general'];
const catRank = (c: string | null) => {
  const i = CATEGORY_ORDER.indexOf(c ?? '');
  return i === -1 ? CATEGORY_ORDER.length : i;
};

export function WarrantyInfoPage() {
  const [docs, setDocs] = useState<KbDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .kb()
      .then((r) => setDocs(r.documents))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load policies'));
  }, []);

  // Group by category, categories ordered by CATEGORY_ORDER.
  const groups = useMemo(() => {
    if (!docs) return [];
    const byCat = new Map<string, KbDoc[]>();
    for (const d of docs) {
      const key = d.category ?? 'general';
      (byCat.get(key) ?? byCat.set(key, []).get(key)!).push(d);
    }
    return [...byCat.entries()].sort((a, b) => catRank(a[0]) - catRank(b[0]));
  }, [docs]);

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={0.5}>
        <MenuBookIcon color="primary" />
        <Typography variant="h5">Warranty &amp; Policy Info</Typography>
      </Stack>
      <Typography color="text.secondary" mb={3}>
        These are the policies our support team cites when answering your complaints. Browse them any time — the same
        references appear as clickable tags inside your ticket conversations.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {!docs && !error && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {groups.map(([category, items]) => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            {prettyCategory(category)}
          </Typography>
          <Stack spacing={1} mt={0.5}>
            {items.map((d) => (
              <Accordion key={d.docId} disableGutters variant="outlined" sx={{ borderRadius: 2, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: 600 }}>{d.title}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'text.secondary' }}>
                    {d.body}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Box>
      ))}

      {docs && docs.length === 0 && (
        <Typography color="text.secondary">No policy documents are available yet.</Typography>
      )}
    </Box>
  );
}
