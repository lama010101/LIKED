import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svg = readFileSync(resolve(root, "public/logo.svg"));

// Build a multi-resolution .ico from PNG-encoded frames.
// ICO format: ICONDIR + ICONDIRENTRY[] + image data[].
const sizes = [16, 32, 48];
const frames = [];
for (const size of sizes) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "inside" })
    .png()
    .toBuffer();
  frames.push({ size, png });
}

// ICONDIR (6 bytes)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(frames.length, 4); // count

// ICONDIRENTRY (16 bytes each)
const dirSize = 6 + frames.length * 16;
const entries = [];
let offset = dirSize;
for (const f of frames) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(f.size === 256 ? 0 : f.size, 0); // width
  entry.writeUInt8(f.size === 256 ? 0 : f.size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(f.png.length, 8); // image size
  entry.writeUInt32LE(offset, 12); // image offset
  entries.push(entry);
  offset += f.png.length;
}

const ico = Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
writeFileSync(resolve(root, "app/favicon.ico"), ico);
console.log(`wrote app/favicon.ico (${ico.length} bytes, ${sizes.length} frames)`);
