import Chip from '@mui/material/Chip';

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
const DRAFT_COLOR: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  draft: 'success',
  sent: 'success',
  escalated: 'warning',
  refused: 'error',
};
const CATEGORY_COLOR: Record<string, 'default' | 'primary' | 'secondary'> = {
  account_security: 'secondary',
};

export function StatusChip({ status }: { status: string }) {
  return <Chip size="small" label={status.replace(/_/g, ' ')} color={STATUS_COLOR[status] ?? 'default'} />;
}
export function PriorityChip({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return <Chip size="small" variant="outlined" label={priority} color={PRIORITY_COLOR[priority] ?? 'default'} />;
}
export function CategoryChip({ category }: { category: string | null }) {
  if (!category) return null;
  return <Chip size="small" label={category.replace(/_/g, ' ')} color={CATEGORY_COLOR[category] ?? 'primary'} variant="outlined" />;
}
export function DraftStatusChip({ status }: { status: string }) {
  return <Chip size="small" label={status} color={DRAFT_COLOR[status] ?? 'default'} />;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
