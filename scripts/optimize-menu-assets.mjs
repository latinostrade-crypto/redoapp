import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Reproducible encoding only: no resizing, repainting, palette reduction or loss.
sharp.concurrency(1);
const sources = ['public/banner.png', ...['poker','uno','blackjack'].map(game => `src/assets/resistance/${game}-network-banner.png`)];
const report = [];
for (const source of sources) {
  const destination = source === 'public/banner.png' ? 'src/assets/resistance/lobby-banner.lossless.webp' : source.replace('.png', '.lossless.webp');
  const input = await readFile(source);
  const encoded = await sharp(input).keepIccProfile().webp({lossless: true, effort: 6}).toBuffer();
  const before = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const after = await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual(after.info, before.info, `${source}: dimensions/channels changed`);
  assert.ok(before.data.equals(after.data), `${source}: decoded pixels changed`);
  assert.ok(encoded.length < input.length, `${source}: encoding did not reduce bytes`);
  await writeFile(destination, encoded);
  report.push({source, destination, beforeBytes: input.length, afterBytes: encoded.length, savedPercent: +(100*(1-encoded.length/input.length)).toFixed(1), pixelsIdentical: true});
}
await mkdir('output/release', {recursive: true});
await writeFile('output/release/lossless-assets.json', JSON.stringify(report,null,2));
console.table(report.map(({source,beforeBytes,afterBytes,savedPercent,pixelsIdentical})=>({source,beforeBytes,afterBytes,savedPercent,pixelsIdentical})));
