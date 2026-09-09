"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppDictionary } from "@/i18n/types";
import type { PublishedLocale } from "@/i18n/config";

export default function FeedbackDialog({ open, onOpenChange, triggerRef, locale, dictionary: t, endpoint }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  triggerRef: RefObject<HTMLElement | null>;
  locale: PublishedLocale;
  dictionary: AppDictionary["feedback"];
  endpoint: string;
}) {
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [format, setFormat] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !endpoint) return;
    if (!message.trim()) { setError(t.invalid); return; }
    const data = { category, message: message.trim(), email: email.trim(), website,
      context: { locale, ...(format.trim() ? { format: format.trim() } : {}) } };
    const signature = JSON.stringify(data);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    const submissionId = attempt.current.id;
    inFlight.current = true;
    setSending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ ...data, submissionId }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? t.rateLimited : response.status === 400 ? t.invalid : t.failed);
        return;
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("submissionId" in result) || result.submissionId !== submissionId) {
        throw new Error("Invalid feedback response");
      }
      setReceipt(submissionId);
      setMessage(""); setEmail(""); setFormat(""); setWebsite("");
      attempt.current = null;
    } catch {
      setError(t.failed);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]"
        showCloseButton={false} finalFocus={triggerRef}>
        <DialogHeader className="pr-8">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={t.close} />}>
          <XIcon />
        </DialogClose>
        {receipt ? (
          <div className="flex flex-col gap-4">
            <Alert role="status"><CheckIcon /><AlertDescription>{t.success}</AlertDescription></Alert>
            <p className="text-xs break-all text-muted-foreground">{t.receipt}: {receipt}</p>
            <Button type="button" onClick={() => { setReceipt(""); setError(""); }}>{t.another}</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <fieldset disabled={sending || !endpoint} className="min-w-0">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="feedback-category">{t.category}</FieldLabel>
                  <NativeSelect id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <NativeSelectOption value="bug">{t.bug}</NativeSelectOption>
                    <NativeSelectOption value="feature">{t.feature}</NativeSelectOption>
                    <NativeSelectOption value="other">{t.other}</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="feedback-message">{t.message}</FieldLabel>
                  <Textarea id="feedback-message" required maxLength={2000} rows={5} value={message}
                    placeholder={category === "feature" ? t.featurePlaceholder : t.messagePlaceholder}
                    onChange={(event) => setMessage(event.target.value)} aria-describedby="feedback-message-help" />
                  <FieldDescription id="feedback-message-help">{message.length} / 2000</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="feedback-format">{t.format}</FieldLabel>
                  <Input id="feedback-format" maxLength={24} placeholder=".pdf, .dwg…" value={format}
                    onChange={(event) => setFormat(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="feedback-email">{t.email}</FieldLabel>
                  <Input id="feedback-email" type="email" autoComplete="email" maxLength={254} value={email}
                    onChange={(event) => setEmail(event.target.value)} aria-describedby="feedback-email-help" />
                  <FieldDescription id="feedback-email-help">{t.emailHelp}</FieldDescription>
                </Field>
                <div hidden aria-hidden="true">
                  <label htmlFor="feedback-website">Website</label>
                  <input id="feedback-website" name="website" tabIndex={-1} autoComplete="off" value={website}
                    onChange={(event) => setWebsite(event.target.value)} />
                </div>
              </FieldGroup>
            </fieldset>
            <p className="text-xs leading-5 text-muted-foreground">{t.privacy}</p>
            {(!endpoint || error) && <Alert variant="destructive"><AlertDescription>{!endpoint ? t.unavailable : error} <a className="underline" href="mailto:support@anyfile.top">support@anyfile.top</a></AlertDescription></Alert>}
            <Button type="submit" disabled={sending || !endpoint}>
              {sending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
              {sending ? t.sending : t.submit}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
