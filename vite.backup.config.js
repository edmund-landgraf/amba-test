import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    outDir: "grid",
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/backup-grid.jsx",
      output: {
        format: "iife",
        name: "AmbaBackupGrid",
        dir: "grid",
        entryFileNames: "backup-grid.js",
        assetFileNames: "backup-grid.css",
        inlineDynamicImports: true
      }
    }
  }
});
