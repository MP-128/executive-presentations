import { createTheme } from "@mui/material/styles";

// Restrained executive palette, aligned with the skill's neutral deck palette (provisional-palette.json).
export const theme = createTheme({
  palette: {
    primary: { main: "#1E293B", contrastText: "#FFFFFF" },
    secondary: { main: "#2F6690" },
    success: { main: "#2E7D5B" },
    warning: { main: "#A15C00" },
    error: { main: "#B42318" },
    background: { default: "#F6F7F9", paper: "#FFFFFF" },
    text: { primary: "#0F172A", secondary: "#475569" },
    divider: "#E2E8F0",
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.01em" },
    h2: { fontSize: "1.25rem", fontWeight: 600 },
    h3: { fontSize: "1rem", fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    overline: { fontWeight: 600, letterSpacing: "0.08em", lineHeight: 2 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: "#E2E8F0" } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { fullWidth: true } },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: { border: "1px solid #E2E8F0", borderRadius: 10, "&::before": { display: "none" } },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});
