import { chromium } from "playwright";
import fs from "node:fs";
const svg = fs.readFileSync(process.argv[2], "utf8");
const b = await chromium.launch({ channel: "chrome" });
async function render(size, out, inner = 1) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const scale = inner;
  await p.setContent(`<body style="margin:0;background:#c0492f"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;overflow:hidden"><div style="width:${size * scale}px;height:${size * scale}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div></body>`);
  await p.screenshot({ path: out, omitBackground: false });
  await p.close();
}
await render(512, "public/icons/icon-512.png");
await render(192, "public/icons/icon-192.png");
await render(180, "public/apple-touch-icon.png");
await render(512, "public/icons/maskable-512.png", 0.8);
await b.close();
