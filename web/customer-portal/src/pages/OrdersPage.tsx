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
import { formatDate, money } from '../ui';

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
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ordered</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell>{o.id}</TableCell>
                  <TableCell>
                    {o.itemName}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {o.itemSku}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{o.quantity}</TableCell>
                  <TableCell align="right">{money(o.amountCents, o.currency)}</TableCell>
                  <TableCell>{o.status}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{formatDate(o.orderDate)}</Typography>
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
