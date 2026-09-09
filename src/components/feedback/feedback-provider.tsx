"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppDictionary } from "@/i18n/types";
import type { PublishedLocale } from "@/i18n/config";

const FeedbackDialog = dynamic(() => import("./feedback-dialog"), { ssr: false });
type FeedbackContextValue = {
  label: string;
  open(trigger: HTMLElement): void;
};
const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children, locale, dictionary, endpoint }: {
  children: ReactNode;
  locale: PublishedLocale;
  dictionary: AppDictionary["feedback"];
  endpoint: string;
}) {
  const [activated, setActivated] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  return (
    <FeedbackContext.Provider value={{
      label: dictionary.trigger,
      open(trigger) {
        triggerRef.current = trigger;
        setActivated(true);
        setOpen(true);
      },
    }}>
      {children}
      {activated && <FeedbackDialog open={open} onOpenChange={setOpen} triggerRef={triggerRef}
        locale={locale} dictionary={dictionary} endpoint={endpoint} />}
    </FeedbackContext.Provider>
  );
}

export function FeedbackTrigger({ label, variant = "outline" }: {
  label?: string;
  variant?: "outline" | "ghost";
}) {
  const feedback = useContext(FeedbackContext);
  if (!feedback) return null;
  return (
    <Button type="button" variant={variant} size="sm" aria-haspopup="dialog"
      onClick={(event) => feedback.open(event.currentTarget)}>
      <MessageSquareIcon data-icon="inline-start" />
      {label ?? feedback.label}
    </Button>
  );
}
