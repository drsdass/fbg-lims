// Copies the in-browser OCR engine (Tesseract) and the PDF renderer into public/ocr so the portal serves them itself.
// Insurance card text is read in the browser: card images never leave the user's computer.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), ".."), out = join(root, "public", "ocr"), nm = join(root, "node_modules");
mkdirSync(out, { recursive: true });
const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
  ["pdfjs-dist/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
];
for (const [from, to] of files) {
  const src = join(nm, from);
  if (!existsSync(src)) { console.error(`copy-ocr: missing ${from}. Run npm install.`); process.exit(1); }
  copyFileSync(src, join(out, to));
}
console.log(`copy-ocr: ${files.length} files in public/ocr`);
