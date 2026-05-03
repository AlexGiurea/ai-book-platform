// Hits the running dev server's /api/book/export with a sample manuscript and
// writes the resulting PDF to tmp/sample-export.pdf.
// Run: `node scripts/test-pdf-export.mjs` (with `npm run dev` already up).
import fs from "node:fs";
import path from "node:path";

const sampleParas = [
  "The road that led to the house was the kind of road you only noticed once you were already on it. It bent through the hills the way a thought bends in a dream — half-remembered, then suddenly intimate, as if you had always known the way.",
  "Margaux drove with the windows down. The smell of cut grass and warm asphalt rose into the car in slow, unhurried waves. She had not been here in seventeen years, and the air remembered her.",
  "By the time the house came into view, the light was the color of honey set on a slow simmer. The chimney leaned the same. The porch sagged the same. Even the small, square window on the second floor — the one her mother used to call 'the eye that never closes' — was lit, faintly, against the deepening blue.",
  "She killed the engine. The radio gave one last sigh. Then nothing, except a creak somewhere in the rafters of the house that might have been welcome and might have been warning.",
  "She got out of the car slowly, the way you do when you suspect a place might be remembering you back. The gravel under her boots was the same gravel. The stone step at the door, worn into a soft basin, was the same step. Even the smell — old wood, lavender, a thin breath of woodsmoke from somewhere down the valley — had the unmistakable shape of memory.",
  "The key, when she fitted it to the lock, turned without effort, as if the house had been holding the bolt back for her. The door swung open onto a hallway lit only by the last of the evening, and for a moment the hush inside was so deep that she heard her own heartbeat as a small, separate visitor.",
];

const longChapter = Array.from({ length: 18 }, () => sampleParas).flat().join("\n\n");

const sample = {
  title: "The House at the End of Every Road",
  author: "Folio Studio",
  synopsis:
    "Seventeen years after she swore she would never come back, Margaux returns to the only house that has ever truly known her — and finds it waiting, exactly as she left it, except for one window that should be dark.",
  chapters: [
    { number: 1, title: "The Long Way Home", content: longChapter },
    { number: 2, title: "What the House Remembered", content: longChapter },
    { number: 3, title: "Nights, in Threes", content: longChapter },
    { number: 4, title: "The Window That Never Closes", content: longChapter },
  ],
};

const port = process.env.PORT || "3000";
const base = `http://localhost:${port}`;

const res = await fetch(`${base}/api/book/export`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: base,
  },
  body: JSON.stringify({ book: sample, format: "pdf" }),
});

if (!res.ok) {
  const txt = await res.text();
  console.error(`Export failed: ${res.status}\n${txt}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const outDir = path.resolve("tmp");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "sample-export.pdf");
fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length.toLocaleString()} bytes)`);
