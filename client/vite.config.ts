import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3001}` },
    fs: { allow: [".."] }, // shared/contract.ts lives outside client/
  },
  build: { outDir: "dist", emptyOutDir: true },
});
