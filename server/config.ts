import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");

export interface Config {
  dataDir: string;
  skillDir: string;
  pythonBin: string;
  dailyJobLimit: number;
  /** false skips LibreOffice rendering (previews + PDF); the reason is recorded on the job. */
  render: boolean;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const venvPython = path.join(ROOT, ".venv/bin/python");
  return {
    dataDir: path.resolve(process.env.DATA_DIR ?? path.join(ROOT, "data")),
    skillDir: path.join(ROOT, "skill"),
    pythonBin: process.env.PYTHON_BIN ?? (fs.existsSync(venvPython) ? venvPython : "python3"),
    dailyJobLimit: Number(process.env.DAILY_JOB_LIMIT ?? 50),
    render: process.env.RENDER_PREVIEWS !== "false",
    ...overrides,
  };
}
