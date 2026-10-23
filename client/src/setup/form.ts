// Setup-form state and its mapping onto the shared ProjectInputs contract. Validation uses the
// same zod schema as the server, so the form and API can't disagree about what's required.
import { ProjectInputs } from "../../../shared/contract.ts";

export type ColorMode = ProjectInputs["colorMode"];
export type LogoPlacement = ProjectInputs["logos"]["placement"];

export interface SetupForm {
  companyName: string;
  companyWebsite: string;
  topic: string;
  objective: string;
  audience: string;
  callToAction: string;
  slideCount: number;
  storyline: string;
  colorMode: ColorMode;
  palette: { dark: string; accent: string; accent2: string };
  presentingInclude: boolean;
  presentingName: string;
  presentingWebsite: string;
  presentingLogoId: string; // "" = none
  includeSubjectLogo: boolean;
  subjectLogoId: string;
  logoPlacement: LogoPlacement;
  notes: string;
}

// The skill's neutral executive palette (skill/assets/provisional-palette.json).
export const NEUTRAL_PALETTE = { dark: "#1E293B", accent: "#2F6690", accent2: "#94A3B8" };

export const emptyForm: SetupForm = {
  companyName: "",
  companyWebsite: "",
  topic: "",
  objective: "",
  audience: "",
  callToAction: "",
  slideCount: 8,
  storyline: "",
  colorMode: "neutral",
  palette: NEUTRAL_PALETTE,
  presentingInclude: false,
  presentingName: "",
  presentingWebsite: "",
  presentingLogoId: "",
  includeSubjectLogo: false,
  subjectLogoId: "",
  logoPlacement: "title",
  notes: "",
};

/** "acme.com" → "https://acme.com"; blank stays blank. */
export function normalizeUrl(s: string) {
  const t = s.trim();
  return !t || /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

const opt = (s: string) => normalizeUrl(s) || undefined;

function toRaw(f: SetupForm) {
  return {
    companyName: f.companyName,
    companyWebsite: opt(f.companyWebsite),
    colorMode: f.colorMode,
    palette: f.colorMode === "neutral" ? undefined : { dark: f.palette.dark, accent: f.palette.accent, accent2: f.palette.accent2 || undefined },
    presentingCompany: { include: f.presentingInclude, name: f.presentingName.trim() || undefined, website: opt(f.presentingWebsite) },
    logos: {
      subject: (f.includeSubjectLogo && f.subjectLogoId) || undefined,
      presenting: (f.presentingInclude && f.presentingLogoId) || undefined,
      placement: f.logoPlacement,
    },
    storyline: f.storyline,
    topic: f.topic,
    objective: f.objective,
    audience: f.audience,
    callToAction: f.callToAction,
    slideCount: f.slideCount,
    notes: f.notes,
  };
}

/** Field errors are keyed by the contract path, e.g. "companyWebsite" or "presentingCompany.name". */
export type FieldErrors = Record<string, string>;

export function validate(f: SetupForm): { inputs: ProjectInputs; errors?: undefined } | { inputs?: undefined; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const parsed = ProjectInputs.safeParse(toRaw(f));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
  }
  if (errors.companyWebsite || errors["presentingCompany.website"]) {
    const msg = "Enter a valid web address, e.g. https://example.com";
    if (errors.companyWebsite) errors.companyWebsite = msg;
    if (errors["presentingCompany.website"]) errors["presentingCompany.website"] = msg;
  }
  if (f.presentingInclude && !f.presentingName.trim()) errors["presentingCompany.name"] = "Enter your company's name, or turn branding off";
  if (f.includeSubjectLogo && !f.subjectLogoId) errors["logos.subject"] = "Choose or upload a logo, or turn this off";
  if (Object.keys(errors).length || !parsed.success) return { errors };
  return { inputs: parsed.data };
}

/** PATCH body: send null for cleared optional fields so the server drops them. */
export function toPatch(inputs: ProjectInputs) {
  return { ...inputs, companyWebsite: inputs.companyWebsite ?? null, palette: inputs.palette ?? null };
}

// ---------- contrast (WCAG 2.x relative luminance) ----------
function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
