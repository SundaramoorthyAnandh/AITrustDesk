import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, type Order, type Product } from '../api';
import { money, Mono } from '../ui';

/** A customer's own registrations (excludes system-created ORD-REP-* replacements). */
const registeredSkusOf = (orders: Order[]) =>
  new Set(orders.filter((o) => !o.id.startsWith('ORD-REP-')).map((o) => o.itemSku));

// Local YYYY-MM-DD (for the date input's max + default), avoiding UTC drift.
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function NewOrderPage() {
  const navigate = useNavigate();
  const [productList, setProductList] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Load the catalog and the customer's existing registrations together so we can
    // default to (and only allow) a product they haven't registered yet.
    Promise.all([api.products(), api.orders()])
      .then(([p, o]) => {
        setProductList(p.products);
        setOrders(o.orders);
        const registered = registeredSkusOf(o.orders);
        const firstAvailable = p.products.find((pr) => !registered.has(pr.sku)) ?? p.products[0];
        if (firstAvailable) setSku(firstAvailable.sku);
      })
      .catch((e) => setError(e.message));
  }, []);

  const registeredSkus = useMemo(() => registeredSkusOf(orders), [orders]);
  const selected = useMemo(() => productList.find((p) => p.sku === sku) ?? null, [productList, sku]);
  const total = selected ? selected.priceCents * quantity : 0;

  const today = todayISO();
  const purchaseDateError =
    !purchaseDate ? 'Purchase date is required' : purchaseDate > today ? 'Purchase date cannot be in the future' : null;
  const skuAlreadyRegistered = !!sku && registeredSkus.has(sku);
  const formValid = !!sku && !purchaseDateError && !skuAlreadyRegistered;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setBusy(true);
    setError(null);
    try {
      await api.createOrder({ sku, quantity, purchaseDate });
      navigate('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register product');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Register a product
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ p: 3 }}>
          {error && (
            <Alert severity={/already/i.test(error) ? 'warning' : 'error'} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <form onSubmit={submit}>
            <Stack spacing={2.5}>
              <TextField
                select
                label="Product"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                fullWidth
                error={skuAlreadyRegistered}
                helperText={
                  skuAlreadyRegistered
                    ? 'Product registered already. Please check your registered products once again.'
                    : 'Each product can be registered once per account'
                }
              >
                {productList.map((p) => {
                  const already = registeredSkus.has(p.sku);
                  return (
                    <MenuItem key={p.sku} value={p.sku} disabled={already}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <span>
                          <Mono>{p.sku}</Mono> - {p.name}
                        </span>
                        {already && (
                          <Chip label="Already registered" size="small" color="default" sx={{ ml: 'auto' }} />
                        )}
                      </Box>
                    </MenuItem>
                  );
                })}
              </TextField>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  inputProps={{ min: 1, max: 20 }}
                  sx={{ width: 160 }}
                />

                <TextField
                  label="Purchase date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                  error={!!purchaseDateError}
                  helperText={purchaseDateError ?? 'When you bought it — sets your return & warranty windows'}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: today }}
                  sx={{ flex: 1 }}
                />
              </Stack>

              <Typography variant="caption" color="text.secondary">
                Registration date is recorded automatically as today ({today}), separately from your purchase date.
              </Typography>

              {selected && (
                <>
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography color="text.secondary">Order total</Typography>
                    <Typography variant="h6">{money(total, selected.currency)}</Typography>
                  </Stack>
                </>
              )}

              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button onClick={() => navigate('/orders')}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={busy || !formValid}>
                  Register product
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
