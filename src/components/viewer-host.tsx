"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircleIcon, AlertTriangleIcon, CircleIcon, FileSearchIcon, LoaderCircleIcon } from "lucide-react";
import {
  ViewerError,
  interpolate,
  isViewerAbortError,
  manifestName,
  normalizeViewerError,
  resolveViewerRegistrations,
  validateLoadedPlugin,
  type ResolvedViewerRegistration,
  type ViewerController,
  type WorkspaceReader,
  type Locale,
} from "@anyfile/viewer-protocol";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { viewerRegistrations } from "@/lib/viewer-registrations";
import type { AppDictionary } from "@/i18n/types";

type ViewerSession = { stop(): Promise<void> };
type ViewerStatus = "idle" | "loading" | "active" | "error";
type ViewerRoutingResult = {
  readonly file: File;
  readonly workspace?: WorkspaceReader;
  readonly candidates: ResolvedViewerRegistration[];
  readonly error?: string;
};

export function ViewerHost({
  file,
  header,
  relativePath,
  workspace,
  locale,
  dictionary,
}: {
  file?: File;
  header: ReactNode;
  relativePath?: string;
  workspace?: WorkspaceReader;
  locale: Locale;
  dictionary: AppDictionary["viewer"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ViewerSession | undefined>(undefined);
  const [registrationId, setRegistrationId] = useState("");
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [message, setMessage] = useState("");
  const [routingResult, setRoutingResult] = useState<ViewerRoutingResult>();
  const currentRoutingResult = routingResult && routingResult.file === file && routingResult.workspace === workspace
    ? routingResult
    : undefined;
  const isRouting = Boolean(file && !currentRoutingResult);
  const candidates = currentRoutingResult?.candidates ?? [];
  const selectedCandidate = candidates.find(({ registration }) => registration.manifest.id === registrationId) ?? candidates[0];
  const registration = selectedCandidate?.registration;
  const supportLevel = selectedCandidate?.supportLevel
    ?? (file && currentRoutingResult && !currentRoutingResult.error ? 0 : undefined);
  const supportLevelTooltip = supportLevel === undefined
    ? undefined
    : `${interpolate(dictionary.supportLevelLabel, { level: supportLevel })}: ${dictionary.supportLevelDescriptions[supportLevel]}`;
  const supportLevelBadgeVariant = supportLevel !== undefined && supportLevel <= 1
    ? "supportLow"
    : supportLevel === 2
      ? "supportPartial"
      : "supportStrong";
  const usesFallbackHexViewer = candidates.length === 1 && registration?.manifest.id === "hex-viewer";

  useEffect(() => {
    if (!file) return;

    const abortController = new AbortController();

    void resolveViewerRegistrations(file, viewerRegistrations, {
      signal: abortController.signal,
      workspace,
    }).then((resolvedCandidates) => {
      if (abortController.signal.aborted) return;
      setRoutingResult({ file, workspace, candidates: resolvedCandidates });
      setStatus(resolvedCandidates.length > 0 ? "loading" : "idle");
      setMessage(resolvedCandidates.length > 0 ? dictionary.loadingViewer : "");
    }).catch((error: unknown) => {
      if (abortController.signal.aborted || isViewerAbortError(error)) return;
      const viewerError = normalizeViewerError(error, dictionary.detectionFailed);
      setRoutingResult({ file, workspace, candidates: [], error: viewerError.message });
    });

    return () => abortController.abort();
  }, [dictionary.detectionFailed, dictionary.loadingViewer, file, workspace]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previousSession = sessionRef.current;

    if (!file || !registration) {
      sessionRef.current = undefined;
      void previousSession?.stop().then(() => {
        if (!sessionRef.current) container.replaceChildren();
      });
      return;
    }

    const abortController = new AbortController();
    let controller: ViewerController | undefined;
    let stopOperation: Promise<void> | undefined;
    const session: ViewerSession = {
      stop() {
        if (!stopOperation) {
          stopOperation = (async () => {
            abortController.abort();
            await operation.catch(() => undefined);
            await controller?.dispose();
            if (sessionRef.current === session) {
              container.replaceChildren();
            }
          })();
        }
        return stopOperation;
      },
    };
    sessionRef.current = session;

    const operation = (async () => {
      await previousSession?.stop();
      if (abortController.signal.aborted) return;
      container.replaceChildren();
      setStatus("loading");
      setMessage(interpolate(dictionary.loadingNamedViewer, { name: manifestName(registration.manifest, locale) }));

      if (registration.manifest.workspaceAccess === "required" && !workspace) {
        throw new ViewerError("missing-related-file", dictionary.workspaceRequired);
      }
      const plugin = await registration.load();
      validateLoadedPlugin(registration, plugin);
      if (abortController.signal.aborted) return;
      controller = await plugin.open({
        file,
        relativePath,
        workspace,
        container,
        signal: abortController.signal,
        locale,
        reportProgress(progress) {
          if (!abortController.signal.aborted && sessionRef.current === session) {
            setStatus("loading");
            setMessage(progress.message ?? progress.stage);
          }
        },
      });
      if (!abortController.signal.aborted && sessionRef.current === session) {
        setStatus("active");
      }
    })().catch((error: unknown) => {
      if (abortController.signal.aborted || isViewerAbortError(error)) return;
      container.replaceChildren();
      if (sessionRef.current === session) {
        const viewerError = normalizeViewerError(error, dictionary.openFailedFallback);
        setStatus("error");
        setMessage(viewerError.message);
      }
    });

    return () => {
      void session.stop();
    };
  }, [dictionary, file, locale, registration, relativePath, workspace]);

  const visibleStatus = !file
    ? "idle"
    : isRouting
      ? "loading"
      : currentRoutingResult?.error
        ? "error"
        : registration
          ? status
          : "idle";
  const visibleMessage = visibleStatus === "idle"
    ? ""
    : isRouting
      ? dictionary.detecting
      : currentRoutingResult?.error ?? message;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b bg-background px-4 sm:px-6">
        {header}
        {supportLevel !== undefined && (
          <div className="flex items-center gap-2">
            {candidates.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {dictionary.viewerLabel}
                <select
                  className="h-8 rounded-md border bg-background px-2 text-foreground"
                  value={registration?.manifest.id ?? ""}
                  onChange={(event) => setRegistrationId(event.target.value)}
                >
                  {candidates.map(({ registration: candidate }) => (
                    <option key={candidate.manifest.id} value={candidate.manifest.id}>{manifestName(candidate.manifest, locale)}</option>
                  ))}
                </select>
              </label>
            )}
            <Tooltip>
              <TooltipTrigger
                render={<Badge variant={supportLevelBadgeVariant} aria-label={supportLevelTooltip} />}
              >
                <CircleIcon className="fill-current" aria-hidden="true" />
                Lv. {supportLevel}
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                <div className="flex max-w-72 flex-col gap-1">
                  <p className="font-semibold">{interpolate(dictionary.supportLevelLabel, { level: supportLevel })}</p>
                  <p className="opacity-80">{dictionary.supportLevelDescriptions[supportLevel]}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {usesFallbackHexViewer && visibleStatus === "active" && (
          <div className="flex-none p-3 sm:px-4">
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>{dictionary.fallbackTitle}</AlertTitle>
              <AlertDescription>{dictionary.fallbackDescription}</AlertDescription>
            </Alert>
          </div>
        )}
        <div
          ref={containerRef}
          className="viewer-container min-h-0 flex-1 overflow-auto"
          style={{
            "--viewer-background": "var(--background)",
            "--viewer-foreground": "var(--foreground)",
            "--viewer-border": "var(--border)",
            "--viewer-accent": "var(--primary)",
            "--viewer-font-family": "var(--font-system)",
          } as React.CSSProperties}
        />
        {visibleStatus !== "active" && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {visibleStatus === "loading" ? <LoaderCircleIcon className="animate-spin" /> : visibleStatus === "error" ? <AlertCircleIcon /> : <FileSearchIcon />}
                </EmptyMedia>
                {file ? (
                  <EmptyTitle>{visibleStatus === "loading" ? dictionary.openingTitle : visibleStatus === "error" ? dictionary.failedTitle : dictionary.noViewerTitle}</EmptyTitle>
                ) : (
                  <h1 className="font-heading text-sm font-medium tracking-tight">{dictionary.selectTitle}</h1>
                )}
                <EmptyDescription>
                  {visibleMessage || (file ? interpolate(dictionary.noPlugin, { extension: file.name.split(".").pop()?.toLowerCase() || "unknown" }) : dictionary.selectDescription)}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
