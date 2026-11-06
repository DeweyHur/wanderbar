// Draws the app icon set (original "pin-chan" character). Run from apps/mobile: node scripts/icon.cjs assets
const { chromium } = require("playwright");
const fs = require("fs");
const out = process.argv[2];

// Pin-chan: a chubby map pin with a face, blushing, and a little heart. Original drawing.
const pin = `M512 846 C 470 800, 250 640, 250 452 A 262 262 0 1 1 774 452 C 774 640, 554 800, 512 846 Z`;
const face = (eyes = "#4B3340") => `
  <ellipse cx="420" cy="470" rx="26" ry="32" fill="${eyes}"/>
  <ellipse cx="604" cy="470" rx="26" ry="32" fill="${eyes}"/>
  <circle cx="429" cy="458" r="9" fill="#fff"/>
  <circle cx="613" cy="458" r="9" fill="#fff"/>
  <path d="M482 530 Q512 566 542 530" stroke="${eyes}" stroke-width="18" stroke-linecap="round" fill="none"/>`;
const cheeks = `<ellipse cx="358" cy="540" rx="46" ry="28" fill="#F79BB7" opacity="0.85"/>
  <ellipse cx="666" cy="540" rx="46" ry="28" fill="#F79BB7" opacity="0.85"/>`;
const heart = (x, y, s, fill) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 30 C -40 -10, -20 -50, 0 -24 C 20 -50, 40 -10, 0 30 Z" fill="${fill}"/>`;
const character = `
  <ellipse cx="512" cy="884" rx="150" ry="26" fill="#E7A3BA" opacity="0.55"/>
  <path d="${pin}" fill="#D4618B" transform="translate(0 14)"/>
  <path d="${pin}" fill="#FFFFFF" stroke="#D4618B" stroke-width="22" stroke-linejoin="round"/>
  <path d="M330 360 Q 360 270 450 238" stroke="#FFE4EC" stroke-width="30" stroke-linecap="round" fill="none"/>
  ${cheeks}${face()}
  ${heart(770, 214, 1.7, "#D4618B")}
  ${heart(838, 300, 0.9, "#F8B4C9")}`;
const bg = `<defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#FFF3F6"/><stop offset="1" stop-color="#F8B4C9"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <circle cx="170" cy="190" r="18" fill="#fff" opacity="0.8"/><circle cx="880" cy="760" r="12" fill="#fff" opacity="0.8"/><circle cx="150" cy="800" r="10" fill="#fff" opacity="0.7"/>`;

const svg = (body, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;
// Adaptive icons crop to the middle ~66%, so the foreground is drawn smaller.
const scaled = (body, s) => `<g transform="translate(${512 - 512 * s} ${512 - 512 * s + 20 * s}) scale(${s})">${body}</g>`;

const files = {
  "icon.png": [svg(bg + scaled(character, 0.86)), 1024, false],
  "android-icon-foreground.png": [svg(scaled(character, 0.6)), 1024, true],
  "android-icon-monochrome.png": [svg(scaled(`<path d="${pin}" fill="#000"/>`, 0.6)), 1024, true],
  // Android status bar icon: white silhouette on transparent.
  "notification-icon.png": [svg(scaled(`<path d="${pin}" fill="#fff"/>`, 0.82), 96), 96, true],
  "splash-icon.png": [svg(scaled(character, 0.9)), 1024, true],
  "favicon.png": [svg(bg + scaled(character, 0.92), 48), 48, false],
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, [s, size, transparent]] of Object.entries(files)) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.screenshot({ path: `${out}/${name}`, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
})();
