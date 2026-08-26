import { ApertureIcon } from "lucide-react";

export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <ApertureIcon className="size-4" aria-hidden="true" />
      </span>
      Anyfile
    </span>
  );
}
