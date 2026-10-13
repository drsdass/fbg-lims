// Yumizen C560 host query (HL7 v2.3.1, HORIBA/Mindray host interface manual, chapter 1).
// The analyzer scans a tube, sends QRY^Q02 with the barcode, and the LIS answers QCK^Q02 followed by
// one DSR^Q03 per sample listing the tests to run by the analyzer's channel numbers.
// Pure functions only, so the same code runs in the edge function and in the test suite.

export type C560Test = { code: string; channel: string; analyte: string };
export type C560Settings = { tests?: C560Test[]; sampleType?: string; sampleIds?: "accession" | "blank" };
export type C560Sample = {
  barcode: string; sampleId: string; patientId: string; name: string; dob14: string; sex: string;
  collected14: string; received14: string; stat: boolean; sampleType: string; doctor: string; tests: string[];
};

const CR = "\r";
// HL7 delimiters can't appear inside values.
export const clean = (s: unknown) => String(s ?? "").replace(/[|^~\\&\r\n\x0b\x1c]/g, " ").replace(/\s+/g, " ").trim();

// yyyyMMddHHmmss in the lab's time zone (Arizona has no daylight saving).
export function ts14(ms: number | null | undefined, tz = "America/Phoenix"): string {
  if (!ms || !isFinite(ms)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}
// Analyzer time stamps (yyyyMMddHHmmss, lab local time) to epoch ms. Arizona is UTC-7 all year.
export function parse14(s: string, offsetHours = -7): number | null {
  const m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0) - offsetHours, +(m[5] || 0), +(m[6] || 0));
}

export const stripSuffix = (s: string) => String(s ?? "").trim().toUpperCase().replace(/[A-Z]\d{1,2}$/, "").replace(/-\d{1,2}$/, "");
// Barcodes we accept from the analyzer, and the forms to look up: as scanned, and without a tube suffix (50018191U1 -> 50018191).
export function barcodeKeys(raw: string): string[] {
  const b = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
  if (!b) return [];
  return [...new Set([b, stripSuffix(b)].filter(Boolean))];
}

// Compact tube barcodes (portal labels): "7" + 7-digit accession sequence + specimen letter + tube number, e.g. 70001009U1
// for FBG261005-1009. Old Dendi accessions are all digits and are used as they are.
export function tubeBase(accession: string): string {
  const a = String(accession || "").toUpperCase();
  if (/^\d{6,9}$/.test(a)) return a;
  const m = a.match(/-(\d+)$/);
  if (m && +m[1] < 1e7) return "7" + String(+m[1]).padStart(7, "0");
  return a.replace(/[^0-9A-Z]/g, "").slice(-8);
}
// For a compact tube code, the accession sequence it stands for (70001009 -> "1009"), else null.
export function seqFromTube(key: string): string | null {
  const m = String(key || "").match(/^7(\d{7})$/);
  return m ? String(+m[1]).padStart(4, "0") : null;
}
// The analyzer's Sample ID field takes up to 10 digits/uppercase letters.
export function sampleIdFor(accession: string, mode: C560Settings["sampleIds"] = "accession"): string {
  if (mode === "blank") return "";
  return (tubeBase(accession) + "U1").slice(0, 10);
}

