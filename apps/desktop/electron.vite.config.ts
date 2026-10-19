import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          "@office-agent/agent-runtime",
          "@office-agent/analysis",
          "@office-agent/contracts",
          "@office-agent/document",
          "@office-agent/ingestion",
          "@office-agent/library",
          "@office-agent/research",
          "@office-agent/retrieval",
        ],
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
