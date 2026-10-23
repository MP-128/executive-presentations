import { useMemo, useState, type ReactNode } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Divider, FormControlLabel, Grid, MenuItem,
  Paper, Stack, Switch, TextField, Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { api, ApiError } from "../api.ts";
import { PaletteEditor } from "./PaletteEditor.tsx";
import { LogoPicker } from "./LogoPicker.tsx";
import {
  NEUTRAL_PALETTE, normalizeUrl, toPatch, validate, type ColorMode, type LogoPlacement, type SetupForm as Form,
} from "./form.ts";

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: "subject", label: "Use the subject company's colours" },
  { value: "presenting", label: "Use my company's colours" },
  { value: "neutral", label: "Neutral executive theme" },
  { value: "custom", label: "Choose custom colours" },
];

const PLACEMENTS: { value: LogoPlacement; label: string; help: string }[] = [
  { value: "title", label: "Title slide only", help: "Logos appear on the cover." },
  { value: "titleAndClosing", label: "Title and closing slides", help: "Logos appear on the cover and on a closing slide added at the end." },
  { value: "footer", label: "Discreet footer throughout", help: "Logos on the cover, plus a small logo in every slide footer (yours if included)." },
];

/** A website the lookup can use: normalised, and blank unless it parses. */
function validUrl(s: string) {
  const u = normalizeUrl(s);
  try {
    return u && new URL(u).hostname.includes(".") ? u : "";
  } catch {
    return "";
  }
}

interface Props {
  form: Form;
  onChange: (f: Form) => void;
  projectId?: string;
  hasPlan: boolean;
  onPlanRequested: (projectId: string, jobId: string) => void;
  onReturnToPlan: (projectId: string) => void;
}

