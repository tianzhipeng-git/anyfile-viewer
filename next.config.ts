import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/en", permanent: true },
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
        source: "/vendor/:dependency/:version/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:locale(en|zh-CN|es|de|fr|ja|pt|ru|ko|it)/view",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
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
    ];
  },
};

export default nextConfig;
