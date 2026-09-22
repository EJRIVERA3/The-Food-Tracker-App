/**
 * Generates PNG app icons from public/favicon.svg.
 *
 *   node scripts/build-icons.mjs
 *
 * ── Why PNGs are needed when an SVG already exists ────────────────────────
 * The manifest listed only the SVG. Android accepts that; iOS does not read
 * the manifest at all, and its apple-touch-icon link does not accept SVG. So
 * "Add to Home Screen" on an iPhone fell back to a screenshot of whatever
 * was on screen at the time, which looks like a bug rather than an icon.
 *
 * The source mark is 24x24 with no padding. Icons that bleed to the edge get
 * visually cropped by every launcher, so the mark is inset onto a ground
 * that matches the app's own background.
 */
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";

const GROUND = "#f7f7fb";
const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

const source = readFileSync("public/favicon.svg", "utf8");

/** Re-wraps the 24x24 mark inside a padded 512x512 canvas. */
function canvas({ inset, ground, radius }) {
  const size = 512;
  const box = size * (1 - inset * 2);
  const offset = size * inset;

  /* The source paths keep their own 24-unit coordinate space inside a
     nested <svg>, so no path maths is needed to rescale them. */
  const inner = source
    .replace(/^<svg[^>]*>/, `<svg x="${offset}" y="${offset}" width="${box}" height="${box}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">`);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${ground}"/>` +
      inner +
    `</svg>`
  );
}

/* Standard: a comfortable inset, rounded like an app tile.
   Maskable: much smaller mark, square ground — Android crops to the
   launcher's shape and only the central 80% is guaranteed to survive. */
const STANDARD = canvas({ inset: 0.18, ground: GROUND, radius: 96 });
const MASKABLE = canvas({ inset: 0.3, ground: GROUND, radius: 0 });
const APPLE = canvas({ inset: 0.18, ground: GROUND, radius: 0 });

const targets = [
  ["icon-192.png", STANDARD, 192],
  ["icon-512.png", STANDARD, 512],
  ["icon-maskable-192.png", MASKABLE, 192],
  ["icon-maskable-512.png", MASKABLE, 512],
  /* iOS composites any transparency onto white, so this one is flattened
     onto the app's own ground rather than left to chance. */
  ["apple-touch-icon.png", APPLE, 180]
];

for (const [name, svg, size] of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .flatten({ background: GROUND })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${name}`);
  console.log(`  ${name}  ${size}x${size}`);
}
