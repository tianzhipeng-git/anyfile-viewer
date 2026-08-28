import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examples = join(pluginRoot, "examples");
const temporary = mkdtempSync(join(tmpdir(), "anyfile-general-raster-"));
mkdirSync(examples, { recursive: true });

function magick(...args) {
  execFileSync("magick", args, { stdio: "inherit" });
}

try {
  const first = join(temporary, "first.png");
  const second = join(temporary, "second.png");
  magick("-size", "96x64", "gradient:#f97316-#2563eb", first);
  magick("-size", "96x64", "gradient:#22c55e-#7c3aed", second);

  magick(first, join(examples, "sample.tga"));
  magick(first, "-compress", "RLE", join(examples, "sample-rle.tga"));
  magick(first, join(examples, "sample.ppm"));
  magick(first, "-colorspace", "Gray", join(examples, "sample.pgm"));
  magick(first, "-colors", "2", join(examples, "sample.pbm"));
  magick(first, `pam:${join(examples, "sample.pam")}`);
  magick(first, "-alpha", "set", "-channel", "A", "-evaluate", "set", "50%", "+channel", `pam:${join(examples, "sample-alpha.pam")}`);
  writeFileSync(join(examples, "sample-ascii.pbm"), "P1\n# generated\n2 2\n0 1\n1 0\n");
  writeFileSync(join(examples, "sample-ascii.pgm"), "P2\n2 2\n15\n0 5 10 15\n");
  writeFileSync(join(examples, "sample-ascii.ppm"), "P3\n2 1\n255\n255 0 0 0 0 255\n");

  magick(first, "-depth", "8", "-compress", "None", join(examples, "sample-none.tiff"));
  magick(first, "-depth", "8", "-compress", "LZW", join(examples, "sample-lzw.tiff"));
  magick(first, "-depth", "8", "-compress", "Zip", join(examples, "sample-deflate.tiff"));
  magick(first, "-depth", "8", "-compress", "RLE", join(examples, "sample-packbits.tiff"));
  magick(first, "-depth", "8", "-compress", "JPEG", join(examples, "sample-jpeg.tiff"));
  magick(first, "-depth", "8", "-define", "tiff:tile-geometry=32x32", "-compress", "LZW", join(examples, "sample-tiled.tiff"));
  magick(first, second, "-depth", "8", "-compress", "LZW", join(examples, "sample-multipage.tiff"));
  magick(first, "-depth", "16", "-define", "quantum:format=unsigned", "-compress", "LZW", join(examples, "sample-16bit.tiff"));
  magick(first, "-alpha", "set", "-channel", "A", "-evaluate", "set", "50%", "+channel", "-depth", "8", "-compress", "LZW", join(examples, "sample-alpha.tiff"));
  magick(first, "-orient", "RightTop", "-depth", "8", "-compress", "LZW", join(examples, "sample-oriented.tiff"));

  for (const name of ["sample.tga", "sample.ppm", "sample-lzw.tiff"]) {
    const bytes = readFileSync(join(examples, name));
    writeFileSync(join(examples, `truncated-${name}`), bytes.subarray(0, Math.max(8, Math.floor(bytes.length / 3))));
  }
  writeFileSync(join(examples, "corrupt.tga"), "not a tga");
  writeFileSync(join(examples, "corrupt.ppm"), "P6\n96 nope\n255\n");
  writeFileSync(join(examples, "corrupt.tiff"), "II*\0\b\0\0\0");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
