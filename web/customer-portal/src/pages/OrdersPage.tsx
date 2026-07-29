import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { api, type Order } from '../api';
import { Mono, formatDate, money } from '../ui';

/** Progressive column disclosure — hide low-priority columns on narrow screens. */
const SM_UP = { display: { xs: 'none', sm: 'table-cell' } } as const;
const MD_UP = { display: { xs: 'none', md: 'table-cell' } } as const;
const LG_UP = { display: { xs: 'none', lg: 'table-cell' } } as const;

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .orders()
      .then((r) => setOrders(r.orders))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">My orders</Typography>
        <Button variant="contained" startIcon={<AddShoppingCartIcon />} component={RouterLink} to="/orders/new">
          Place new order
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!orders && !error && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {orders && orders.length === 0 && (
        <Card variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No orders yet. Place one to get started.</Typography>
        </Card>
      )}

      {orders && orders.length > 0 && (
        // Responsive: secondary columns drop out on narrow screens (their data
        // folds into the Item cell) and any remainder scrolls instead of clipping.
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: { xs: 0, sm: 560 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={MD_UP}>Order</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right" sx={SM_UP}>Qty</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell sx={SM_UP}>Status</TableCell>
                <TableCell sx={LG_UP}>Ordered</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell sx={MD_UP} title={o.id}>
                    <Mono>{o.id.slice(0, 14)}…</Mono>
                  </TableCell>
                  <TableCell sx={{ maxWidth: { xs: 200, sm: 280 } }}>
                    <Typography variant="body2" noWrap title={o.itemName ?? ''}>
                      {o.itemName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      <Mono>{o.itemSku}</Mono>
                    </Typography>
                    {/* Folded-in details for the columns hidden at this width. */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.5 }}
                    >
                      Qty {o.quantity} · {o.status} · {formatDate(o.orderDate)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={SM_UP}>
                    {o.quantity}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 650 }}>
                    {money(o.amountCents, o.currency)}
                  </TableCell>
                  <TableCell sx={SM_UP}>{o.status}</TableCell>
                  <TableCell sx={LG_UP}>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {formatDate(o.orderDate)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
