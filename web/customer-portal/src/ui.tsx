import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { mono } from './theme';

/** Monospaced inline text for IDs, SKUs and policy codes. */
export function Mono({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box component="span" sx={{ fontFamily: mono, fontSize: '0.86em', letterSpacing: '-0.01em', ...sx }}>
      {children}
    </Box>
  );
}

const STATUS_COLOR: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  open: 'info',
  triaged: 'info',
  awaiting_agent: 'warning',
  awaiting_customer: 'warning',
  resolved: 'success',
  closed: 'default',
};
const PRIORITY_COLOR: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'error',
};

export function StatusChip({ status }: { status: string }) {
  return <Chip size="small" label={status.replace(/_/g, ' ')} color={STATUS_COLOR[status] ?? 'default'} />;
}

export function PriorityChip({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return <Chip size="small" variant="outlined" label={priority} color={PRIORITY_COLOR[priority] ?? 'default'} />;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
