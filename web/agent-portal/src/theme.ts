import { createTheme } from '@mui/material/styles';

/** Agent console theme — dark, operations-desk feel, distinct from the customer portal. */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6366f1' }, // indigo-500
    secondary: { main: '#22d3ee' }, // cyan-400
    background: { default: '#0f172a', paper: '#1e293b' }, // slate-900 / slate-800
    success: { main: '#34d399' },
    warning: { main: '#fbbf24' },
    error: { main: '#f87171' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});
