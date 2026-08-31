import { BinaryIcon, BracesIcon, FileImageIcon, FileTextIcon } from "lucide-react";

const iconByCategory = {
  "images-video": FileImageIcon,
  documents: FileTextIcon,
  "code-data": BracesIcon,
  "developer-artifacts": BinaryIcon,
};

export function FormatGlyph({ category, extension }: { category: string; extension: string }) {
  const Icon = iconByCategory[category as keyof typeof iconByCategory] ?? FileTextIcon;

  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-muted">
      <Icon className="size-20 text-primary" strokeWidth={1.2} aria-hidden="true" />
      <span className="absolute bottom-4 rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase ring-1 ring-foreground/10">.{extension}</span>
    </div>
  );
}
