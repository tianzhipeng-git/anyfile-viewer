import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("localized routing configuration", () => {
  it("permanently redirects every legacy public route to English", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(expect.arrayContaining([
      { source: "/", destination: "/en", permanent: true },
      { source: "/view", destination: "/en/view", permanent: true },
      { source: "/categories/:slug", destination: "/en/categories/:slug", permanent: true },
      { source: "/formats/:extension", destination: "/en/formats/:extension", permanent: true },
      { source: "/plugins/:pluginId", destination: "/en/plugins/:pluginId", permanent: true },
    ]));
  });

  it("isolates every supported locale's viewer route", async () => {
    const headers = await nextConfig.headers?.();
    const viewerHeaders = headers?.find(({ source }) => source.includes(":locale("));
    expect(viewerHeaders?.source).toContain("en|zh-CN|es|de|fr|ja|pt|ru|ko|it");
    expect(viewerHeaders?.headers).toEqual(expect.arrayContaining([
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ]));
  });
});
