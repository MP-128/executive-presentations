import { useCallback, useMemo, useState } from "react";
import {
  Box, Button, Container, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Step, StepButton, Stepper, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { keys, save, usePersistentState } from "./persist.ts";
import { emptyForm, type SetupForm as Form } from "./setup/form.ts";
import { SetupForm } from "./setup/SetupForm.tsx";
import { PlanReview } from "./plan/PlanReview.tsx";
import { GenerateView } from "./generate/GenerateView.tsx";

type View = "setup" | "plan" | "generate";

/** Pointer to the server-side project and its in-flight jobs; persisted so a refresh resumes where you were. */
interface Session {
  view: View;
  projectId?: string;
  hasPlan?: boolean;
  planJobId?: string;
  generateJobId?: string;
  generateDone?: boolean;
}

const STEPS = ["Setup", "Review plan", "Generate", "Preview and download"];

export function App() {
  const [session, setSession] = usePersistentState<Session>(keys.session, { view: "setup" });
  const [storedForm, setForm] = usePersistentState<Form>(keys.form, emptyForm);
  // fill fields added since the form was saved in this browser
  const form = useMemo(() => ({ ...emptyForm, ...storedForm }), [storedForm]);
  const [confirmNew, setConfirmNew] = useState(false);
  const patch = useCallback((p: Partial<Session>) => setSession((s) => ({ ...s, ...p })), [setSession]);
  const onPlanJob = useCallback((planJobId: string | undefined) => patch({ planJobId }), [patch]);
  const onGenerateStatus = useCallback((done: boolean) => patch({ generateDone: done }), [patch]);

  const active = session.view === "setup" ? 0 : session.view === "plan" ? 1 : session.generateDone ? 3 : 2;
  const reachable = [true, !!session.projectId && !!session.hasPlan, !!session.generateJobId, !!session.generateDone];
  const goTo = (step: number) => patch({ view: step === 0 ? "setup" : step === 1 ? "plan" : "generate" });

  function startNew() {
    if (session.projectId) save(keys.planDraft(session.projectId), undefined);
    setForm(emptyForm);
    setSession({ view: "setup" });
    setConfirmNew(false);
    window.scrollTo({ top: 0 });
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Paper square variant="outlined" component="header" sx={{ borderWidth: "0 0 1px 0" }}>
        <Container maxWidth="lg" sx={{ py: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <Box>
            <Typography variant="h1" component="p" sx={{ fontSize: "1.125rem" }}>Executive Presentations</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>Plan, approve and generate an editable executive deck</Typography>
          </Box>
          <Button startIcon={<AddIcon />} onClick={() => setConfirmNew(true)}>New presentation</Button>
        </Container>
      </Paper>

      <Container maxWidth="lg" component="main" sx={{ py: { xs: 3, md: 4 } }}>
        <Stepper activeStep={active} nonLinear alternativeLabel sx={{ mb: 4 }}>
          {STEPS.map((label, i) => (
            <Step key={label} completed={i < active}>
              <StepButton disabled={!reachable[i]} onClick={() => goTo(i)}>{label}</StepButton>
            </Step>
          ))}
        </Stepper>
        <Typography variant="h1" component="h1" sx={{ mb: 3 }}>
          {session.view === "setup" ? "Set up your presentation" : session.view === "plan" ? "Review the slide plan" : "Generate and download"}
        </Typography>

        {session.view === "setup" && (
          <SetupForm
            form={form}
            onChange={setForm}
            projectId={session.projectId}
            hasPlan={!!session.hasPlan}
            onPlanRequested={(projectId, planJobId) => { patch({ projectId, planJobId, hasPlan: true, view: "plan" }); window.scrollTo({ top: 0 }); }}
            onReturnToPlan={(projectId) => { patch({ projectId, view: "plan" }); window.scrollTo({ top: 0 }); }}
          />
        )}
        {session.view === "plan" && session.projectId && (
          <PlanReview
            key={session.projectId}
            projectId={session.projectId}
            planJobId={session.planJobId}
            onPlanJob={onPlanJob}
            onGenerate={(generateJobId) => { patch({ generateJobId, generateDone: false, view: "generate" }); window.scrollTo({ top: 0 }); }}
            onEditSetup={() => patch({ view: "setup" })}
          />
        )}
        {session.view === "generate" && session.generateJobId && (
          <GenerateView key={session.generateJobId} jobId={session.generateJobId} onStatus={onGenerateStatus}
            onBackToPlan={() => patch({ view: "plan" })} />
        )}
      </Container>

      <Dialog open={confirmNew} onClose={() => setConfirmNew(false)}>
        <DialogTitle>Start a new presentation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This clears the setup form and any unsaved plan edits in this browser. Saved plan versions and generated decks stay on the server.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmNew(false)}>Cancel</Button>
          <Button variant="contained" onClick={startNew}>Start new</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
