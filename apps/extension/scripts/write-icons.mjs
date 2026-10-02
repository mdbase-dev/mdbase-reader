import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Renders the extension's icons from the mdbase pixel-grid mark (mdbase-connect's
 * `scripts/write-brand-icons.mjs`). Toolbars can be light or dark and Chrome has no
 * themed action icons, so every size sits the dark mark on the light app tile.
 *
 * The mark is drawn on a 14-unit grid with a whole number of pixels per unit at every
 * size, so the bars stay crisp. The 128 px store icon keeps Chrome's 16 px
 * transparent margin.
 *
 * Needs `rsvg-convert` (librsvg). Run `pnpm icons` after changing the mark and commit
 * the PNGs.
 */

const ink = "#131921";
const accent = "#005c88";
const tile = "#fcfdff";
const edge = "#d3dae2";

/** The bars on a 14 × 14 grid: bars and row gaps of 2, segment gaps of 1. */
const gridRects = [
  [0, 0, 4, ink],
  [5, 0, 4, ink],
  [10, 0, 4, ink],
  [0, 4, 2, ink],
  [3, 4, 11, accent],
  [0, 8, 5, ink],
  [6, 8, 8, ink],
  [0, 12, 4, ink],
  [5, 12, 4, ink],
  [10, 12, 4, ink],
].map(([x, y, width, fill]) => ({ x, y, width, height: 2, fill }));

function rect({ x, y, width, height, fill }, radius = 0) {
  const r = radius ? ` rx="${radius}"` : "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}"${r} fill="${fill}"/>`;
}

function tileRects(size, inset, radius) {
  const side = size - inset * 2;
  return [
    `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${radius}" fill="${tile}"/>`,
    `<rect x="${inset + 0.5}" y="${inset + 0.5}" width="${side - 1}" height="${side - 1}" rx="${radius - 0.5}" fill="none" stroke="${edge}"/>`,
  ];
}

function svg(size, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    ...body.map((line) => `  ${line}`),
    "</svg>",
    "",
  ].join("\n");
}

/** `scale` pixels per grid unit, the grid centred on a tile inset by `inset`. */
function gridIcon(size, scale, radius, inset = 0) {
  const offset = (size - 14 * scale) / 2;
  return svg(size, [
    ...tileRects(size, inset, radius),
    `<g shape-rendering="crispEdges">`,
    ...gridRects.map(
      (r) =>
        `  ${rect({
          x: offset + r.x * scale,
          y: offset + r.y * scale,
          width: r.width * scale,
          height: r.height * scale,
          fill: r.fill,
        })}`,
    ),
    "</g>",
  ]);
}

const icons = {
  16: gridIcon(16, 1, 3),
  32: gridIcon(32, 2, 6),
  48: gridIcon(48, 2, 9),
  128: gridIcon(128, 4, 18, 16),
};

const root = resolve(import.meta.dirname, "..");
const sources = resolve(root, "icons");
const output = resolve(root, "public/icons");
await mkdir(sources, { recursive: true });
await mkdir(output, { recursive: true });
for (const [size, source] of Object.entries(icons)) {
  const svgPath = resolve(sources, `icon-${size}.svg`);
  await writeFile(svgPath, source);
  execFileSync("rsvg-convert", [
    "--width",
    size,
    "--height",
    size,
    "--output",
    resolve(output, `icon-${size}.png`),
    svgPath,
  ]);
}
