import type { NextConfig } from "next";

// One build id per build, shared by Next (`generateBuildId`) and the Service
// Worker, which learns it from the `/sw.js?v=<id>` registration URL. Prefer the
// deploy commit so redeploying the same commit keeps its offline caches.
function resolveBuildId(): string {
  const fromEnv = process.env.ANYFILE_BUILD_ID
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT_SHA
    || process.env.GIT_SHA;
  if (fromEnv) return String(fromEnv).replace(/[^\w.-]/g, "").slice(0, 64) || "dev";
  return Date.now().toString(36);
}

const BUILD_ID = resolveBuildId();

const nextConfig: NextConfig = {
  generateBuildId: () => BUILD_ID,
  env: {
    NEXT_PUBLIC_ANYFILE_BUILD_ID: BUILD_ID,
  },
  async redirects() {
    return [
      { source: "/", destination: "/en", permanent: true },
      { source: "/integrations", destination: "/en/integrations", permanent: true },
      { source: "/embed", destination: "/en/embed", permanent: true },
      { source: "/view", destination: "/en/view", permanent: true },
      { source: "/categories/:slug", destination: "/en/categories/:slug", permanent: true },
      { source: "/formats/:extension", destination: "/en/formats/:extension", permanent: true },
      { source: "/plugins/:pluginId", destination: "/en/plugins/:pluginId", permanent: true },
      { source: "/about", destination: "/en/about", permanent: true },
      { source: "/privacy", destination: "/en/privacy", permanent: true },
      { source: "/contact", destination: "/en/contact", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/samples/design/color-study.psb",
        // The default .psb MIME mapping describes an unrelated 3GPP format.
        headers: [{ key: "Content-Type", value: "application/octet-stream" }],
      },
      {
        source: "/vendor/:dependency/:version/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:locale(en|zh-CN|es|de|fr|ja|pt|ru|ko|it)/:mode(view|embed)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        source: "/:locale(en|zh-CN)/embed",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      {
        source: "/vendor/libraw/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/vendor/libheif/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/vendor/stet/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/vendor/ffmpeg-playback/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/vendor/ogv/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
