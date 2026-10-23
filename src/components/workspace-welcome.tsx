"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FileIcon, FileSearchIcon } from "lucide-react";

import { Button } from "./ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "./ui/empty";
import { workspaceEntry } from "../lib/workspace-entry";
import type { AppDictionary } from "../i18n/types";

type WelcomeProps = {
  dictionary: AppDictionary;
  busy: boolean;
  onOpen(): void;
};

function WelcomeContent({ dictionary, busy, onOpen, entry = null }: WelcomeProps & { entry?: string | null }) {
  const task = workspaceEntry(entry);
  return <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon"><FileSearchIcon /></EmptyMedia>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{task ? `${task.label}${dictionary.format.viewerSuffix}` : dictionary.viewer.selectTitle}</h1>
      <EmptyDescription>{dictionary.viewer.selectDescription}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button size="lg" disabled={busy} onClick={onOpen}>
        <FileIcon data-icon="inline-start" />{dictionary.workspace.chooseLocalFile}
      </Button>
      {task?.pairedInsv && <p className="text-sm leading-6 text-muted-foreground">{dictionary.workspace.insvPairHint}</p>}
    </EmptyContent>
  </Empty>;
}

function WelcomeWithEntry(props: WelcomeProps) {
  const params = useSearchParams();
  return <WelcomeContent {...props} entry={params.get("entry")} />;
}

export function WorkspaceWelcome(props: WelcomeProps) {
  return <Suspense fallback={<WelcomeContent {...props} />}><WelcomeWithEntry {...props} /></Suspense>;
}
