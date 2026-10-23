import { useRef, useState, type ChangeEvent } from "react";
import { Alert, Box, Button, ButtonBase, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { BrandLookup } from "../../../shared/contract.ts";
import { api } from "../api.ts";

interface Props {
  /** Whose logo, e.g. "PepsiCo's logo". */
  label: string;
  logoId: string;
  onChange: (id: string) => void;
  /** Normalised website to search; blank disables lookup. */
  website: string;
  error?: string;
}

/**
 * Choose a logo: look it up on the company's own website, or upload one. Retrieved candidates are only
 * previewed; nothing is used until the user picks one (blueprint §C).
 */
export function LogoPicker({ label, logoId, onChange, website, error }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"lookup" | "upload" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [lookup, setLookup] = useState<BrandLookup | null>(null);

  async function run<T>(kind: "lookup" | "upload", fn: () => Promise<T>) {
    setBusy(kind);
    setFailure(null);
    try {
      return await fn();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const find = () => run("lookup", async () => setLookup(await api.lookupBrand(website)));
  const upload = (file: File) => run("upload", async () => onChange((await api.uploadLogo(file)).id));

  return (
    <Stack spacing={1.5}>
      {logoId ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
          <LogoSwatches id={logoId} alt={label} />
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => fileInput.current?.click()} disabled={!!busy}>Replace</Button>
            <Button size="small" color="inherit" onClick={() => onChange("")}>Remove</Button>
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: error ? "error.main" : "text.secondary" }}>{error ?? `No logo chosen yet.`}</Typography>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <Button variant="outlined" startIcon={busy === "lookup" ? <CircularProgress size={16} /> : <TravelExploreIcon />}
          disabled={!website || !!busy} onClick={() => void find()}>
          Find logo on website
        </Button>
        <Button variant="outlined" startIcon={busy === "upload" ? <CircularProgress size={16} /> : <UploadFileIcon />}
          disabled={!!busy} onClick={() => fileInput.current?.click()}>
          Upload logo
        </Button>
        <Box component="input" ref={fileInput} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow choosing the same file again
            if (file) void upload(file);
          }} />
      </Stack>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {website ? "PNG, JPEG or SVG up to 2 MB. Lookup only reads the company's own homepage." : "Add the company website above to look its logo up, or upload one. PNG, JPEG or SVG up to 2 MB."}
      </Typography>

      {failure && <Alert severity="error" onClose={() => setFailure(null)}>{failure}</Alert>}

      {lookup && (
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Found on <strong>{lookup.pageTitle || new URL(lookup.website).hostname}</strong> ({new URL(lookup.website).hostname}).
            If that isn't the right organisation, correct the website and search again.
          </Typography>
          {lookup.candidates.length ? (
            <Grid container spacing={1.5}>
              {lookup.candidates.map((c) => {
                const chosen = c.id === logoId;
                return (
                  <Grid key={c.id} size={{ xs: 6, sm: 4 }}>
                    <ButtonBase onClick={() => onChange(c.id)} aria-pressed={chosen}
                      sx={{ display: "block", width: "100%", textAlign: "left", borderRadius: 1, border: "2px solid", borderColor: chosen ? "primary.main" : "divider", p: 1 }}>
                      <Box sx={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#FFFFFF", borderRadius: 0.5, position: "relative" }}>
                        <Box component="img" src={api.logoUrl(c.id)} alt={c.label} sx={{ maxWidth: "90%", maxHeight: 60, objectFit: "contain" }} />
                        {chosen && <CheckCircleIcon color="primary" fontSize="small" sx={{ position: "absolute", top: 4, right: 4 }} />}
                      </Box>
                      <Typography variant="caption" component="p" sx={{ mt: 0.75, lineHeight: 1.3 }}>{c.label}</Typography>
                      <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>{c.width}×{c.height}px</Typography>
                    </ButtonBase>
                  </Grid>
                );
              })}
            </Grid>
          ) : (
            <Alert severity="info">No usable logo was found on that page. Upload one instead.</Alert>
          )}
          {lookup.candidates.length > 0 && !lookup.candidates.some((c) => c.id === logoId) && (
            <Typography variant="caption" component="p" sx={{ color: "text.secondary", mt: 1 }}>
              Pick the one to use. None is applied until you choose it; if none are right, upload your own.
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  );
}

/** The logo as it will appear: on white (content slides) and on a white chip over the dark cover. */
function LogoSwatches({ id, alt }: { id: string; alt: string }) {
  const tile = { width: 168, height: 64, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1, border: "1px solid", borderColor: "divider" } as const;
  return (
    <Stack direction="row" spacing={1}>
      <Box sx={{ ...tile, bgcolor: "#FFFFFF" }}>
        <Box component="img" src={api.logoUrl(id)} alt={alt} sx={{ maxWidth: 144, maxHeight: 44, objectFit: "contain" }} />
      </Box>
      <Box sx={{ ...tile, bgcolor: "#1E293B" }} aria-hidden>
        <Box sx={{ bgcolor: "#FFFFFF", borderRadius: 0.75, p: 0.75, display: "flex" }}>
          <Box component="img" src={api.logoUrl(id)} alt="" sx={{ maxWidth: 120, maxHeight: 32, objectFit: "contain" }} />
        </Box>
      </Box>
    </Stack>
  );
}
