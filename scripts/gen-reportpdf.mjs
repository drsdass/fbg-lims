// Regenerates src/reportpdf.js (the browser's Download PDF) from the fax renderer in send-alerts, so both stay identical.
// Run: node scripts/gen-reportpdf.mjs
import { buildSync } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("supabase/functions/send-alerts/index.ts", "utf8");
const start = src.indexOf("// First Bio Genetics logo, embedded"), end = src.indexOf("\n}\n", src.indexOf("async function reportPdf")) + 3;
const ts = src.slice(start, end).replace(/: PDFFont|: PDFPage/g, "");
const out = buildSync({ stdin: { contents: ts, loader: "ts" }, write: false, format: "esm", target: "es2020" }).outputFiles[0].text;
writeFileSync("src/reportpdf.js", `import { PDFDocument, StandardFonts, rgb } from "pdf-lib";\n${out.trim()}\nexport {\n  reportPdf\n};\n`);
console.log("src/reportpdf.js regenerated");
