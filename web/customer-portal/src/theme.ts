import { createTheme, alpha } from '@mui/material/styles';

/**
 * Customer portal — light glassmorphic design system.
 *
 * Surfaces are translucent + blurred over a soft gradient-mesh backdrop, with
 * hairline light borders and layered, low-opacity shadows. Type is Plus Jakarta
 * Sans (geometric humanist), with JetBrains Mono reserved for IDs/codes.
 */

const TEAL = '#0EA5A4';
const VIOLET = '#7C5CFF';
const INK = '#0B1220';

/** Frosted-glass surface used by cards, app bar, inputs. */
export const glass = (opacity = 0.72, blur = 20) => ({
  backgroundColor: `rgba(255,255,255,${opacity})`,
  backdropFilter: `blur(${blur}px) saturate(180%)`,
  WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 1px 2px rgba(11,18,32,0.04), 0 12px 32px -12px rgba(11,18,32,0.16)',
});

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: TEAL, dark: '#0B7F7E', light: '#5EEAD4', contrastText: '#04201F' },
    secondary: { main: VIOLET, light: '#A78BFA' },
    success: { main: '#10B981' },
    warning: { main: '#F59E0B' },
    error: { main: '#EF4444' },
    info: { main: '#0EA5E9' },
    background: { default: '#F4F7F8', paper: 'rgba(255,255,255,0.72)' },
    text: { primary: INK, secondary: alpha(INK, 0.6) },
    divider: alpha(INK, 0.08),
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
          backgroundColor: '#F4F7F8',
          // Gradient mesh backdrop — fixed so content scrolls over it.
          backgroundImage: `
            radial-gradient(70rem 40rem at 8% -10%, ${alpha(TEAL, 0.22)} 0%, transparent 60%),
            radial-gradient(55rem 35rem at 105% 5%, ${alpha(VIOLET, 0.18)} 0%, transparent 62%),
            radial-gradient(45rem 40rem at 55% 115%, ${alpha('#38BDF8', 0.16)} 0%, transparent 60%)`,
          backgroundAttachment: 'fixed',
          minHeight: '100vh',
        },
        '::selection': { background: alpha(TEAL, 0.25) },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          background: alpha(INK, 0.18),
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { background: alpha(INK, 0.3), backgroundClip: 'content-box' },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.7)',
          color: INK,
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
          transition: 'transform .18s ease, box-shadow .18s ease',
        },
      },
    },
    MuiCardActionArea: { styleOverrides: { root: { borderRadius: 20 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999, textTransform: 'none', paddingInline: 18, paddingBlock: 9 },
        contained: {
          background: `linear-gradient(135deg, ${TEAL} 0%, #14B8A6 55%, ${VIOLET} 165%)`,
          color: '#fff',
          boxShadow: `0 6px 18px -6px ${alpha(TEAL, 0.6)}`,
          '&:hover': { boxShadow: `0 10px 26px -8px ${alpha(TEAL, 0.7)}`, transform: 'translateY(-1px)' },
          '&.Mui-disabled': { background: alpha(INK, 0.08), color: alpha(INK, 0.35), boxShadow: 'none' },
        },
        outlined: {
          borderColor: alpha(INK, 0.14),
          backgroundColor: 'rgba(255,255,255,0.5)',
          '&:hover': { borderColor: alpha(TEAL, 0.5), backgroundColor: 'rgba(255,255,255,0.8)' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.6)',
          transition: 'box-shadow .16s ease, background-color .16s ease',
          '& fieldset': { borderColor: alpha(INK, 0.12) },
          '&:hover fieldset': { borderColor: alpha(INK, 0.22) },
          '&.Mui-focused': {
            backgroundColor: 'rgba(255,255,255,0.92)',
            boxShadow: `0 0 0 4px ${alpha(TEAL, 0.14)}`,
          },
          '&.Mui-focused fieldset': { borderColor: TEAL, borderWidth: 1.5 },
        },
        input: { '&::placeholder': { opacity: 0.5 } },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 4, fontWeight: 500 } } },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 650, letterSpacing: '0.01em' },
        outlined: { backgroundColor: 'rgba(255,255,255,0.55)' },
        sizeSmall: { height: 24 },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: { height: 3, borderRadius: 3, background: `linear-gradient(90deg, ${TEAL}, ${VIOLET})` },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, minHeight: 44 } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, border: '1px solid', fontWeight: 500 },
        standardError: { borderColor: alpha('#EF4444', 0.25), backgroundColor: alpha('#EF4444', 0.08) },
        standardInfo: { borderColor: alpha('#0EA5E9', 0.25), backgroundColor: alpha('#0EA5E9', 0.08) },
        standardSuccess: { borderColor: alpha('#10B981', 0.25), backgroundColor: alpha('#10B981', 0.08) },
        standardWarning: { borderColor: alpha('#F59E0B', 0.28), backgroundColor: alpha('#F59E0B', 0.1) },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: alpha(INK, 0.07) },
        head: {
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: alpha(INK, 0.55),
          backgroundColor: 'transparent',
        },
      },
    },
    MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: alpha(TEAL, 0.045) } } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 14, ...glass(0.9, 16) } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 8, backgroundColor: alpha(INK, 0.92), fontWeight: 600, fontSize: 12 },
      },
    },
  },
});

/** Monospace stack for IDs, SKUs and citation codes. */
export const mono = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';
