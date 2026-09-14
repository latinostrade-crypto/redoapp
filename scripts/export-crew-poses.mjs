import sharp from 'sharp';

// Export the previously generated atlas, retaining enclosed light facial pixels.
const { data, info } = await sharp('output/imagegen/crew-poses-source.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const visited = new Uint8Array(width * height);
const queue = new Int32Array(width * height);
let head = 0, tail = 0;
function visit(p) {
  if (visited[p]) return;
  visited[p] = 1;
  const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
  if (Math.min(r, g, b) < 145 || Math.max(r, g, b) - Math.min(r, g, b) > 30) return;
  data[i + 3] = 0; queue[tail++] = p;
}
for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
while (head < tail) {
  const p = queue[head++], x = p % width;
  if (x) visit(p - 1);
  if (x < width - 1) visit(p + 1);
  if (p >= width) visit(p - width);
  if (p < width * (height - 1)) visit(p + width);
}
const clean = await sharp(data, { raw: info }).png().toBuffer();
for (const [name, center] of [['beast', 212], ['girl', 811], ['dog-v2', 1105], ['durov', 1411]]) {
  const frames = [];
  for (const [index, top] of [20, 330, 650].entries()) {
    frames.push({ input: await sharp(clean).extract({ left: center - 130, top, width: 260, height: 304 })
      .resize(80, 96, { fit: 'fill', kernel: 'nearest' }).extend({ top: 8, bottom: 0, left: 0, right: 0, background: '#00000000' })
      .png().toBuffer(), left: index * 80, top: 0 });
  }
  const palette = await sharp({ create: { width: 240, height: 104, channels: 4, background: '#00000000' } })
    .composite(frames).png({ palette: true, colours: 64, dither: 0 }).toBuffer();
  await sharp(palette).webp({ lossless: true }).toFile(`public/poker-plush/${name}-poses.webp`);
}
