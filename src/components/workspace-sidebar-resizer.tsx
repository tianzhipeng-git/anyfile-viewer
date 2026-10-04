"use client";

import { useRef, useState } from "react";
import type { PublishedLocale } from "@/i18n/config";

export function WorkspaceSidebarResizer({ width, onWidthChange, locale }: {
  width: number;
  onWidthChange: (width: number) => void;
  locale: PublishedLocale;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const label = locale === "zh-CN" ? "调整文件栏宽度（拖动后松手应用，方向键调整）" : "Resize file sidebar (release to apply, or use arrow keys)";

  function clampWidth(value: number, handle: HTMLElement) {
    const available = handle.parentElement!.clientWidth;
    return Math.max(240, Math.min(value, 600, available - 360));
  }

  function cancel() {
    drag.current = null;
    setPreview(null);
  }

  return (
    <>
      {preview !== null && (
        <div className="absolute inset-0 z-40 hidden cursor-col-resize select-none lg:block" aria-hidden="true">
          <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: preview }} />
        </div>
      )}
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        title={label}
        aria-orientation="vertical"
        aria-valuemin={240}
        aria-valuemax={600}
        aria-valuenow={preview ?? width}
        className="absolute inset-y-0 z-50 hidden w-2 -translate-x-1/2 touch-none cursor-col-resize select-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-2 focus-visible:outline-ring lg:block"
        style={{ left: "var(--workspace-sidebar-width)" }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const startWidth = clampWidth(width, event.currentTarget);
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth };
          setPreview(startWidth);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          setPreview(clampWidth(current.startWidth + event.clientX - current.startX, event.currentTarget));
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          onWidthChange(clampWidth(current.startWidth + event.clientX - current.startX, event.currentTarget));
          cancel();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onBlur={cancel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            cancel();
            return;
          }
          if (drag.current) return;
          const step = event.shiftKey ? 50 : 10;
          const next = event.key === "ArrowLeft" ? clampWidth(width, event.currentTarget) - step
            : event.key === "ArrowRight" ? clampWidth(width, event.currentTarget) + step
              : event.key === "Home" ? 240 : event.key === "End" ? 600 : null;
          if (next === null) return;
          event.preventDefault();
          onWidthChange(clampWidth(next, event.currentTarget));
        }}
      />
    </>
  );
}
