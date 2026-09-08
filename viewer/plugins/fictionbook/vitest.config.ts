import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    restoreMocks: true,
    environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true, disableIframePageLoading: true, disableJavaScriptEvaluation: true } } },
  },
});
