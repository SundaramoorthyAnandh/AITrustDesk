import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, type Product } from '../api';
import { money } from '../ui';

export function NewOrderPage() {
  const navigate = useNavigate();
  const [productList, setProductList] = useState<Product[]>([]);
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .products()
      .then((r) => {
        setProductList(r.products);
        if (r.products[0]) setSku(r.products[0].sku);
      })
      .catch((e) => setError(e.message));
  }, []);

  const selected = useMemo(() => productList.find((p) => p.sku === sku) ?? null, [productList, sku]);
  const total = selected ? selected.priceCents * quantity : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku) return;
    setBusy(true);
    setError(null);
    try {
      await api.createOrder({ sku, quantity });
      navigate('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>
        Place a new order
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ p: 3 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={submit}>
            <Stack spacing={2.5}>
              <TextField
                select
                label="Product"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
                fullWidth
              >
                {productList.map((p) => (
                  <MenuItem key={p.sku} value={p.sku}>
                    {p.name} — {money(p.priceCents, p.currency)}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                inputProps={{ min: 1, max: 20 }}
                sx={{ width: 160 }}
              />

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
                <Button type="submit" variant="contained" disabled={busy || !sku}>
                  Place order
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
