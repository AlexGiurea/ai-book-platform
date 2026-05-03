import fs from "node:fs";

const path = process.argv[2] || "tmp/sample-export.pdf";
const bytes = fs.readFileSync(path);
const text = bytes.toString("latin1");

const fonts = new Set();
let fm;
const fontRe = /\/BaseFont\s*\/([^\s\/\[\]<>]+)/g;
while ((fm = fontRe.exec(text))) fonts.add(fm[1]);
console.log("Fonts:", [...fonts].join(", "));

const mb = text.match(/\/MediaBox\s*\[([^\]]+)\]/);
console.log("MediaBox:", mb ? mb[1].trim() : "(none)");

const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log("Pages:", pageCount);

// Pull text-show ops from raw streams (uncompressed in our generator)
const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let m;
let pi = 0;
const samples = [];
while ((m = streamRe.exec(text))) {
  const s = m[1];
  if (!/Tj/.test(s)) {
    pi++;
    continue;
  }
  const tjRe = /\(((?:[^\\()]|\\.)*)\)\s*Tj/g;
  let t;
  const parts = [];
  while ((t = tjRe.exec(s))) parts.push(t[1]);
  if (parts.length) {
    samples.push({ page: pi, n: parts.length, head: parts.slice(0, 4).join(" | ").slice(0, 200) });
  }
  pi++;
}
console.log("\nSampled text streams:");
for (const s of samples.slice(0, 10)) {
  console.log(`  page-stream ${s.page}: ${s.n} ops :: ${s.head}`);
}
console.log(`  ... (${samples.length} total)`);
