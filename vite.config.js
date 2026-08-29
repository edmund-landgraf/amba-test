import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    outDir: "grid",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/scheduler.jsx",
      output: {
        format: "iife",
        name: "AmbaScheduler",
        dir: "grid",
        entryFileNames: "scheduler.js",
        assetFileNames: "scheduler.css",
        inlineDynamicImports: true
      }
    }
  }
});
