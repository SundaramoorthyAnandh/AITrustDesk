import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, CircularProgress, Divider, IconButton, Link, Popover, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { api, type KbDoc } from '../api';

// Load the customer-visible KB once and share it across every chip on the page,
// so chips can show the friendly title (not the raw KB id) without N requests.
let indexPromise: Promise<Map<string, KbDoc>> | null = null;
function loadKbIndex(): Promise<Map<string, KbDoc>> {
  if (!indexPromise) {
    indexPromise = api
      .kb()
      .then((r) => new Map(r.documents.map((d) => [d.docId, d])))
      .catch(() => new Map<string, KbDoc>());
  }
  return indexPromise;
}

export function prettyCategory(category: string | null): string {
  if (!category) return 'Policy';
  return category
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * A policy citation rendered as a friendly, clickable chip. The label shows the
 * policy's plain title (never the internal KB id), and clicking opens a popover
 * with the customer-facing explanation.
 */
export function KbCitationChip({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [doc, setDoc] = useState<KbDoc | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadKbIndex().then((m) => {
      if (!alive) return;
      setDoc(m.get(docId) ?? null);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [docId]);

  const label = doc?.title ?? 'Policy';

  return (
    <>
      <Chip
        label={label}
        size="small"
        variant="outlined"
        color="primary"
        icon={<MenuBookIcon />}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        clickable
        aria-label={`Read policy: ${label}`}
        sx={{ fontWeight: 600, cursor: 'pointer', maxWidth: 320 }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 440,
              borderRadius: 2,
              // Solid, fully-opaque surface — this popover sits over dense text
              // (conversation bubbles), so it must NOT inherit the app's
              // translucent glassmorphic Paper background.
              backgroundColor: '#FFFFFF',
              backgroundImage: 'none',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              boxShadow: '0 8px 40px rgba(11,18,32,0.28)',
            },
          },
        }}
      >
        <Box sx={{ position: 'relative', p: 2.5, pr: 5, maxHeight: 400, overflowY: 'auto' }}>
          <IconButton
            aria-label="Close"
            size="small"
            onClick={() => setAnchorEl(null)}
            sx={{ position: 'absolute', top: 8, right: 8 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          {!ready && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={22} />
            </Box>
          )}
          {ready && !doc && (
            <Typography variant="body2" color="text.secondary">
              We couldn’t load this policy right now. Please try again shortly.
            </Typography>
          )}
          {ready && doc && (
            <>
              <Chip label={prettyCategory(doc.category)} size="small" color="primary" sx={{ mb: 1 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {doc.title}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                {doc.body}
              </Typography>
              <Divider sx={{ my: 1.5 }} />
              <Link
                component="button"
                type="button"
                variant="caption"
                onClick={() => {
                  setAnchorEl(null);
                  navigate('/warranty-info');
                }}
                sx={{ fontWeight: 600 }}
              >
                View all policies →
              </Link>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}
