// Reads text from insurance card photos and PDFs in the browser (Tesseract OCR, pdf.js). Nothing is uploaded.
// The engine (~8 MB) loads the first time someone reads a card, from /ocr on the portal itself.
let worker = null, progressFn = null;
async function getWorker() {
  if (worker) return worker;
  const { createWorker } = await import("tesseract.js");
  worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", workerBlobURL: false, gzip: true,
    logger: (m) => progressFn && progressFn(m),
  });
  return worker;
}
export async function ocr(image, onProgress) {
  if (typeof window !== "undefined" && window.__ocrStub) return window.__ocrStub(image);
  progressFn = onProgress || null;
  const w = await getWorker();
  const { data } = await w.recognize(image);
  return data.text || "";
}
// One entry per card image or PDF page: { name, text }. Text-based PDFs are read directly; scanned ones are OCR'd.
export async function cardTexts(file, onProgress) {
  if (typeof window !== "undefined" && window.__ocrStub) return [{ name: file.name, text: await window.__ocrStub(file) }];
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const out = [], n = Math.min(doc.numPages, 60);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let text = tc.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("");
      if (text.replace(/\s/g, "").length < 20) {
        const vp = page.getViewport({ scale: 2 }), c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        text = await ocr(c, (m) => onProgress && onProgress({ ...m, page: i, pages: n }));
      }
      out.push({ name: n > 1 ? `${file.name} p.${i}` : file.name, text });
      onProgress && onProgress({ status: "page done", page: i, pages: n });
    }
    return out;
  }
  return [{ name: file.name, text: await ocr(file, onProgress) }];
}
