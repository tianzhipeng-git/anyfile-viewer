import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = process.argv[2];
const upstream = JSON.parse(await readFile(new URL('./upstream.json', import.meta.url), 'utf8'));
const artifacts = {};
async function visit(path = '') {
  for (const entry of await readdir(`${output}/${path}`, { withFileTypes: true })) {
    const name = path ? `${path}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await visit(name);
    else if (entry.name !== 'build-info.json' && !entry.name.endsWith('.log')) {
      const bytes = await readFile(`${output}/${name}`);
      artifacts[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  }
}
await visit();
await writeFile(`${output}/build-info.json`, JSON.stringify({ artifactVersion: upstream.artifactVersion, upstream,
  flags: ['read-only', 'release', 'no-debug', 'no-dxf', 'no-json', '-O2', 'emmalloc', 'DYNAMIC_EXECUTION=0'],
  stackBytes: 5242880, stackOverflowCheck: 2, initialMemoryBytes: 67108864, maximumMemoryBytes: 536870912, artifacts }, null, 2)+'\n');
