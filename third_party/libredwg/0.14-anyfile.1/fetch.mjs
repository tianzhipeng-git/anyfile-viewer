import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const upstream = JSON.parse(await readFile(new URL('./upstream.json', import.meta.url), 'utf8'));
const output = process.argv[2];
for (const [name, item] of [['libredwg-source.tar.gz', upstream.core], ['bindings-source.tar.gz', upstream.bindings], ['bindings-npm.tgz', upstream.npm]]) {
  const path = `${output}/${name}`;
  let bytes;
  try { bytes = await readFile(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    execFileSync('curl', ['-fLsS', '--retry', '2', '--max-time', '120', item.url, '-o', path]);
    bytes = await readFile(path);
  }
  const valid = item.sha256 ? createHash('sha256').update(bytes).digest('hex') === item.sha256
    : `sha512-${createHash('sha512').update(bytes).digest('base64')}` === item.integrity;
  if (!valid) throw new Error(`Integrity mismatch: ${name}`);
}
await writeFile(`${output}/package.json`, '{"type":"module"}\n');