// Turn an order (and its patient) into the sample the analyzer should run. Only urine drug screens that are in the lab
// and still have results outstanding are sent; tests already resulted are left off (add-on rule, manual 1.2.5).
// scanned: the barcode the analyzer queried with (the accession label, or a clinic's own vial label); it is echoed back
// so the analyzer matches the answer to the tube it scanned.
export function sampleFromOrder(o: any, p: any, set: C560Settings, scanned?: string): C560Sample | null {
  if (!o || !Array.isArray(o.tests) || !o.tests.includes("UDS")) return null;
  if (!["Received", "In Process"].includes(o.status)) return null;
  const done = (o.results && o.results.UDS) || {};
  const tests = (set.tests || []).filter((t) => t && String(t.channel || "").trim() && !(done[t.analyte] && done[t.analyte].v !== "" && done[t.analyte].v != null))
    .map((t) => String(t.channel).trim());
  if (!tests.length) return null;
  const rcv = (o.history || []).find((h: any) => h && h.s === "Received");
  const dob = String((p && p.dob) || "").replace(/[^0-9]/g, "");
  const sex = String((p && p.sex) || "").toUpperCase().slice(0, 1);
  return {
    barcode: clean(scanned) || String(o.accession), sampleId: sampleIdFor(o.accession, set.sampleIds), patientId: clean(p && p.mrn),
    name: clean(p ? `${p.last || ""}, ${p.first || ""}` : "").slice(0, 40), dob14: dob.length === 8 ? dob + "000000" : "",
    sex: ["M", "F"].includes(sex) ? sex : sex ? "O" : "", collected14: ts14(o.collectedAt), received14: ts14(rcv && rcv.at),
    stat: !!o.stat, sampleType: set.sampleType || "urine", doctor: "", tests,
  };
}

const msh = (type: string, ctrl: string, at: string, accept = "", resultType = "") =>
  `MSH|^~\\&|||||${at}||${type}|${ctrl}|P|2.3.1|||${accept}|${resultType}||ASCII|||`;

export function ackR01(ctrl: string, resultType: string, at: string) {
  return msh("ACK^R01", ctrl, at, "", resultType) + CR + `MSA|AA|${ctrl}|Message accepted|||0|` + CR;
}
export function qckQ02(ctrl: string, found: boolean, at: string) {
  return msh("QCK^Q02", ctrl, at) + CR + `MSA|AA|${ctrl}|Message accepted|||0|` + CR + "ERR|0|" + CR + `QAK|SR|${found ? "OK" : "NF"}|` + CR;
}
// One DSR^Q03 per sample. k is 1-based; the last sample in the group carries an empty DSC (manual examples, 1.3.2).
export function dsrQ03(s: C560Sample, ctrl: string, k: number, n: number, at: string, push = false) {
  const v: Record<number, string> = {
    1: s.patientId, 3: s.name, 4: s.dob14, 5: s.sex, 12: s.collected14, 21: clean(s.barcode).slice(0, 27), 22: s.sampleId,
    23: s.received14, 24: s.stat ? "Y" : "N", 26: s.sampleType, 27: clean(s.doctor).slice(0, 40),
  };
  const lines = [msh("DSR^Q03", ctrl, at, push ? "P" : ""), `MSA|AA|${ctrl}|Message accepted|||0|`, "ERR|0|", "QAK|SR|OK|",
    `QRD|${at}|R|D|2|||RD||OTH|||T|`, "QRF||||||RCT|COR|ALL||"];
  for (let i = 1; i <= 28; i++) lines.push(`DSP|${i}||${clean(v[i] ?? "")}|||`);
  s.tests.forEach((ch, j) => lines.push(`DSP|${29 + j}||${clean(ch)}^^^|||`));
  lines.push(k < n ? `DSC|${k}|` : "DSC||");
  return lines.join(CR) + CR;
}

// Parse a QRY^Q02 the bridge forwarded (fields already split by the bridge, or the raw message).
export function parseQuery(raw: string) {
  const segs = String(raw || "").replace(/\x0b|\x1c/g, "").split(/\r\n|\r|\n/);
  const seg = (name: string) => (segs.find((x) => x.startsWith(name + "|")) || "").split("|");
  const m = seg("MSH"), qrd = seg("QRD"), qrf = seg("QRF");
  return { ctrl: (m[9] || "").trim(), barcode: (qrd[8] || "").trim(), from: (qrf[2] || "").trim(), to: (qrf[3] || "").trim(), sampleFrom: (qrf[4] || "").trim(), sampleTo: (qrf[5] || "").trim() };
}

// Build the DSR messages answering a query, given the matching orders and their patients.
export function answer(ctrl: string, samples: C560Sample[], at: string) {
  const base = /^\d+$/.test(ctrl) ? +ctrl : null;
  return samples.map((s, i) => dsrQ03(s, base == null ? ctrl || String(i + 1) : String(base + i), i + 1, samples.length, at));
}
