"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AppDictionary } from "@/i18n/types";

function isStandaloneMode(): boolean {
  return typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}

function hasWebInstallApi(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.install === "function";
}

function subscribeStandalone(callback: () => void) {
  const media = window.matchMedia?.("(display-mode: standalone)");
  if (!media?.addEventListener) return () => {};
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getWebInstallSnapshot(): boolean {
  return !isStandaloneMode() && hasWebInstallApi();
}

export function PwaInstallButton({ dictionary }: { dictionary: AppDictionary["pwa"] }) {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | undefined>(undefined);
  const webInstallReady = useSyncExternalStore(subscribeStandalone, getWebInstallSnapshot, () => false);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (isStandaloneMode()) return;

    function onBeforeInstallPrompt(event: Event) {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      deferredPromptRef.current = promptEvent;
      setInstalled(false);
      setPromptAvailable(true);
    }

    function onAppInstalled() {
      deferredPromptRef.current = undefined;
      setPromptAvailable(false);
      setInstalled(true);
      setStatus(dictionary.installSuccess);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [dictionary.installSuccess]);

  const visible = !installed && (webInstallReady || promptAvailable);

  async function handleInstall() {
    if (installing) return;
    setInstalling(true);

    try {
      if (hasWebInstallApi()) {
        // Call directly inside the click handler to retain transient user activation.
        await navigator.install!();
        setStatus(dictionary.installSuccess);
        setInstalled(true);
      } else if (deferredPromptRef.current) {
        // Discard the single-use event before awaiting the user's choice.
        const promptEvent = deferredPromptRef.current;
        deferredPromptRef.current = undefined;
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setStatus(outcome === "accepted" ? dictionary.installSuccess : dictionary.installCanceled);
        if (outcome === "accepted") {
          setInstalled(true);
        }
        if (!deferredPromptRef.current) {
          setPromptAvailable(false);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus(dictionary.installCanceled);
      } else {
        setStatus(dictionary.installFailed);
        console.error(error);
      }
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      {visible && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-background hover:bg-background/10 hover:text-background"
          aria-disabled={installing ? "true" : undefined}
          onClick={() => void handleInstall()}
        >
          <DownloadIcon data-icon="inline-start" />
          {installing ? dictionary.installingApp : dictionary.installApp}
        </Button>
      )}
      <span className="sr-only" role="status">{status}</span>
    </>
  );
}
