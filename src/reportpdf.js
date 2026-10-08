import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
const env = (k) => k === "PORTAL_URL" ? location.origin : "";
const clean = (s) => String(s ?? "").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/⁶/g, "6").replace(/[‐‑]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "");
async function reportPdf(m) {
  if (!m.blocks && m.sections) m.blocks = m.sections.map((s) => ({
    type: "table",
    title: s.title,
    big: true,
    performedBy: s.performedBy,
    cols: s.cols,
    widths: s.cols.length === 5 && s.cols[1] === "Rx" ? [150, 30, 70, 170, 112] : [180, 85, 30, 110, 127],
    rows: s.rows.map((r) => ({ cells: r.cells, tone: r.flag ? { 1: r.crit ? "red" : "bold" } : {} }))
  }));
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), mono = await doc.embedFont(StandardFonts.Courier);
  const W = 612, H = 792, X = 40, R = W - 40, ink = rgb(0.05, 0.09, 0.15), mute = rgb(0.3, 0.34, 0.42), blueLab = rgb(0.12, 0.37, 0.6), grey = rgb(0.9, 0.91, 0.93), line = rgb(0.85, 0.87, 0.9);
  const TONE = { green: rgb(0.09, 0.5, 0.23), red: rgb(0.82, 0.15, 0.23), blue: rgb(0.12, 0.37, 0.84), bold: ink };
  let logo = null;
  try {
    const u = env("PORTAL_URL").replace(/\/+$/, "");
    if (u) {
      const r = await fetch(`${u}/logo.png`);
      if (r.ok) logo = await doc.embedPng(new Uint8Array(await r.arrayBuffer()));
    }
  } catch {
  }
  let page, y = 0;
  const text = (s, x, yy, size = 9, f = reg, color = ink) => page.drawText(clean(s), { x, y: yy, size, font: f, color });
  const rText = (s, xr, yy, size = 9, f = reg, color = ink) => text(s, xr - f.widthOfTextAtSize(clean(s), size), yy, size, f, color);
  const wrap = (s, width, size, f) => {
    const words = clean(s).split(/\s+/);
    const out = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(t, size) <= width || !cur) cur = t;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
    return out.map((l) => {
      while (f.widthOfTextAtSize(l, size) > width && l.length > 1) l = l.slice(0, -1);
      return l;
    });
  };
  const header = () => {
    page = doc.addPage([W, H]);
    y = H - 36;
    if (logo) {
      const w = 150, h = logo.height / logo.width * w;
      page.drawImage(logo, { x: X, y: y - h + 8, width: w, height: h });
    } else text(m.lab?.name ?? "", X, y - 10, 15, bold);
    rText(m.status ?? "FINAL", R, y, 10, bold, TONE.red);
    if (Array.isArray(m.lab?.lines) && m.lab.lines.length) {
      m.lab.lines.forEach((l, i) => rText(l, R, y - 12 - i * 10, i === 0 ? 9 : 8.2, i === 0 ? bold : reg, i === 0 ? ink : blueLab));
      y -= Math.max(50, 18 + m.lab.lines.length * 10);
    } else {
      rText(m.lab?.phone ?? "", R, y - 12, 8.5, reg, blueLab);
      rText(m.lab?.address ?? "", R, y - 23, 8.5, reg, blueLab);
      y -= 50;
    }
    page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.8, color: ink });
    y -= 12;
    const pt = [
      ["Patient", m.patient?.name],
      ["Birth", m.patient?.dob],
      ["Accession", m.accession],
      ["Patient #", m.patient?.mrn],
      ["Age", m.patient?.age],
      ["Collection Date", m.collected],
      ["Doctor", m.provider],
      ["Gender", m.patient?.gender ?? m.patient?.sex],
      ["Received Date", m.received],
      ["Organization", `${m.clinic ?? ""}${m.acct ? ` (${m.acct})` : ""}`],
      ["Diagnosis", m.icd],
      ["Reported Date", m.reported || "Pending"]
    ];
    const cw = (R - X) / 3;
    for (let i = 0; i < pt.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const [k, v] = pt[i + j];
        const x = X + j * cw;
        text(`${k}:`, x, y, 8, reg, mute);
        text(wrap(String(v ?? ""), cw - 70, 8, reg)[0] ?? "", x + 66, y, 8);
      }
      y -= 11;
    }
    y -= 6;
  };
  const need = (h) => {
    if (y - h < 56) header();
  };
  header();
  if (m.flags?.crit) {
    need(18);
    page.drawRectangle({ x: X, y: y - 4, width: R - X, height: 15, color: rgb(0.99, 0.91, 0.92) });
    text(`CRITICAL VALUE REPORTED (${m.flags.crit}). The laboratory will call your office.`, X + 6, y, 9, bold, TONE.red);
    y -= 20;
  }
  for (const b of m.blocks ?? []) {
    if (b.type === "break") {
      header();
      continue;
    }
    if (b.type === "title") {
      need(34);
      y -= 6;
      const t = clean(b.text), w = bold.widthOfTextAtSize(t, 12);
      text(t, (W - w) / 2, y, 12, bold);
      page.drawLine({ start: { x: (W - w) / 2, y: y - 2 }, end: { x: (W + w) / 2, y: y - 2 }, thickness: 0.7, color: ink });
      y -= 16;
      continue;
    }
    if (b.type === "lines") {
      for (const [k, v] of b.lines) {
        const kw = bold.widthOfTextAtSize(clean(`${k}: `), 8.5);
        wrap(String(v ?? ""), R - X - kw, 8.5, reg).forEach((l, i) => {
          need(12);
          if (i === 0) text(`${k}:`, X, y, 8.5, bold);
          text(l, X + kw, y, 8.5, reg);
          y -= 11;
        });
      }
      page.drawLine({ start: { x: X, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.6, color: ink });
      y -= 4;
      continue;
    }
    if (b.type === "list") {
      need(40);
      y -= 8;
      text(b.title, X, y, 8.8, bold);
      y -= 11;
      for (const l of wrap(b.text, R - X, 7.8, reg)) {
        need(10);
        text(l, X, y, 7.8, reg, mute);
        y -= 9.5;
      }
      for (const [g, v] of b.items) {
        const lab = `${g}: `, lw = bold.widthOfTextAtSize(clean(lab), 7.8);
        const ls = wrap(String(v), R - X - lw, 7.8, reg);
        ls.forEach((l, k) => {
          need(10);
          if (k === 0) text(lab, X, y, 7.8, bold, mute);
          text(l, X + lw, y, 7.8, reg, mute);
          y -= 9.5;
        });
      }
      y -= 4;
      continue;
    }
    if (b.type === "note") {
      y -= 2;
      for (const l of wrap(b.text, R - X, 7.2, mono)) {
        need(9);
        text(l, X, y, 7.2, mono, mute);
        y -= 8.8;
      }
      y -= 4;
      continue;
    }
    const tot = b.widths.reduce((a, x) => a + x, 0), ws = b.widths.map((w) => w / tot * (R - X));
    const xs = ws.reduce((a, w, i) => (a.push(i ? a[i - 1] + ws[i - 1] : X), a), []);
    const boxed = !b.big;
    const drawHead = (cont = false) => {
      if (b.title) {
        if (b.big) {
          need(40);
          y -= 6;
          text(b.title + (cont ? " (continued)" : ""), X, y, 12, bold);
          if (b.performedBy && !cont) rText(`Performed by ${b.performedBy}`, R, y, 7.5, reg, mute);
          y -= 5;
          page.drawLine({ start: { x: X, y }, end: { x: R, y }, thickness: 0.8, color: ink });
          y -= 11;
        } else {
          need(34);
          y -= 9;
          const t = clean(String(b.title).toUpperCase() + (cont ? " (CONTINUED)" : "")), w = bold.widthOfTextAtSize(t, 7.8);
          text(t, (W - w) / 2, y, 7.8, bold);
          y -= 4;
        }
      }
      const hh = 12;
      if (boxed) {
        page.drawRectangle({ x: X, y: y - hh + 3, width: R - X, height: hh, color: grey, borderColor: ink, borderWidth: 0.6 });
      }
      b.cols.forEach((c, i) => text(boxed ? c.toUpperCase() : c, xs[i] + 3, y - 6, 7.2, bold));
      y -= hh;
      if (!boxed) page.drawLine({ start: { x: X, y: y + 3 }, end: { x: R, y: y + 3 }, thickness: 0.6, color: ink });
    };
    need(40);
    drawHead();
    for (const r of b.rows) {
      if (r.group) {
        if (y - 30 < 56) {
          header();
          drawHead(true);
        }
        y -= 3;
        text(r.group, X, y - 6, 8.3, bold);
        y -= 10;
        page.drawLine({ start: { x: X, y: y + 1 }, end: { x: R, y: y + 1 }, thickness: 0.6, color: ink });
        y -= 1;
        continue;
      }
      const cells = r.cells.map((c, i) => wrap(String(c ?? ""), ws[i] - 6, 8, r.tone?.[i] ? bold : reg));
      const lines = Math.max(1, ...cells.map((c) => c.length)), h = lines * 9.6 + 3;
      if (y - h < 56) {
        header();
        drawHead(true);
      }
      cells.forEach((c, i) => c.forEach((l, k) => text(l, xs[i] + 3, y - 8 - k * 9.6, 8, r.tone?.[i] ? bold : reg, r.tone?.[i] ? TONE[r.tone[i]] : ink)));
      if (boxed) {
        page.drawRectangle({ x: X, y: y - h, width: R - X, height: h, borderColor: ink, borderWidth: 0.5 });
        xs.slice(1).forEach((x) => page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.5, color: ink }));
      } else page.drawLine({ start: { x: X, y: y - h }, end: { x: R, y: y - h }, thickness: 0.4, color: line });
      y -= h;
    }
    y -= 6;
  }
  need(30);
  y -= 6;
  if (!(Array.isArray(m.lab?.lines) && m.lab.lines.length)) {
    const foot = `Laboratory Director: ${m.lab?.director ?? ""}${m.lab?.clia ? `   CLIA ID# ${m.lab.clia}` : ""}`;
    text(foot, (W - reg.widthOfTextAtSize(clean(foot), 8.5)) / 2, y, 8.5, reg);
    y -= 11;
  }
  const conf = `CONFIDENTIAL: protected health information for ${m.clinic ?? "the ordering provider"}. If received in error, call ${m.lab?.phone ?? "the laboratory"} and destroy all copies.`;
  for (const l of wrap(conf, R - X, 7.5, reg)) {
    text(l, X, y, 7.5, reg, mute);
    y -= 9;
  }
  const pages = doc.getPages(), printed = (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: X, y: 40 }, end: { x: R, y: 40 }, thickness: 0.6, color: ink });
    pg.drawText(clean(`Printed: ${printed} (Arizona)`), { x: X, y: 28, size: 7.5, font: reg, color: mute });
    const r1 = clean(`Accession: ${m.accession ?? ""}   Patient #: ${m.patient?.mrn ?? ""}`), r2 = `Page ${i + 1}/${pages.length}`;
    pg.drawText(r1, { x: R - reg.widthOfTextAtSize(r1, 7.5), y: 30, size: 7.5, font: reg, color: mute });
    pg.drawText(r2, { x: R - reg.widthOfTextAtSize(r2, 7.5), y: 20, size: 7.5, font: reg, color: mute });
  });
  return await doc.save();
}
export {
  reportPdf
};
