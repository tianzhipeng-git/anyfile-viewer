import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examples = join(pluginRoot, "examples");
const temporary = mkdtempSync(join(tmpdir(), "anyfile-image-examples-"));

function magick(...args) {
  execFileSync("magick", args, { stdio: "inherit" });
}

function truncate(source, target) {
  const bytes = readFileSync(join(examples, source));
  writeFileSync(join(examples, target), bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))));
}

try {
  const first = join(temporary, "first.png");
  const second = join(temporary, "second.png");
  const alpha = join(temporary, "alpha.png");
  magick("-size", "96x64", "gradient:#2563eb-#7c3aed", first);
  magick("-size", "96x64", "gradient:#f97316-#facc15", second);
  magick(first, "-alpha", "set", "-channel", "A", "-evaluate", "set", "60%", "+channel", alpha);
  magick(alpha, join(examples, "sample.png"));
  magick(first, "-quality", "88", join(examples, "sample.jpg"));
  magick(first, "-quality", "75", join(examples, "sample-lossy.webp"));
  magick(alpha, "-define", "webp:lossless=true", join(examples, "sample-lossless-alpha.webp"));
  magick(first, join(examples, "sample.avif"));
  magick("-delay", "20", first, "-delay", "20", second, "-loop", "0", join(examples, "animated.apng"));
  magick("-delay", "20", first, "-delay", "20", second, "-loop", "0", join(examples, "animated.gif"));
  magick("-delay", "20", first, "-delay", "20", second, "-loop", "0", join(examples, "animated.webp"));

  truncate("sample.jpg", "truncated.jpg");
  truncate("sample.png", "truncated.png");
  truncate("animated.apng", "truncated.apng");
  truncate("animated.gif", "truncated.gif");
  truncate("animated.webp", "truncated.webp");
  truncate("sample.avif", "truncated.avif");

  writeFileSync(join(examples, "corrupt.jpg"), Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]));
  writeFileSync(join(examples, "corrupt.png"), Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]));
  writeFileSync(join(examples, "corrupt.gif"), new TextEncoder().encode("GIF89a"));
  writeFileSync(join(examples, "corrupt.webp"), new TextEncoder().encode("RIFF\u0010\0\0\0WEBPVP8X"));
  writeFileSync(join(examples, "corrupt.avif"), Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0]));
} finally {
  rmSync(temporary, { force: true, recursive: true });
}
