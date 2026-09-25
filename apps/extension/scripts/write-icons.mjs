import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Renders the extension's icons from the mdbase Frontmatter mark (mdbase-connect's
 * `assets/mdbase-app-icon.svg`). Toolbars can be light or dark and Chrome has no themed
 * action icons, so every size sits the dark mark on the light app tile.
 *
 * 16 and 32 px are redrawn on the pixel grid so the bars stay crisp; 48 and 128 px scale
 * the mark itself. The 128 px store icon keeps Chrome's 16 px transparent margin.
 *
 * Needs `rsvg-convert` (librsvg). Run `pnpm icons` after changing the mark and commit
 * the PNGs.
 */

const ink = "#131921";
const accent = "#005c88";
const tile = "#fcfdff";
const edge = "#d3dae2";

/** The mark in its own 120-unit space; the accent bar is the second row's long field. */
const markRects = [
  [22, 22, 20],
  [50, 22, 20],
  [78, 22, 20],
  [22, 44, 12],
  [22, 66, 28],
  [58, 66, 40],
  [22, 88, 20],
  [50, 88, 20],
  [78, 88, 20],
].map(([x, y, width]) => ({ x, y, width, height: 10, fill: ink }));
markRects.push({ x: 42, y: 44, width: 56, height: 10, fill: accent });

/** The same bars on a 12 × 11 grid, one unit per pixel at 16 px. */
const gridRects = [
  [0, 0, 3, ink],
  [4, 0, 4, ink],
  [9, 0, 3, ink],
  [0, 3, 2, ink],
  [3, 3, 9, accent],
  [0, 6, 4, ink],
  [5, 6, 7, ink],
  [0, 9, 3, ink],
  [4, 9, 4, ink],
  [9, 9, 3, ink],
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

/** Pixel-snapped icon: `scale` pixels per grid unit, the grid centred on the tile. */
function gridIcon(size, scale, radius) {
  const left = (size - 12 * scale) / 2;
  const top = (size - 11 * scale) / 2;
  return svg(size, [
    ...tileRects(size, 0, radius),
    `<g shape-rendering="crispEdges">`,
    ...gridRects.map(
      (r) =>
        `  ${rect({
          x: left + r.x * scale,
          y: Math.floor(top) + r.y * scale,
          width: r.width * scale,
          height: r.height * scale,
          fill: r.fill,
        })}`,
    ),
    "</g>",
  ]);
}

/** Scaled icon: the mark's 22–98 extent fills `fraction` of a tile inset by `inset`. */
function markIcon(size, inset, radius, fraction) {
  const side = size - inset * 2;
  const scale = (side * fraction) / 76;
  const offset = inset + (side - 76 * scale) / 2 - 22 * scale;
  return svg(size, [
    ...tileRects(size, inset, radius),
    `<g transform="translate(${offset.toFixed(3)} ${offset.toFixed(3)}) scale(${scale.toFixed(4)})">`,
    ...markRects.map((r) => `  ${rect(r, 2)}`),
    "</g>",
  ]);
}

const icons = {
  16: gridIcon(16, 1, 3),
  32: gridIcon(32, 2, 6),
  48: markIcon(48, 0, 9, 0.66),
  128: markIcon(128, 16, 18, 0.6),
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
