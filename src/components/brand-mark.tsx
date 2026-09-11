import Image from "next/image";

export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <Image src="/brand/anyfile-64.png" alt="" width={28} height={28}
        className="size-7 rounded-sm" unoptimized />
      Anyfile
    </span>
  );
}
