import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "public/vendor/pdfjs/**",
    "public/vendor/libraw/**",
    "public/vendor/libheif/**",
    "public/vendor/ogv/**",
    "public/vendor/stet/**",
    "public/vendor/occt-import-js/**",
    "public/vendor/laz-perf/**",
    "third_party/heif-wasm/**",
    "third_party/ffmpeg-playback/**",
    "public/vendor/ffmpeg-playback/**",
    "third_party/stet-wasm/**",
    "third_party/occt-import-js/**",
    "third_party/laz-perf/**",
    "third_party/libmobi/**",
    "third_party/comic-archive/**",
    "public/vendor/libmobi/**",
    "public/vendor/comic-archive/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
