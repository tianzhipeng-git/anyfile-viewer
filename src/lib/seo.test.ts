import { describe, expect, it } from "vitest";

import { localizedPageMetadata } from "./seo";

describe("localizedPageMetadata", () => {
  it("builds canonical, social and localized image metadata for a page", () => {
    expect(localizedPageMetadata({
      locale: "zh-CN",
      path: "/formats/pdf",
      title: "在线打开 PDF",
      description: "无需上传。",
    })).toMatchObject({
      alternates: {
        canonical: "/zh-CN/formats/pdf",
        languages: {
          en: "/en/formats/pdf",
          "zh-CN": "/zh-CN/formats/pdf",
          "x-default": "/en/formats/pdf",
        },
      },
      openGraph: {
        locale: "zh_CN",
        url: "/zh-CN/formats/pdf",
        images: [{ url: "/zh-CN/opengraph-image" }],
      },
      twitter: {
        card: "summary_large_image",
        images: [{ url: "/zh-CN/opengraph-image" }],
      },
    });
  });
});
