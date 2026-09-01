import { ImageResponse } from "next/og";

import { isPublishedLocale } from "@/i18n/config";

export const alt = "Anyfile — Free online file viewer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const chinese = isPublishedLocale(locale) && locale === "zh-CN";

  return new ImageResponse(
    <div style={{
      alignItems: "stretch",
      background: "linear-gradient(135deg, #111827 0%, #172554 58%, #2563eb 100%)",
      color: "white",
      display: "flex",
      height: "100%",
      position: "relative",
      width: "100%",
    }}>
      <div style={{ alignItems: "center", display: "flex", fontSize: 34, fontWeight: 700, gap: 16, left: 84, position: "absolute", top: 72 }}>
        <div style={{ alignItems: "center", background: "#3b82f6", borderRadius: 999, display: "flex", height: 52, justifyContent: "center", width: 52 }}>A</div>
        Anyfile
      </div>
      <div style={{ bottom: 72, display: "flex", flexDirection: "column", gap: 24, left: 84, position: "absolute", right: 84 }}>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.08 }}>
          {chinese ? "免费在线查看文件，无需上传" : "Open files online. Keep them private."}
        </div>
        <div style={{ color: "#bfdbfe", fontSize: 30 }}>
          {chinese ? "快速 · 私密 · 浏览器本地处理" : "Free viewer & media player · Fast · No uploads"}
        </div>
      </div>
    </div>,
    size,
  );
}
