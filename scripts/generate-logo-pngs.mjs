import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const svg = readFileSync(resolve(root, "public/logo.svg"));

const sizes = [16, 32, 48, 120, 128, 180, 192, 512];

for (const size of sizes) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "inside" })
    .png()
    .toFile(resolve(root, `public/logo-${size}.png`));
  console.log(`wrote public/logo-${size}.png`);
}

// Apple touch icon (180) already covered above.
// Favicon (32) already covered above.
console.log("done");
