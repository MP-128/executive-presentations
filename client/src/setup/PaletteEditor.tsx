import type { ChangeEvent } from "react";
import { Box, Chip, Stack, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { contrast, isHex, type SetupForm } from "./form.ts";

type Palette = SetupForm["palette"];

const FIELDS: { key: keyof Palette; label: string; help: string }[] = [
  { key: "dark", label: "Primary (dark)", help: "Cover and section backgrounds" },
  { key: "accent", label: "Accent", help: "Highlights and focus data" },
  { key: "accent2", label: "Secondary accent", help: "Optional second data series" },
];

/** Editable palette with a live miniature of the cover and a content slide. */
export function PaletteEditor({ palette, onChange, readOnly, errors }: {
  palette: Palette;
  onChange: (p: Palette) => void;
  readOnly?: boolean;
  errors: Record<string, string>;
}) {
  return (
    <Stack spacing={2.5}>
      {!readOnly && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          {FIELDS.map(({ key, label, help }) => {
            const value = palette[key];
            const err = errors[`palette.${key}`];
            return (
              <Stack key={key} direction="row" spacing={1} sx={{ flex: 1, alignItems: "flex-start" }}>
                <Box
                  component="input"
                  type="color"
                  aria-label={`${label} colour picker`}
                  value={isHex(value) ? value : "#ffffff"}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...palette, [key]: e.target.value.toUpperCase() })}
                  sx={{ width: 40, height: 40, mt: 0.5, p: 0, border: "1px solid", borderColor: "divider", borderRadius: 1, cursor: "pointer", bgcolor: "transparent" }}
                />
                <TextField
                  size="small"
                  label={label}
                  value={value}
                  placeholder={key === "accent2" ? "Optional" : "#RRGGBB"}
                  error={!!err}
                  helperText={err ?? help}
                  onChange={(e) => onChange({ ...palette, [key]: e.target.value.trim() })}
                  slotProps={{ htmlInput: { spellCheck: false, maxLength: 7 } }}
                />
              </Stack>
            );
          })}
        </Stack>
      )}
      <SlidePreview palette={palette} />
    </Stack>
  );
}

function SlidePreview({ palette }: { palette: Palette }) {
  const dark = isHex(palette.dark) ? palette.dark : "#1E293B";
  const accent = isHex(palette.accent) ? palette.accent : "#2F6690";
  const accent2 = isHex(palette.accent2) ? palette.accent2 : "#94A3B8";
  const coverRatio = contrast("#FFFFFF", dark);
  const accentRatio = contrast(accent, "#FFFFFF");
  const frame = { aspectRatio: "16 / 9", borderRadius: 1, overflow: "hidden", border: "1px solid", borderColor: "divider", position: "relative" } as const;

  return (
    <Box>
      <Stack direction="row" spacing={1.5} aria-hidden>
        <Box sx={{ ...frame, flex: 1, bgcolor: dark, p: 1.5 }}>
          <Box sx={{ width: 24, height: 3, bgcolor: accent, mb: 1 }} />
          <Typography sx={{ color: "#FFFFFF", fontWeight: 600, fontSize: 12, lineHeight: 1.25 }}>Cover title</Typography>
          <Typography sx={{ color: "#FFFFFF", opacity: 0.75, fontSize: 9 }}>Subtitle and date</Typography>
        </Box>
        <Box sx={{ ...frame, flex: 1, bgcolor: "#FFFFFF", p: 1.5 }}>
          <Typography sx={{ color: "#0F172A", fontWeight: 600, fontSize: 10, lineHeight: 1.25, mb: 1 }}>Action title states the message</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-end", height: "45%" }}>
            {[0.45, 0.6, 0.5, 0.95].map((h, i) => (
              <Box key={i} sx={{ flex: 1, height: `${h * 100}%`, bgcolor: i === 3 ? accent : i === 1 ? accent2 : "#CBD5E1" }} />
            ))}
          </Stack>
        </Box>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
        <ContrastChip label="Cover text" ratio={coverRatio} min={4.5} />
        <ContrastChip label="Accent on white" ratio={accentRatio} min={3} />
      </Stack>
    </Box>
  );
}

function ContrastChip({ label, ratio, min }: { label: string; ratio: number; min: number }) {
  const ok = ratio >= min;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={ok ? "success" : "warning"}
      icon={ok ? <CheckIcon /> : <WarningAmberIcon />}
      label={`${label}: ${ratio.toFixed(1)}:1${ok ? "" : ` (needs ${min}:1)`}`}
    />
  );
}
