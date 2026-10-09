// Parsing helpers for instrument exports (Yumizen C560 screening, SCIEX 4500 / MultiQuant).
// Kept free of app state so they can be tested against real export files.

// "Desipramine\u00a01" / "6AM 1" -> "desipramine" / "6am": drop the MultiQuant ion index, spacing and punctuation.
export const normName = (s) => String(s ?? "").replace(/[\s\u00a0]+\d+\s*$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Tube labels carry a specimen suffix ("60000003u1", "50018190U1", "FBG260929-1001-1").
export const stripSuffix = (s) => String(s ?? "").trim().toUpperCase().replace(/[A-Z]\d{1,2}$/, "").replace(/-\d{1,2}$/, "");

function splitLine(line, d) {
  if (d === "\t") return line.split("\t").map((x) => x.trim());
  const out = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Finds the real header row (instrument exports often start with a few lines of run information).
export function parseTable(text, isHeader) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  let hi = lines.findIndex((l) => l.trim() && (!isHeader || isHeader(l)));
  if (hi < 0) hi = lines.findIndex((l) => l.trim());
  if (hi < 0) return { h: [], rows: [] };
  // Pick whichever of tab, semicolon or comma splits the header into the most columns (Excel in some regions saves CSV with semicolons).
  const count = (l, c) => { let n = 0, q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } return n; };
  const d = ["\t", ";", ","].reduce((best, c) => (count(lines[hi], c) > count(lines[hi], best) ? c : best), ",");
  const h = splitLine(lines[hi], d);
  const rows = lines.slice(hi + 1).filter((l) => l.trim()).map((l) => splitLine(l, d));
  return { h, rows };
}

// Yumizen C560 chemistry codes -> screen codes used on the requisition.
export const C560_ALIAS = { AMPH: "AMP", AMP: "AMP", BARB: "BAR", BAR: "BAR", BENZ: "BZO", BZO: "BZO", BUPR: "BUP", BUP: "BUP",
  COC: "COC", ETG: "ETG", MDMA: "MDMA", MTD: "MTD", OPI: "OPI", OXY: "OXY", PCP: "PCP", FEN: "FENT", FENT: "FENT",
  THC: "THC", "6-AM": "HEROIN", "6AM": "HEROIN", HEROIN: "HEROIN" };
export const VALIDITY = { cr: "Urine creatinine (validity)", ph: "Urine pH (validity)", sg: "Urine specific gravity (validity)", out: "Specimen validity" };
export const VALIDITY_CODES = { "CREAT-U": VALIDITY.cr, CREAT: VALIDITY.cr, "PH-U": VALIDITY.ph, PH: VALIDITY.ph, "SG-U": VALIDITY.sg, SG: VALIDITY.sg };

// FBG urine validity interpretation (Toxicology Parameters sheet).
export function validityOf(cr, sg, ph) {
  const has = (x) => typeof x === "number" && !isNaN(x);
  if (has(ph)) {
    if (ph < 3.0 || ph > 11.0) return "Adulterated";
    if ((ph >= 3.0 && ph < 4.5) || (ph > 9.0 && ph <= 11.0)) return "Invalid";
  }
  if (has(cr) && has(sg)) {
    if (cr < 2.0 && (sg < 1.001 || sg >= 1.02)) return "Substituted";
    if (cr < 2.0) return "Invalid";
    if (sg < 1.001) return "Invalid";
    if (cr < 20 && sg < 1.003) return "Diluted";
  }
  return "Normal";
}

export const isControlName = (s) => /^(double\s*blank|blank|cal|std|standard|qc|ec\b|ec$|neg|pos|ctrl|control|solvent|matrix)/i.test(String(s ?? "").trim());

// Yumizen C560 results over the HL7 interface (ORU^R01, HL7 v2.3.1). The bridge saves each message the analyzer sends;
// this turns a batch of them into the same table the C560 CSV export gives, so one importer handles both.
// Patient results (MSH-16 = 0): OBR-2 barcode, OBR-3 sample ID, OBX-3 channel, OBX-4 test name, OBX-5 result,
// OBX-6 unit, OBX-14 finish time, OBX-17 rerun flag. QC results (MSH-16 = 2): OBR-2 channel, OBR-3 test name,
// OBR-8 finish time, OBR-13 control name, OBR-14 lot, OBR-20 result, OBR-21 unit.
export const isC560Hl7 = (text) => /(^|[\r\n\x0b])MSH\|/.test(String(text ?? "").slice(0, 2000));
export function c560Hl7ToTable(text, channelToCode = {}) {
  const msgs = String(text ?? "").replace(/\x1c\r?/g, "\r").replace(/\x0b/g, "\r").split(/\r\n|\r|\n/)
    .reduce((acc, line) => { if (line.startsWith("MSH|")) acc.push([line]); else if (line.trim() && acc.length) acc[acc.length - 1].push(line); return acc; }, []);
  const at = (s) => { const m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}` : ""; };
  const code = (ch, name) => channelToCode[String(ch || "").trim()] || String(name || "").trim().toUpperCase();
  const rows = [];
  let skipped = 0;
  msgs.forEach((segs) => {
    const f = (name) => segs.filter((x) => x.startsWith(name + "|")).map((x) => x.split("|").map((v) => v.trim()));
    const msh = f("MSH")[0] || [];
    if (!/^ORU/.test(msh[8] || "")) return;
    const kind = msh[15];
    const obr = f("OBR")[0] || [];
    if (kind === "2") {
      const v = obr[20];
      if (v === undefined || v === "" || v === "-268435545") { skipped++; return; }
      rows.push({ type: "C", sid: obr[13] || "", bc: obr[14] || "", chem: code(obr[2], obr[3]), r: v, u: obr[21] || "", fl: "", t: at(obr[8] || obr[6]), rerun: 0 });
      return;
    }
    if (kind && kind !== "0") return; // calibration results aren't imported
    f("OBX").forEach((x) => {
      const v = x[5];
      if (v === undefined || v === "" || v === "-268435545") { skipped++; return; }
      rows.push({ type: "R", sid: obr[3] || "", bc: obr[2] || "", chem: code(x[3], x[4]), r: v, u: x[6] || "", fl: x[8] && x[8] !== "N" ? x[8] : "", t: at(x[14] || obr[7]), rerun: x[17] === "1" ? 1 : 0 });
    });
  });
  // Oldest first, reruns after originals, so the latest result for a test is the one that stays.
  rows.sort((a, b) => (a.t || "").localeCompare(b.t || "") || a.rerun - b.rerun);
  const head = ["Type", "Sample ID", "Bar Code", "Chemistry", "Result", "Unit", "Flag", "Run Date"];
  return { text: [head, ...rows.map((x) => [x.type, x.sid, x.bc, x.chem, x.r, x.u, x.fl, x.t])].map((r) => r.map((c) => String(c).replace(/[\t\r\n]/g, " ")).join("\t")).join("\n"), rows: rows.length, skipped, messages: msgs.length };
}
