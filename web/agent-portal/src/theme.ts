import { createTheme, alpha } from '@mui/material/styles';

/**
 * Agent console — dark glassmorphic design system.
 *
 * Deep navy canvas with an indigo/cyan gradient mesh, translucent blurred
 * surfaces, hairline light borders and soft glow accents. Plus Jakarta Sans for
 * UI, JetBrains Mono for IDs/citations/trace data.
 */

const INDIGO = '#818CF8';
const CYAN = '#22D3EE';
const CANVAS = '#070B18';
const SURFACE = '#0F1626';

/** Frosted-glass surface for cards, app bar, inputs. */
export const glass = (opacity = 0.055, blur = 20) => ({
  backgroundColor: `rgba(255,255,255,${opacity})`,
  backdropFilter: `blur(${blur}px) saturate(160%)`,
  WebkitBackdropFilter: `blur(${blur}px) saturate(160%)`,
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 1px 1px rgba(0,0,0,0.3), 0 16px 40px -18px rgba(0,0,0,0.8)',
});

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: INDIGO, dark: '#6366F1', light: '#A5B4FC', contrastText: '#0B1020' },
    secondary: { main: CYAN, light: '#67E8F9' },
    success: { main: '#34D399' },
    warning: { main: '#FBBF24' },
    error: { main: '#F87171' },
    info: { main: '#38BDF8' },
    background: { default: CANVAS, paper: SURFACE },
    text: { primary: '#E8ECF8', secondary: alpha('#E8ECF8', 0.62) },
    divider: 'rgba(255,255,255,0.09)',
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.03em' },
    h5: { fontWeight: 800, letterSpacing: '-0.03em' },
    h6: { fontWeight: 700, letterSpacing: '-0.02em' },
    subtitle1: { fontWeight: 700, letterSpacing: '-0.01em' },
    button: { fontWeight: 650, letterSpacing: 0 },
    overline: { fontWeight: 700, letterSpacing: '0.12em', fontSize: 11 },
    caption: { letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        body: {
          backgroundColor: CANVAS,
          backgroundImage: `
            radial-gradient(60rem 38rem at 0% -8%, ${alpha(INDIGO, 0.3)} 0%, transparent 58%),
            radial-gradient(50rem 34rem at 100% 0%, ${alpha(CYAN, 0.16)} 0%, transparent 60%),
            radial-gradient(55rem 45rem at 60% 120%, ${alpha('#A855F7', 0.16)} 0%, transparent 62%)`,
          backgroundAttachment: 'fixed',
          minHeight: '100vh',
        },
        '::selection': { background: alpha(INDIGO, 0.4) },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(255,255,255,0.16)',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { background: 'rgba(255,255,255,0.28)', backgroundClip: 'content-box' },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(10,15,28,0.6)',
          backdropFilter: 'blur(18px) saturate(160%)',
          WebkitBackdropFilter: 'blur(18px) saturate(160%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          ...glass(),
          borderRadius: 20,
          backgroundImage: 'none',
          transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { ...glass(), borderRadius: 18 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999, textTransform: 'none', paddingInline: 18, paddingBlock: 9 },
        contained: {
          background: `linear-gradient(135deg, #6366F1 0%, ${INDIGO} 55%, ${CYAN} 180%)`,
          color: '#0B1020',
          fontWeight: 700,
          boxShadow: `0 6px 20px -8px ${alpha(INDIGO, 0.9)}`,
          '&:hover': { boxShadow: `0 10px 28px -8px ${alpha(INDIGO, 1)}`, transform: 'translateY(-1px)' },
          '&.Mui-disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', boxShadow: 'none' },
        },
        outlined: {
          borderColor: 'rgba(255,255,255,0.16)',
          backgroundColor: 'rgba(255,255,255,0.03)',
          '&:hover': { borderColor: alpha(INDIGO, 0.6), backgroundColor: alpha(INDIGO, 0.1) },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.04)',
          transition: 'box-shadow .16s ease, background-color .16s ease',
          '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.22)' },
          '&.Mui-focused': {
            backgroundColor: 'rgba(255,255,255,0.07)',
            boxShadow: `0 0 0 4px ${alpha(INDIGO, 0.18)}`,
          },
          '&.Mui-focused fieldset': { borderColor: INDIGO, borderWidth: 1.5 },
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 4, fontWeight: 500 } } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 650 },
        outlined: { backgroundColor: 'rgba(255,255,255,0.04)' },
        sizeSmall: { height: 24 },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: { height: 3, borderRadius: 3, background: `linear-gradient(90deg, ${INDIGO}, ${CYAN})` },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, minHeight: 44 } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, border: '1px solid', fontWeight: 500, backgroundImage: 'none' },
        standardError: { borderColor: alpha('#F87171', 0.3), backgroundColor: alpha('#F87171', 0.12) },
        standardInfo: { borderColor: alpha('#38BDF8', 0.3), backgroundColor: alpha('#38BDF8', 0.12) },
        standardSuccess: { borderColor: alpha('#34D399', 0.3), backgroundColor: alpha('#34D399', 0.12) },
        standardWarning: { borderColor: alpha('#FBBF24', 0.32), backgroundColor: alpha('#FBBF24', 0.13) },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'rgba(255,255,255,0.07)' },
        head: {
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: alpha('#E8ECF8', 0.55),
          backgroundColor: 'transparent',
        },
      },
    },
    MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: alpha(INDIGO, 0.08) } } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, height: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
        bar: { borderRadius: 999, background: `linear-gradient(90deg, ${INDIGO}, ${CYAN})` },
      },
    },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 14, ...glass(0.08, 18) } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 8, backgroundColor: '#1E293B', fontWeight: 600, fontSize: 12 },
      },
    },
  },
});

/** Monospace stack for IDs, SKUs, citation codes and trace data. */
export const mono = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';
