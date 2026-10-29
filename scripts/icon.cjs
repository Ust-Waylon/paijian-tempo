const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..', 'build');
  const dir = path.join(root, 'icon.iconset');
  await fs.mkdir(dir, { recursive: true });
  const svg = await fs.readFile(path.join(root, 'icon.svg'));
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(dir, `icon_${size}x${size}.png`));
    await sharp(svg)
      .resize(size * 2, size * 2)
      .png()
      .toFile(path.join(dir, `icon_${size}x${size}@2x.png`));
  }
  await sharp(svg).png().toFile(path.join(root, 'icon.png'));
  const chunks = [];
  for (const [name, file] of [
    ['icp4', 'icon_16x16.png'],
    ['icp5', 'icon_32x32.png'],
    ['icp6', 'icon_32x32@2x.png'],
    ['ic07', 'icon_128x128.png'],
    ['ic08', 'icon_256x256.png'],
    ['ic09', 'icon_512x512.png'],
    ['ic10', 'icon_512x512@2x.png'],
    ['ic11', 'icon_16x16@2x.png'],
    ['ic12', 'icon_32x32@2x.png'],
    ['ic13', 'icon_128x128@2x.png'],
    ['ic14', 'icon_256x256@2x.png'],
  ]) {
    const png = await fs.readFile(path.join(dir, file));
    const header = Buffer.alloc(8);
    header.write(name);
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }
  const header = Buffer.alloc(8);
  header.write('icns');
  header.writeUInt32BE(8 + chunks.reduce((sum, b) => sum + b.length, 0), 4);
  await fs.writeFile(
    path.join(root, 'icon.icns'),
    Buffer.concat([header, ...chunks]),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
