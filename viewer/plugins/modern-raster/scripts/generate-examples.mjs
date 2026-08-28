import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examples = join(pluginRoot, "examples");
const temporary = mkdtempSync(join(tmpdir(), "anyfile-modern-raster-"));
mkdirSync(examples, { recursive: true });

try {
  const base = join(temporary, "base.png");
  const alpha = join(temporary, "alpha.png");
  const red = join(temporary, "red.png");
  const blue = join(temporary, "blue.png");
  execFileSync("magick", ["-size", "96x64", "gradient:#2255aa-#f5c451", base]);
  execFileSync("magick", ["-size", "96x64", "xc:none", "-fill", "#32a852aa", "-draw", "circle 48,32 48,5", alpha]);
  execFileSync("magick", ["-size", "96x64", "xc:#d43f3a", red]);
  execFileSync("magick", ["-size", "96x64", "xc:#3467d6", blue]);
  execFileSync("cjxl", [base, join(examples, "sample-lossy.jxl"), "-q", "80"]);
  execFileSync("cjxl", [alpha, join(examples, "sample-lossless-alpha.jxl"), "-q", "100"]);
  execFileSync("magick", ["-delay", "20", red, "-delay", "30", blue, "-loop", "0", join(examples, "animated.jxl")]);
  execFileSync("heif-enc", [base, "-o", join(examples, "sample.heic")]);
  const jxl = readFileSync(join(examples, "sample-lossy.jxl"));
  writeFileSync(join(examples, "truncated.jxl"), jxl.subarray(0, Math.min(32, jxl.length)));
  writeFileSync(join(examples, "corrupt.jxl"), new Uint8Array([0xff, 0x0a, 0, 1, 2, 3, 4]));
  const heic = readFileSync(join(examples, "sample.heic"));
  writeFileSync(join(examples, "truncated.heic"), heic.subarray(0, Math.min(32, heic.length)));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
