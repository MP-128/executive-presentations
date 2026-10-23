import { useCallback, useEffect, useState } from "react";
import {
  Alert, AlertTitle, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Divider, Grid, Link, Paper, Skeleton, Snackbar, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Plan, PlanSlide, PlanVersion } from "../../../shared/contract.ts";
import { api } from "../api.ts";
import { keys, usePersistentState } from "../persist.ts";
import { useJob } from "../useJob.ts";
import { SlideCard } from "./SlideCard.tsx";

type Editable = Omit<Plan, "generatedBy">;
/** Unsaved edits, kept in localStorage until saved as a new plan version. */
interface Draft { baseVersion: number; plan: Editable }

interface Props {
  projectId: string;
  planJobId?: string;
  onPlanJob: (jobId: string | undefined) => void;
  onGenerate: (jobId: string) => void;
  onEditSetup: () => void;
}

const blankSlide = (): PlanSlide => ({
  title: "", takeaway: "", points: [], pattern: "bullets", visual: "", sources: [], evidence: "user-provided", assumptions: [], origin: "user",
});

const tidy = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);
const clean = (p: Editable): Editable => ({
  storyline: p.storyline.trim(),
  slides: p.slides.map((s) => ({
    ...s, title: s.title.trim(), takeaway: s.takeaway.trim(), visual: s.visual.trim(),
    points: tidy(s.points), sources: tidy(s.sources), assumptions: tidy(s.assumptions),
  })),
});
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PlanReview({ projectId, planJobId, onPlanJob, onGenerate, onEditSetup }: Props) {
  const [plans, setPlans] = useState<PlanVersion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = usePersistentState<Draft | null>(keys.planDraft(projectId), null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "save" | "approve" | "regenerate">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "approve" | "regenerate">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ slide: PlanSlide; index: number } | null>(null);
  const { job: planJob, error: planJobError, retry: retryPlanJob } = useJob(planJobId);

  const loadPlans = useCallback(async () => {
    try {
      setPlans((await api.listPlans(projectId)).plans);
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, [projectId]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  // A finished planning job has written a new version: load it and stop tracking the job.
  useEffect(() => {
    if (planJob?.status === "succeeded" || planJobError?.notFound) {
      onPlanJob(undefined);
      void loadPlans();
    }
  }, [planJob?.status, planJobError?.notFound, onPlanJob, loadPlans]);

  const planning = !!planJobId && !planJobError?.notFound && (!planJob || planJob.status === "queued" || planJob.status === "running");

  if (planning) return <PlanningState queued={planJob?.status === "queued"} />;

  if (planJob?.status === "failed") {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => void retryPlanJob().catch((e) => setLoadError(errMsg(e)))}>Retry</Button>}>
        <AlertTitle>Planning failed</AlertTitle>
        {planJob.error ?? "The planner stopped without an error message."}
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Link component="button" onClick={onEditSetup}>Back to setup</Link>
          {!!plans?.length && <Link component="button" onClick={() => onPlanJob(undefined)}>Keep the current plan</Link>}
        </Stack>
      </Alert>
    );
  }

  if (loadError && !plans) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => void loadPlans()}>Try again</Button>}>
        <AlertTitle>Couldn't load the plan</AlertTitle>
        {loadError}
        <Box sx={{ mt: 1 }}><Link component="button" onClick={onEditSetup}>Back to setup</Link></Box>
      </Alert>
    );
  }

  if (!plans) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={140} />
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={88} />)}
      </Stack>
    );
  }

  const latest = plans.at(-1);
  async function regenerate() {
    setConfirm(null);
    setBusy("regenerate");
    setActionError(null);
    try {
      const { jobId } = await api.requestPlan(projectId);
      setDraft(null);
      onPlanJob(jobId);
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  if (!latest) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h2">No plan yet</Typography>
        <Typography sx={{ color: "text.secondary", mt: 1, mb: 3 }}>Propose a storyline and slide plan from your setup inputs.</Typography>
        {actionError && <Alert severity="error" sx={{ mb: 2, textAlign: "left" }}>{actionError}</Alert>}
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: "center" }}>
          <Button variant="outlined" onClick={onEditSetup}>Edit setup</Button>
          <Button variant="contained" disabled={!!busy} onClick={() => void regenerate()}>Propose a plan</Button>
        </Stack>
      </Paper>
    );
  }

  const staleDraft = draft && draft.baseVersion !== latest.version ? draft : null;
  const dirty = !!draft && !staleDraft;
  const plan: Editable = dirty ? draft.plan : { storyline: latest.plan.storyline, slides: latest.plan.slides };
  const edit = (next: Editable) => setDraft({ baseVersion: latest.version, plan: next });
  const setSlides = (slides: PlanSlide[]) => edit({ ...plan, slides });
  const untitled = plan.slides.filter((s) => !s.title.trim()).length;
  const fromUser = plan.slides.some((s) => s.origin === "user");

  function move(i: number, delta: -1 | 1) {
    const slides = [...plan.slides];
    [slides[i], slides[i + delta]] = [slides[i + delta], slides[i]];
    setSlides(slides);
    if (expanded === i) setExpanded(i + delta);
    else if (expanded === i + delta) setExpanded(i);
  }

  function remove(i: number) {
    setRemoved({ slide: plan.slides[i], index: i });
    setSlides(plan.slides.filter((_, k) => k !== i));
    setExpanded(null);
  }

  function undoRemove() {
    if (!removed) return;
    const slides = [...plan.slides];
    slides.splice(removed.index, 0, removed.slide);
    setSlides(slides);
    setRemoved(null);
  }

  function addSlide() {
    setSlides([...plan.slides, blankSlide()]);
    setExpanded(plan.slides.length);
    requestAnimationFrame(() => document.getElementById(`slide-${plan.slides.length}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function focusSlide(i: number) {
    setExpanded(i);
    document.getElementById(`slide-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveVersion() {
    setBusy("save");
    setActionError(null);
    try {
      const v = await api.savePlan(projectId, latest!.version, clean(plan));
      setDraft(null);
      await loadPlans();
      setToast(`Saved as version ${v.version}`);
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function approveAndGenerate() {
    setConfirm(null);
    setBusy("approve");
    setActionError(null);
    try {
      let version = latest!.version;
      if (dirty) {
        version = (await api.savePlan(projectId, version, clean(plan))).version;
        setDraft(null);
      }
      await api.approvePlan(projectId, version);
      const { jobId } = await api.generate(projectId, version);
      onGenerate(jobId);
    } catch (e) {
      setActionError(errMsg(e));
      void loadPlans();
    } finally {
      setBusy(null);
    }
  }

  // User versions are edits of the most recent model draft, so they inherit its provenance.
  const fromStub = plans.findLast((p) => p.createdBy === "model")?.plan.generatedBy === "stub";
  const createdLabel = latest.createdBy === "user" ? "Edited by you"
    : fromStub ? "Drafted by placeholder planner" : "Proposed by the model";

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 8 }}>
        <Stack spacing={2}>
          {fromStub && (
            <Alert severity="warning">
              <AlertTitle>Placeholder planner in use</AlertTitle>
              No model API key is configured on the server, so this plan is generic scaffolding, not research about the company.
              Edit it directly, or configure the model provider for real storyline planning.
            </Alert>
          )}
          {staleDraft && (
            <Alert severity="warning" action={
              <Stack direction="row" spacing={1}>
                <Button color="inherit" size="small" onClick={() => setDraft(null)}>Discard</Button>
                <Button color="inherit" size="small" onClick={() => edit(staleDraft.plan)}>Apply to version {latest.version}</Button>
              </Stack>
            }>
              You have unsaved edits from version {staleDraft.baseVersion}, which has since been replaced.
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h2">Storyline</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 2 }}>
              {fromUser
                ? "Structured from your storyline. Slides marked Suggested are additions you can keep, edit or remove."
                : "Proposed storyline. Edit it freely; it guides the content written for each slide."}
            </Typography>
            <TextField label="Storyline" multiline minRows={3} value={plan.storyline} onChange={(e) => edit({ ...plan, storyline: e.target.value })} />
          </Paper>

          <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", pt: 1 }}>
            <Typography variant="h2">Slides <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>({plan.slides.length} + cover)</Box></Typography>
            <Stack direction="row" spacing={1.5} sx={{ display: { xs: "none", sm: "flex" } }}>
              <Legend color="primary.main" label="From your storyline" />
              <Legend color="secondary.main" label="Suggested" />
            </Stack>
          </Stack>

          {plan.slides.map((s, i) => (
            <SlideCard
              key={i}
              slide={s}
              index={i}
              count={plan.slides.length}
              expanded={expanded === i}
              onToggle={() => setExpanded(expanded === i ? null : i)}
              onChange={(next) => setSlides(plan.slides.map((x, k) => (k === i ? next : x)))}
              onMove={(d) => move(i, d)}
              onRemove={() => remove(i)}
            />
          ))}
          <Button startIcon={<AddIcon />} variant="outlined" onClick={addSlide} sx={{ alignSelf: "flex-start" }}>Add slide</Button>
        </Stack>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Paper variant="outlined" sx={{ p: 3, position: { md: "sticky" }, top: { md: 24 } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            <Chip size="small" label={`Version ${latest.version}`} />
            {latest.approvedAt && !dirty
              ? <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Approved" />
              : <Chip size="small" variant="outlined" label="Not yet approved" />}
            {dirty && <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" />}
          </Stack>
          <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 1 }}>
            {createdLabel}{dirty && " · edits are kept in this browser until saved"}
          </Typography>

          <Typography variant="overline" component="h3" sx={{ color: "text.secondary", display: "block", mt: 2.5 }}>Storyline at a glance</Typography>
          <Box component="ol" sx={{ m: 0, pl: 3, maxHeight: { md: "34vh" }, overflowY: "auto" }}>
            {plan.slides.map((s, i) => (
              <Box component="li" key={i} sx={{ py: 0.5, typography: "body2" }}>
                <Link component="button" underline="hover" onClick={() => focusSlide(i)}
                  sx={{ textAlign: "left", color: s.title.trim() ? "text.primary" : "error.main", font: "inherit" }}>
                  {s.title.trim() || "Untitled slide"}
                </Link>
              </Box>
            ))}
          </Box>

          <Divider sx={{ my: 2.5 }} />
          <Stack spacing={1.5}>
            {actionError && <Alert severity="error">{actionError}</Alert>}
            {untitled > 0 && <Alert severity="warning">Give every slide a title before approving.</Alert>}
            <Button variant="contained" size="large" disabled={!!busy || untitled > 0} onClick={() => setConfirm("approve")}
              startIcon={busy === "approve" ? <CircularProgress size={18} color="inherit" /> : undefined}>
              Approve plan and generate deck
            </Button>
            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" disabled={!dirty || !!busy || untitled > 0} onClick={() => void saveVersion()}>
                {busy === "save" ? "Saving…" : "Save version"}
              </Button>
              <Button fullWidth variant="outlined" disabled={!dirty || !!busy} onClick={() => setDraft(null)}>Discard edits</Button>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button fullWidth startIcon={<RefreshIcon />} disabled={!!busy} onClick={() => setConfirm("regenerate")}>Regenerate plan</Button>
              <Button fullWidth disabled={!!busy} onClick={onEditSetup}>Edit setup</Button>
            </Stack>
          </Stack>
        </Paper>
      </Grid>

      <Dialog open={confirm === "approve"} onClose={() => setConfirm(null)}>
        <DialogTitle>Approve this plan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dirty
              ? `Your edits will be saved as version ${latest.version + 1}, which will be approved and used to generate the deck.`
              : `Version ${latest.version} will be approved and used to generate the deck.`}{" "}
            The deck will have a cover plus {plan.slides.length} slide{plan.slides.length === 1 ? "" : "s"}. If you edit the plan later, the new version needs approval before regenerating.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Keep reviewing</Button>
          <Button variant="contained" onClick={() => void approveAndGenerate()} autoFocus>Approve and generate</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirm === "regenerate"} onClose={() => setConfirm(null)}>
        <DialogTitle>Regenerate the plan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A new plan will be drafted from your setup inputs and added as version {latest.version + 1}.
            {dirty ? " Your unsaved edits will be discarded; save them first to keep them as a version." : " Earlier versions are kept."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void regenerate()}>Regenerate</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
      <Snackbar open={!!removed} autoHideDuration={6000} onClose={(_, reason) => reason !== "clickaway" && setRemoved(null)}
        message="Slide removed" action={<Button color="inherit" size="small" onClick={undoRemove}>Undo</Button>} />
    </Grid>
  );
}

function PlanningState({ queued }: { queued: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: "center" }} role="status" aria-live="polite">
      <CircularProgress size={32} />
      <Typography variant="h2" sx={{ mt: 2 }}>{queued ? "Waiting to start planning" : "Drafting the storyline and slide plan"}</Typography>
      <Typography sx={{ color: "text.secondary", mt: 1, maxWidth: 480, mx: "auto" }}>
        Nothing is generated until you approve the plan. Progress is saved, so you can refresh or come back to this page.
      </Typography>
    </Paper>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box sx={{ width: 4, height: 14, borderRadius: 1, bgcolor: color }} />
      <Typography variant="caption" sx={{ color: "text.secondary" }}>{label}</Typography>
    </Stack>
  );
}
