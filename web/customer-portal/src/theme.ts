import { createTheme } from '@mui/material/styles';

/** Customer portal theme — calm teal/indigo, distinct from the agent portal. */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0f766e' }, // teal-700
    secondary: { main: '#4f46e5' }, // indigo-600
    background: { default: '#f6f8f8', paper: '#ffffff' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
