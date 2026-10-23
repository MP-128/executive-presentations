import { useId, type ReactNode } from "react";
import { Box, Chip, Collapse, Grid, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import type { PlanSlide } from "../../../shared/contract.ts";

// Layouts the deck builder understands (DeckSlide patterns in shared/contract.ts; the cover is added automatically).
export const PATTERNS: Record<string, string> = {
  execSummary: "Executive summary",
  agenda: "Agenda",
  section: "Section divider",
  bullets: "Key points",
  twoColumns: "Two columns",
  processFlow: "Process flow",
  kpiTiles: "KPI tiles",
  chartPanel: "Chart with takeaway",
  comparisonTable: "Options comparison",
  roadmap: "Roadmap",
  riskTable: "Risk register",
  matrix2x2: "2×2 matrix",
};

const EVIDENCE: Record<PlanSlide["evidence"], string> = {
  verified: "Verified (sourced)",
  "user-provided": "User-provided",
  estimate: "Estimate",
  illustrative: "Illustrative",
};

interface Props {
  slide: PlanSlide;
  index: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (s: PlanSlide) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

/** One planned slide: a compact header for scanning the story, expandable into a full editor. */
export function SlideCard({ slide, index, count, expanded, onToggle, onChange, onMove, onRemove }: Props) {
  const detailsId = useId();
  const set = <K extends keyof PlanSlide>(key: K, value: PlanSlide[K]) => onChange({ ...slide, [key]: value });
  const suggested = slide.origin === "suggested";
  const missingTitle = !slide.title.trim();
  const openItems = slide.assumptions.filter((a) => a.trim()).length;

  return (
    <Paper
      variant="outlined"
      id={`slide-${index}`}
      sx={{ borderLeft: 4, borderLeftColor: suggested ? "secondary.main" : "primary.main", scrollMarginTop: 24 }}
    >
      <Stack direction="row" spacing={1.5} sx={{ p: { xs: 1.5, sm: 2 }, alignItems: "flex-start" }}>
        <Typography sx={{ fontWeight: 600, color: "text.secondary", minWidth: 24, pt: 0.25, fontVariantNumeric: "tabular-nums" }}>
          {index + 1}
        </Typography>
        <Box
          sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}
          onClick={onToggle}
        >
          <Typography variant="subtitle2" component="h3" sx={{ color: missingTitle ? "error.main" : "text.primary" }}>
            {missingTitle ? "Untitled slide: add a title" : slide.title}
          </Typography>
          {slide.takeaway && <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>{slide.takeaway}</Typography>}
          <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}>
            <Chip size="small" label={suggested ? "Suggested" : "From your storyline"} color={suggested ? "secondary" : "primary"}
              variant={suggested ? "outlined" : "filled"} />
            <Chip size="small" variant="outlined" label={PATTERNS[slide.pattern] ?? slide.pattern} />
            <Chip size="small" variant="outlined" label={EVIDENCE[slide.evidence]} />
            {openItems > 0 && (
              <Chip size="small" color="warning" variant="outlined" icon={<ErrorOutlinedIcon />}
                label={`${openItems} open item${openItems === 1 ? "" : "s"}`} />
            )}
          </Stack>
        </Box>
        <Stack direction="row" sx={{ flexShrink: 0 }}>
          <Tooltip title="Move up"><span>
            <IconButton size="small" aria-label={`Move slide ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
          </span></Tooltip>
          <Tooltip title="Move down"><span>
            <IconButton size="small" aria-label={`Move slide ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
          </span></Tooltip>
          <Tooltip title="Remove slide"><span>
            <IconButton size="small" aria-label={`Remove slide ${index + 1}`} disabled={count === 1} onClick={onRemove}><DeleteOutlinedIcon fontSize="small" /></IconButton>
          </span></Tooltip>
          <Tooltip title={expanded ? "Collapse" : "Edit slide"}>
            <IconButton size="small" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Collapse" : "Edit"} slide ${index + 1}`} onClick={onToggle}
              sx={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Collapse in={expanded} unmountOnExit>
        <Box id={detailsId} sx={{ px: { xs: 1.5, sm: 2 }, pb: 2.5, pt: 0.5, borderTop: 1, borderColor: "divider" }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField required label="Slide title" value={slide.title} onChange={(e) => set("title", e.target.value)}
                error={missingTitle} helperText={missingTitle ? "A title is required" : "Write the title as the message, not the topic"} />
            </Grid>
            <Grid size={12}>
              <TextField label="Main takeaway" value={slide.takeaway} onChange={(e) => set("takeaway", e.target.value)} multiline />
            </Grid>
            <Grid size={12}>
              <LinesField label="Supporting points" value={slide.points} onChange={(v) => set("points", v)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField select label="Layout" value={slide.pattern} onChange={(e) => set("pattern", e.target.value)}>
                {Object.entries(PATTERNS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                {!(slide.pattern in PATTERNS) && <MenuItem value={slide.pattern}>{slide.pattern}</MenuItem>}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField label="Proposed visual" value={slide.visual} onChange={(e) => set("visual", e.target.value)}
                placeholder="e.g. Bar chart of monthly ticket volume, latest month highlighted" />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField select label="Evidence" value={slide.evidence} onChange={(e) => set("evidence", e.target.value as PlanSlide["evidence"])}
                helperText="How well supported this slide's claims are">
                {Object.entries(EVIDENCE).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 7 }}>
              <LinesField label="Sources" value={slide.sources} onChange={(v) => set("sources", v)} minRows={2}
                helper="One per line. Leave empty rather than guess." />
            </Grid>
            <Grid size={12}>
              <LinesField label="Missing information and assumptions" value={slide.assumptions} onChange={(v) => set("assumptions", v)} minRows={2}
                helper="What still needs confirming before this slide is accurate" />
            </Grid>
          </Grid>
        </Box>
      </Collapse>
    </Paper>
  );
}

/** A string[] edited as one item per line. Blank lines are kept while typing and dropped on save. */
function LinesField({ label, value, onChange, minRows = 3, helper = "One per line" }: {
  label: string; value: string[]; onChange: (v: string[]) => void; minRows?: number; helper?: ReactNode;
}) {
  return (
    <TextField label={label} multiline minRows={minRows} value={value.join("\n")} helperText={helper}
      onChange={(e) => onChange(e.target.value === "" ? [] : e.target.value.split("\n"))} />
  );
}