export function SetupForm({ form, onChange, projectId, hasPlan, onPlanRequested, onReturnToPlan }: Props) {
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const result = useMemo(() => validate(form), [form]);
  const errors = showErrors ? result.errors ?? {} : {};
  const set = <K extends keyof Form>(key: K, value: Form[K]) => onChange({ ...form, [key]: value });
  const blurUrl = (key: "companyWebsite" | "presentingWebsite") => set(key, normalizeUrl(form[key]));

  async function submit(mode: "plan" | "return") {
    if (!result.inputs) {
      setShowErrors(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      let id = projectId;
      if (id) {
        try {
          await api.updateProject(id, toPatch(result.inputs));
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
          id = undefined; // the server no longer has this project; start a fresh one
        }
      }
      id ??= (await api.createProject(result.inputs)).projectId;
      if (mode === "return") onReturnToPlan(id);
      else onPlanRequested(id, (await api.requestPlan(id)).jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const hasStoryline = !!form.storyline.trim();
  const errorCount = Object.keys(errors).length;
  const companyLabel = form.companyName.trim() || "the subject company";
  const logoCount = Number(form.includeSubjectLogo && !!form.subjectLogoId) + Number(form.presentingInclude && !!form.presentingLogoId);

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 8 }}>
        <Stack spacing={2.5} component="form" noValidate onSubmit={(e) => { e.preventDefault(); void submit("plan"); }}>
          <Section title="Company the presentation is about">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField required label="Company name" value={form.companyName} onChange={(e) => set("companyName", e.target.value)}
                  error={!!errors.companyName} helperText={errors.companyName} autoFocus={!form.companyName} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Company website" placeholder="example.com" value={form.companyWebsite}
                  onChange={(e) => set("companyWebsite", e.target.value)} onBlur={() => blurUrl("companyWebsite")}
                  error={!!errors.companyWebsite} helperText={errors.companyWebsite ?? "Optional. Helps identify the right organisation."}
                  slotProps={{ htmlInput: { inputMode: "url", spellCheck: false } }} />
              </Grid>
            </Grid>
          </Section>

          <Section title="Purpose" description="What the presentation is for. A topic or objective is required unless you provide a storyline.">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Presentation topic" placeholder="e.g. AI-assisted customer support" value={form.topic}
                  onChange={(e) => set("topic", e.target.value)} error={!!errors.storyline} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Objective" placeholder="e.g. Secure approval for a 3-month pilot" value={form.objective}
                  onChange={(e) => set("objective", e.target.value)} error={!!errors.storyline}
                  helperText={errors.storyline ? "Add a topic or objective, or write a storyline below" : undefined} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Target audience" placeholder="e.g. Executive leadership team" value={form.audience}
                  onChange={(e) => set("audience", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Desired decision or call to action" placeholder="e.g. Approve pilot budget" value={form.callToAction}
                  onChange={(e) => set("callToAction", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Approximate slide count" type="number" value={form.slideCount}
                  onChange={(e) => set("slideCount", Math.round(Number(e.target.value)))}
                  error={!!errors.slideCount} helperText={errors.slideCount ? "Enter a number between 3 and 30" : "Between 3 and 30, including the cover"}
                  slotProps={{ htmlInput: { min: 3, max: 30 } }} />
              </Grid>
            </Grid>
          </Section>

          <Section title="Proposed storyline">
            <TextField
              label="Proposed storyline"
              multiline
              minRows={6}
              value={form.storyline}
              onChange={(e) => set("storyline", e.target.value)}
              placeholder={"1. Support backlog has doubled since 2024\n2. Options we considered\n3. Recommendation: pilot in Q1"}
              helperText="Describe your narrative, key messages, proposed slide sequence, or the decision you want the audience to make. Leave this blank to have the app propose a storyline."
            />
          </Section>

          <Section title="Presentation colours">
            <Stack spacing={2.5}>
              <TextField select label="Colour source" value={form.colorMode}
                onChange={(e) => onChange({ ...form, colorMode: e.target.value as ColorMode })}>
                {COLOR_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </TextField>
              {(form.colorMode === "subject" || form.colorMode === "presenting") && (
                <Alert severity="info">
                  Automatic colour lookup isn't connected yet. Enter {form.colorMode === "subject" ? `${companyLabel}'s` : "your company's"} confirmed
                  colours below, or switch to the neutral theme.
                </Alert>
              )}
              <PaletteEditor
                palette={form.colorMode === "neutral" ? NEUTRAL_PALETTE : form.palette}
                readOnly={form.colorMode === "neutral"}
                onChange={(p) => set("palette", p)}
                errors={errors}
              />
            </Stack>
          </Section>

          <Section title="Branding and logos" description={`Your presenting company, as distinct from ${companyLabel}.`}>
            <Stack spacing={2}>
              <FormControlLabel
                control={<Switch checked={form.presentingInclude} onChange={(e) => set("presentingInclude", e.target.checked)} />}
                label="Include my company's branding?"
              />
              {form.presentingInclude && (
                <>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField required label="Presenting company name" value={form.presentingName}
                        onChange={(e) => set("presentingName", e.target.value)}
                        error={!!errors["presentingCompany.name"]} helperText={errors["presentingCompany.name"] ?? "Shown as presenter and in the footer"} />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField label="Presenting company website" placeholder="example.com" value={form.presentingWebsite}
                        onChange={(e) => set("presentingWebsite", e.target.value)} onBlur={() => blurUrl("presentingWebsite")}
                        error={!!errors["presentingCompany.website"]} helperText={errors["presentingCompany.website"] ?? "Optional"}
                        slotProps={{ htmlInput: { inputMode: "url", spellCheck: false } }} />
                    </Grid>
                  </Grid>
                  <LogoPicker label="Your company's logo" logoId={form.presentingLogoId} onChange={(id) => set("presentingLogoId", id)}
                    website={validUrl(form.presentingWebsite)} />
                </>
              )}
              <Divider />
              <FormControlLabel
                control={<Switch checked={form.includeSubjectLogo} onChange={(e) => set("includeSubjectLogo", e.target.checked)} />}
                label={`Include ${companyLabel}'s logo`}
              />
              {form.includeSubjectLogo && (
                <>
                  <Typography variant="body2" sx={{ color: "text.secondary", mt: -1 }}>
                    Use it when you're presenting to or for {companyLabel}. Without that, the deck could be mistaken for its official material.
                  </Typography>
                  <LogoPicker label={`${companyLabel}'s logo`} logoId={form.subjectLogoId} onChange={(id) => set("subjectLogoId", id)}
                    website={validUrl(form.companyWebsite)} error={errors["logos.subject"]} />
                </>
              )}
              <TextField select label="Logo placement" value={form.logoPlacement} disabled={!logoCount}
                onChange={(e) => set("logoPlacement", e.target.value as LogoPlacement)}
                helperText={logoCount ? PLACEMENTS.find((p) => p.value === form.logoPlacement)?.help : "Choose a logo above to set where it appears"}>
                {PLACEMENTS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </TextField>
            </Stack>
          </Section>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h3">More options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2.5}>
                <TextField label="Supporting notes" multiline minRows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)}
                  helperText="Facts, figures and context you want used. Treated as source material and labelled as user-provided." />
                <Box>
                  <Button variant="outlined" startIcon={<UploadFileIcon />} disabled>Add source files</Button>
                  <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
                    PDF, TXT or Markdown, up to 5 files of 10 MB each. Source uploads are not available yet.
                  </Typography>
                </Box>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Paper variant="outlined" sx={{ p: 3, position: { md: "sticky" }, top: { md: 24 } }}>
          <Typography variant="overline" sx={{ color: "text.secondary" }}>Summary</Typography>
          <Stack spacing={1.75} sx={{ mt: 1 }}>
            <SummaryRow label="Company" value={form.companyName.trim() || "Not set"} muted={!form.companyName.trim()} />
            <SummaryRow label="Purpose" value={form.objective.trim() || form.topic.trim() || "Not set"} muted={!form.objective.trim() && !form.topic.trim()} />
            {form.audience.trim() && <SummaryRow label="Audience" value={form.audience.trim()} />}
            <SummaryRow label="Storyline"
              value={hasStoryline ? "Yours: it will be structured into a plan, keeping your narrative" : "Blank: a storyline will be proposed for you to edit"} />
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Theme</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: "center" }}>
                {Object.values(form.colorMode === "neutral" ? NEUTRAL_PALETTE : form.palette).filter(Boolean).map((c, i) => (
                  <Box key={i} sx={{ width: 18, height: 18, borderRadius: "4px", bgcolor: c, border: "1px solid", borderColor: "divider" }} />
                ))}
                <Typography variant="body2">{COLOR_MODES.find((m) => m.value === form.colorMode)?.label}</Typography>
              </Stack>
            </Box>
            <SummaryRow label="Branding" value={form.presentingInclude ? form.presentingName.trim() || "On (name missing)" : "Off"} />
            <SummaryRow label="Logos" muted={!logoCount}
              value={logoCount ? `${logoCount === 2 ? "Both logos" : "1 logo"} · ${PLACEMENTS.find((p) => p.value === form.logoPlacement)?.label.toLowerCase()}` : "None"} />
            <SummaryRow label="Length" value={`About ${form.slideCount} slides`} />
          </Stack>

          <Divider sx={{ my: 2.5 }} />
          <Stack spacing={1.5}>
            {errorCount > 0 && <Alert severity="error">Fix {errorCount === 1 ? "the highlighted field" : `${errorCount} highlighted fields`} to continue.</Alert>}
            {submitError && <Alert severity="error">{submitError}</Alert>}
            <Button variant="contained" size="large" startIcon={<AutoAwesomeIcon />} disabled={busy} onClick={() => void submit("plan")}>
              {hasPlan ? "Propose a new plan" : hasStoryline ? "Turn my storyline into a plan" : "Propose a storyline and plan"}
            </Button>
            {hasPlan && (
              <>
                <Button variant="outlined" disabled={busy} onClick={() => void submit("return")}>Save and return to current plan</Button>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  A new plan is added as the next version; earlier versions are kept.
                </Typography>
              </>
            )}
            {!hasPlan && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Nothing is generated yet. You'll review and approve the slide plan first.
              </Typography>
            )}
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" component="section" sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h2" sx={{ mb: description ? 0.5 : 2 }}>{title}</Typography>
      {description && <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>{description}</Typography>}
      {children}
    </Paper>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: muted ? "text.disabled" : "text.primary", overflowWrap: "anywhere" }}>{value}</Typography>
    </Box>
  );
}

