import sharp from 'sharp';

// Chroma-key export of the generated atlas; retain the pink heart and dark outlines.
const source = 'output/imagegen/pepe-heart-source.png';
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const [r, g, b] = data.subarray(i, i + 3);
  if (r > g * 1.5 && r > g + 10 && b > g + 10 && b > r * .85) data[i + 3] = 0;
}
const keyed = await sharp(data, { raw: info }).png().toBuffer();
const cell = info.width / 4;
const frames = [];
for (let i = 0; i < 3; i++) {
  // Identical crops preserve the fixed head and foot registration across poses.
  frames.push({ input: await sharp(keyed).extract({ left: Math.round(i * cell + 65), top: 106, width: 412, height: 506 })
    .resize(80, 104, { fit: 'fill', kernel: 'nearest' }).png().toBuffer(), left: i * 80, top: 0 });
}
const paletteSheet = await sharp({ create: { width: 240, height: 104, channels: 4, background: '#00000000' } })
  .composite(frames).png({ palette: true, colours: 64, dither: 0 }).toBuffer();
await sharp(paletteSheet).webp({ lossless: true }).toFile('public/poker-plush/pepe-heart-poses.webp');
const heartCell = await sharp(keyed).extract({ left: Math.round(cell * 3), top: 0, width: Math.floor(cell), height: info.height }).png().toBuffer();
const paletteHeart = await sharp(heartCell)
  .trim({ background: '#00000000' }).resize(32, 28, { fit: 'contain', kernel: 'nearest', background: '#00000000' })
  .png({ palette: true, colours: 32, dither: 0 }).toBuffer();
await sharp(paletteHeart).webp({ lossless: true }).toFile('public/poker-plush/pepe-heart.webp');
