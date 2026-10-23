import { useEffect, useState } from "react";
import {
  Alert, AlertTitle, Box, Button, Chip, CircularProgress, Collapse, Grid, Paper, Stack, Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import DownloadIcon from "@mui/icons-material/Download";
import { api } from "../api.ts";
import { useJob } from "../useJob.ts";

// Real worker stages (server/worker.ts runGenerate); no percentages.
const STAGES = [
  { key: "writing_content", label: "Writing slide content" },
  { key: "building_slides", label: "Building editable slides" },
  { key: "qa_check", label: "Checking layout and contrast" },
  { key: "rendering_previews", label: "Rendering previews" },
];

export function GenerateView({ jobId, onStatus, onBackToPlan }: { jobId: string; onStatus: (done: boolean) => void; onBackToPlan: () => void }) {
  const { job, error, retry } = useJob(jobId);
  const done = job?.status === "succeeded";
  useEffect(() => { if (job) onStatus(done); }, [job, done, onStatus]);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  if (error && !job) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={onBackToPlan}>Back to plan</Button>}>
        <AlertTitle>{error.notFound ? "This generation job no longer exists" : "Can't load job status"}</AlertTitle>
        {error.message}
      </Alert>
    );
  }
  if (!job) return <Box sx={{ py: 6, textAlign: "center" }}><CircularProgress /></Box>;

  const current = STAGES.findIndex((s) => s.key === job.stage);
  const files = job.outputs?.files ?? [];
  const previews = files.filter((f) => f.endsWith(".png"));
  const pdf = files.find((f) => f.endsWith(".pdf"));

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Typography variant="h2">
            {job.status === "succeeded" ? "Your deck is ready" : job.status === "failed" ? "Generation failed" : "Generating your deck"}
          </Typography>
          {job.planVersion != null && <Chip size="small" label={`From approved plan version ${job.planVersion}`} />}
        </Stack>

        {job.status !== "succeeded" && (
          <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 2 }} aria-live="polite">
            {job.status === "queued" && <Typography sx={{ color: "text.secondary" }}>Waiting for the worker to start…</Typography>}
            {job.status !== "queued" && STAGES.map((s, i) => {
              const done = current > i;
              const running = current === i && job.status === "running";
              const failedHere = current === i && job.status === "failed";
              return (
                <Stack component="li" key={s.key} direction="row" spacing={1.5} sx={{ alignItems: "center", py: 0.75 }}>
                  {done ? <CheckCircleIcon color="success" fontSize="small" />
                    : running ? <CircularProgress size={18} />
                      : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: failedHere ? "error.main" : "text.disabled" }} />}
                  <Typography sx={{ color: done || running ? "text.primary" : failedHere ? "error.main" : "text.secondary", fontWeight: running ? 600 : 400 }}>
                    {s.label}
                  </Typography>
                </Stack>
              );
            })}
          </Box>
        )}

        {job.status === "failed" && (
          <Alert severity="error" sx={{ mt: 2 }} action={
            <Button color="inherit" onClick={() => { setRetryError(null); retry().catch((e) => setRetryError(e instanceof Error ? e.message : String(e))); }}>
              Retry
            </Button>
          }>
            {job.error ?? "The job stopped without an error message."}
            {retryError && <Box sx={{ mt: 1 }}>{retryError}</Box>}
          </Alert>
        )}

        {job.status === "succeeded" && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button variant="contained" startIcon={<DownloadIcon />} href={api.fileUrl(job.id, "deck.pptx")}>Download PowerPoint</Button>
              {pdf && <Button variant="outlined" startIcon={<DownloadIcon />} href={api.fileUrl(job.id, pdf)}>Download PDF</Button>}
            </Stack>
            {job.outputs?.qa && (
              <Box>
                <Chip size="small" variant="outlined" color={job.outputs.qa.errors ? "warning" : "success"}
                  label={`Quality check: ${job.outputs.qa.errors} error(s), ${job.outputs.qa.warnings} warning(s)`}
                  onClick={() => setShowReport(!showReport)} />
                <Collapse in={showReport}>
                  <Box component="pre" sx={{ mt: 1.5, p: 2, bgcolor: "background.default", borderRadius: 1, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap" }}>
                    {job.outputs.qa.report}
                  </Box>
                </Collapse>
              </Box>
            )}
            {job.outputs?.renderSkipped && <Alert severity="info">Previews unavailable: {job.outputs.renderSkipped}</Alert>}
          </Stack>
        )}
      </Paper>

      {previews.length > 0 && (
        <Grid container spacing={2}>
          {previews.map((p, i) => (
            <Grid key={p} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Box component="img" src={api.fileUrl(job.id, p)} alt={`Slide ${i + 1} preview`} loading="lazy"
                sx={{ width: "100%", display: "block", borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "#fff" }} />
            </Grid>
          ))}
        </Grid>
      )}

      <Box>
        <Button variant="outlined" onClick={onBackToPlan} disabled={job.status === "queued" || job.status === "running"}>
          Back to plan to revise
        </Button>
      </Box>
    </Stack>
  );
}
