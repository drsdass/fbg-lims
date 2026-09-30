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
  const d = lines[hi].includes("\t") ? "\t" : ",";
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
