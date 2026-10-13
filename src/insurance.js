// Insurance plan-type screening: is a patient's plan one the lab can accept?
// The lab is out of network with every commercial payer, so it accepts plans that pay out of network (PPO, most POS,
// traditional Medicare) and AHCCCS, and turns away plans that only pay in network (HMO, EPO, Medicare Advantage HMO).
// Pure functions only, so the same code runs in the portal, the eligibility edge function and the tests.

export const PLAN_TYPES = {
  PPO: { label: "PPO", decision: "accept", why: "PPO plans pay out-of-network labs." },
  POS: { label: "POS", decision: "verify", why: "POS plans usually pay out of network, at a lower rate. Confirm with the payer." },
  HMO: { label: "HMO", decision: "decline", why: "HMO plans only pay in-network labs." },
  EPO: { label: "EPO", decision: "decline", why: "EPO plans only pay in-network labs." },
  MEDICARE: { label: "Medicare", decision: "accept", why: "Traditional Medicare: the lab is enrolled." },
  MA_HMO: { label: "Medicare Advantage HMO", decision: "decline", why: "Medicare Advantage HMO plans only pay in-network labs." },
  MA_PPO: { label: "Medicare Advantage PPO", decision: "verify", why: "Medicare Advantage PPO plans have out-of-network benefits. Confirm with the plan." },
  MA: { label: "Medicare Advantage", decision: "verify", why: "Medicare Advantage plan of unknown type (HMO or PPO). Check eligibility." },
  AHCCCS: { label: "AHCCCS", decision: "accept", why: "AHCCCS: the lab is enrolled. Confirm the member's health plan pays the lab." },
  MEDICAID: { label: "Medicaid (other state)", decision: "verify", why: "Out-of-state Medicaid: the lab is enrolled with AHCCCS only." },
  TRICARE_PRIME: { label: "TRICARE Prime", decision: "decline", why: "TRICARE Prime works like an HMO." },
  TRICARE: { label: "TRICARE Select", decision: "verify", why: "TRICARE Select allows non-network providers. Confirm with the payer." },
  INDEMNITY: { label: "Indemnity", decision: "accept", why: "Indemnity plans pay any provider." },
  UNKNOWN: { label: "Unknown", decision: "verify", why: "The plan type isn't shown. Check eligibility with the payer or ask the clinic." },
};
export const DECISIONS = { accept: "OK to accept", decline: "Out of network: decline", verify: "Verify" };

// AHCCCS health plans (Arizona Medicaid) and other names that identify a program.
const AHCCCS_RE = /\bAHCCCS\b|\bALTCS\b|mercy\s*care|banner\s*[-\s]?\s*university\s*family\s*care|\bBUFC\b|arizona\s*complete\s*health|care\s*1st|health\s*choice\s*arizona|molina\s*complete\s*care|community\s*plan.*arizona|arizona.*community\s*plan|\bDCS\s*CHP\b|comprehensive\s*health\s*plan|steward\s*health\s*choice/i;
// Medicare Beneficiary Identifier: 11 characters, e.g. 1EG4-TE5-MK73.
const MBI_RE = /\b[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d-?[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d-?[AC-HJKMNP-RT-Y]{2}\d{2}\b/;
const MA_CARRIER_RE = /humana|aetna|united\s*health|\bUHC\b|wellcare|devoted|alignment|cigna|blue\s*cross|\bBCBS\b|anthem|clover|scan\b|kaiser|centene|molina|elevance|zing|simply/i;

const has = (t, re) => re.test(t);

// Classify a plan from whatever text we have: the plan name the clinic typed, the payer name, OCR text from the card.
export function classifyPlan(...parts) {
  const raw = parts.filter(Boolean).join(" \n ");
  const t = raw.replace(/\s+/g, " ");
  if (!t.trim()) return result("UNKNOWN", "No insurance details.");
  const hmo = has(t, /\bHMO\b|health\s*maintenance|\bH\.M\.O\b/i), ppo = has(t, /\bPPO\b|preferred\s*provider|open\s*choice|choice\s*plus|\bPPO\s*blue|blue\s*card\s*ppo/i);
  const epo = has(t, /\bEPO\b|exclusive\s*provider/i), pos = has(t, /\bPOS\b|point[-\s]*of[-\s]*service/i);
  const medicare = has(t, /medicare/i), advantage = has(t, /medicare\s*advantage|\bMAPD\b|\bMA[-\s]?PD\b|dual\s*complete|\bD-?SNP\b|\bC-?SNP\b|special\s*needs\s*plan/i);
  // Medicare first: the red-white-blue card (or an MBI) without a private carrier is traditional Medicare.
  if (medicare || advantage) {
    const carrier = has(t, MA_CARRIER_RE);
    if (advantage || carrier || hmo || ppo) {
      if (hmo && !ppo) return result("MA_HMO", "Medicare plan marked HMO.");
      if (ppo && !hmo) return result("MA_PPO", "Medicare plan marked PPO.");
      return result("MA", carrier ? "Medicare plan from a private carrier." : "Medicare Advantage plan.");
    }
    if (has(t, /health\s*insurance|part\s*[ab]\b|hospital\s*\(part\s*a\)|medical\s*\(part\s*b\)/i) || MBI_RE.test(t) || /^\s*medicare\s*(part\s*b)?\s*$/i.test(raw.trim())) return result("MEDICARE", "Traditional Medicare card.");
    return result("MA", "Medicare named, but not clearly traditional Medicare.");
  }
  if (has(t, AHCCCS_RE)) return result("AHCCCS", "AHCCCS health plan.");
  if (has(t, /medicaid|medi-?cal|\bCHIP\b/i)) return result("MEDICAID", "Medicaid plan.");
  if (has(t, /tricare/i)) return has(t, /prime/i) ? result("TRICARE_PRIME", "TRICARE Prime.") : result("TRICARE", "TRICARE.");
  if (hmo && ppo) return result("UNKNOWN", "The card mentions both HMO and PPO.");
  if (hmo) return result("HMO", "Marked HMO.");
  if (epo) return result("EPO", "Marked EPO.");
  if (ppo) return result("PPO", "Marked PPO.");
  if (pos) return result("POS", "Marked POS.");
  if (has(t, /kaiser/i)) return result("HMO", "Kaiser Permanente plans are HMOs.");
  if (has(t, /\bnavigate\b|\bcompass\b|\bcharter\b/i)) return result("HMO", "UnitedHealthcare Navigate/Compass/Charter plans are in-network only.");
  if (has(t, /open\s*access\s*plus|\bOAP\b/i)) return result("POS", "Cigna Open Access Plus: some versions are in-network only. Confirm with Cigna.");
  if (has(t, /\bindemnity\b/i)) return result("INDEMNITY", "Indemnity plan.");
  return result("UNKNOWN", "No plan type on the card.");
}
function result(type, note) { const p = PLAN_TYPES[type]; return { type, label: p.label, decision: p.decision, why: p.why, note }; }

// Payers we recognize on cards, typed rows and spreadsheets (display name, pattern).
export const PAYERS = [
  ["UnitedHealthcare", /united\s*health\s*care|unitedhealthcare|\bUHC\b|united\s*healthcare|optum/i],
  ["Aetna", /aetna/i], ["Cigna", /cigna/i], ["Humana", /humana/i],
  ["Blue Cross Blue Shield of Arizona", /blue\s*cross.*arizona|\bBCBSAZ\b|azblue/i],
  ["Blue Cross Blue Shield", /blue\s*cross|blue\s*shield|\bBCBS\b|anthem|\bBlueCard\b/i],
  ["Ambetter", /ambetter/i], ["Oscar", /\boscar\b/i], ["Meritain Health", /meritain/i], ["UMR", /\bUMR\b/i],
  ["Mercy Care", /mercy\s*care/i], ["Banner University Family Care", /banner\s*[-\s]?\s*university\s*family\s*care|\bBUFC\b/i],
  ["Banner Medicare Advantage", /banner\s*medicare/i], ["Arizona Complete Health", /arizona\s*complete\s*health/i],
  ["Care1st", /care\s*1st/i], ["Molina", /molina/i], ["Health Net", /health\s*net/i], ["WellCare", /wellcare/i],
  ["Devoted Health", /devoted/i], ["Alignment Health", /alignment\s*health/i], ["Kaiser Permanente", /kaiser/i],
  ["TRICARE", /tricare/i], ["Medicare", /medicare/i], ["AHCCCS", /\bAHCCCS\b/i],
];
export const payerOf = (text) => { const t = String(text || ""); const p = PAYERS.find(([, re]) => re.test(t)); return p ? p[0] : ""; };

// Pull what we can from OCR text of an insurance card. Everything is a best guess the user can correct.
export function parseCard(text) {
  const t = String(text || "").replace(/\r/g, "");
  const flat = t.replace(/[|]/g, " ").replace(/[ \t]+/g, " ");
  const grab = (re) => { const m = flat.match(re); return m ? m[1].trim() : ""; };
  // A label alone on its line with the value on the next line (Medicare cards: "Medicare Number" / "1EG4-TE5-MK73").
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const below = (re) => { const i = lines.findIndex((l) => re.test(l)); return i >= 0 && lines[i + 1] ? lines[i + 1] : ""; };
  const mbi = (flat.match(MBI_RE) || [""])[0].replace(/-/g, "");
  let memberId = grab(/(?:member\s*(?:id|#|no\.?|number)|subscriber\s*(?:id|#)|identification\s*(?:no\.?|number|#)?|\bID\s*(?:no\.?|number|#)?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9-]{4,24})/i) || mbi;
  if (/^(number|no|card|group)$/i.test(memberId)) memberId = mbi;
  if (!memberId) memberId = (below(/^(medicare\s*number|member\s*(id|number|#)|id\s*(number|#)?|identification(\s*number)?)\s*:?$/i).match(/^[A-Z0-9][A-Z0-9-]{4,24}$/i) || [""])[0].replace(/-/g, "");
  const group = grab(/(?:group|grp)\s*(?:no\.?|number|#|id)?\s*[:#.]?\s*([A-Z0-9][A-Z0-9-]{2,15})/i);
  const dobRaw = grab(/(?:DOB|date\s*of\s*birth|birth\s*date)\s*[:#.]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const nameBelow = below(/^(name(\s*\/\s*nombre)?|member(\s*name)?|subscriber(\s*name)?|patient(\s*name)?)\s*:?$/i);
  let name = /^[A-Za-z][A-Za-z'.-]+(?:[ \t]+[A-Za-z][A-Za-z'.-]*){1,3}$/.test(nameBelow) ? nameBelow : "";
  if (!name) name = grab(/(?:(?:member|subscriber|patient|insured)\s*:|(?:member|subscriber|patient|insured)?\s*name\s*:?)\s*([A-Za-z][A-Za-z'.-]+(?:[ \t]+[A-Za-z]\.?)?(?:[ \t]+[A-Za-z][A-Za-z'.-]+){1,2})/i);
  if (/\b(ID|GROUP|GRP|NO|NUMBER|PLAN|DOB|BIRTH|MEMBER)\b/i.test(name)) name = "";
  name = name.replace(/\w\S*/g, (w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));
  const planLine = (t.split("\n").find((l) => /\b(HMO|PPO|EPO|POS)\b|preferred provider|health maintenance|exclusive provider|point of service|choice plus|open access|advantage|navigate/i.test(l)) || "").trim();
  const nm = splitName(name);
  return { payer: payerOf(flat), memberId: memberId.toUpperCase(), group: group.toUpperCase(), dob: normDob(dobRaw), first: nm.first, last: nm.last, plan: planLine.slice(0, 80) };
}
export function splitName(s) {
  const v = String(s || "").trim();
  if (!v) return { first: "", last: "" };
  if (v.includes(",")) { const [l, f] = v.split(","); return { first: (f || "").trim(), last: l.trim() }; }
  const p = v.split(/\s+/);
  return p.length === 1 ? { first: "", last: p[0] } : { first: p.slice(0, -1).join(" "), last: p[p.length - 1] };
}
// Dates as YYYY-MM-DD from 3/4/1980, 03-04-80, 1980-03-04 or an Excel date.
export function normDob(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + +s * 864e5); return d.toISOString().slice(0, 10); }
  return s;
}

// Spreadsheet or pasted table -> patient rows. Headers are matched loosely; without a header row, each line is
// treated as the text of one card.
const COLS = [
  ["dob", /\bdob\b|birth/i], ["first", /first|fname|given/i], ["last", /last|lname|surname|family/i],
  ["name", /^\s*(patient|member|subscriber|insured|full)?\s*'?s?\s*name\s*$|^\s*patient\s*$/i], ["group", /group|\bgrp\b/i],
  ["memberId", /member\s*(id|#|no|number)|policy|subscriber\s*(id|#|no)|\bid\b|id\s*#|insurance\s*(id|#|no)|\bmbi\b|medicare\s*(id|#|no)|member\s*$/i],
  ["plan", /plan\s*type|product|network|coverage\s*type|\bplan\b|\btype\b/i], ["payer", /payer|insurance|carrier|company|insurer|\bins\b/i],
];
export function mapHeader(h) {
  const map = {};
  h.forEach((cell, i) => { const c = String(cell || "").trim(); if (!c) return; const hit = COLS.find(([k, re]) => map[k] == null && re.test(c)); if (hit) map[hit[0]] = i; });
  return map;
}
export function rowsFromTable(h, rows) {
  const map = mapHeader(h);
  const known = Object.keys(map).length;
  if (known < 2) return [h, ...rows].map((r) => r.join(" ").trim()).filter(Boolean).map((text) => ({ ...parseCard(text), cardText: text }));
  return rows.map((r) => {
    const g = (k) => (map[k] == null ? "" : String(r[map[k]] ?? "").trim());
    const nm = map.first == null && map.last == null ? splitName(g("name")) : { first: g("first"), last: g("last") };
    return { first: nm.first, last: nm.last, dob: normDob(g("dob")), payer: g("payer"), memberId: g("memberId").toUpperCase(), group: g("group"), plan: g("plan"), cardText: "" };
  }).filter((x) => x.first || x.last || x.payer || x.memberId || x.plan);
}

// Real-time eligibility answers (Stedi JSON or X12-as-JSON) -> plan type.
const X12_TYPES = { HM: "HMO", HN: "MA_HMO", PR: "PPO", PS: "POS", EP: "EPO", IN: "INDEMNITY", MA: "MEDICARE", MB: "MEDICARE", MP: "MEDICARE", MC: "MEDICAID", CH: "TRICARE" };
export function typeFromEligibility(code, label) {
  const c = String(code || "").toUpperCase(), l = String(label || "").toUpperCase();
  if (c === "HN" || /MEDICARE[\s_-]*RISK|HMO[\s_-]*MEDICARE/.test(l)) return "MA_HMO";
  if (/HEALTH_MAINTENANCE|\bHMO\b|_HMO\b/.test(l)) return "HMO";
  if (/PREFERRED_PROVIDER|\bPPO\b|_PPO\b/.test(l)) return "PPO";
  if (/POINT_OF_SERVICE|\bPOS\b|_POS\b/.test(l)) return "POS";
  if (/EXCLUSIVE_PROVIDER|\bEPO\b|_EPO\b/.test(l)) return "EPO";
  if (/INDEMNITY/.test(l)) return "INDEMNITY";
  if (/MEDICAID/.test(l)) return "MEDICAID";
  if (/MEDICARE/.test(l)) return "MEDICARE";
  return X12_TYPES[c] || null;
}
// Summarize an eligibility response. Handles both Stedi response shapes.
export function readEligibility(resp) {
  const r = resp || {}, out = { active: null, types: [], planNames: [], payer: "", errors: [] };
  (r.errors || []).forEach((e) => out.errors.push(e.description || e.message || e.code || String(e)));
  (r.plans || []).forEach((p) => {
    if (p.name || p.planName) out.planNames.push(p.name || p.planName);
    const sts = (p.benefits && p.benefits.statuses) || p.statuses || [];
    sts.forEach((s) => { if (/ACTIVE/.test(String(s.status || "").toUpperCase())) out.active = true; else if (/INACTIVE/.test(String(s.status || "").toUpperCase()) && out.active == null) out.active = false; const t = typeFromEligibility(s.insuranceTypeCode, s.insuranceType); if (t) out.types.push(t); });
  });
  (r.planStatus || []).forEach((s) => { if (String(s.statusCode) === "1") out.active = true; else if (out.active == null && /inactive/i.test(s.status || "")) out.active = false; });
  (r.benefitsInformation || []).forEach((b) => {
    if (String(b.code) === "1") out.active = true; else if (String(b.code) === "6" && out.active == null) out.active = false;
    const t = typeFromEligibility(b.insuranceTypeCode, b.insuranceType); if (t) out.types.push(t);
    if (b.planCoverage) out.planNames.push(b.planCoverage);
  });
  const pi = r.planInformation || {};
  [pi.planDescription, pi.groupDescription, pi.planNetworkDescription].forEach((x) => x && out.planNames.push(x));
  if (r.payer) out.payer = r.payer.name || r.payer.displayName || "";
  const order = ["MA_HMO", "HMO", "EPO", "MA_PPO", "POS", "PPO", "MEDICAID", "MEDICARE", "INDEMNITY", "TRICARE"];
  const uniq = [...new Set(out.types)];
  // A Medicare type plus an HMO type is a Medicare Advantage HMO.
  if (uniq.includes("MEDICARE") && uniq.includes("HMO")) uniq.unshift("MA_HMO");
  if (uniq.includes("MEDICARE") && uniq.includes("PPO")) uniq.unshift("MA_PPO");
  out.type = order.find((t) => uniq.includes(t)) || null;
  out.planNames = [...new Set(out.planNames.filter(Boolean))].slice(0, 4);
  if (!out.type && out.planNames.length) { const c = classifyPlan(out.planNames.join(" ")); if (c.type !== "UNKNOWN") out.type = c.type; }
  return out;
}

// Summary counts for a list of checked rows.
export function summarize(rows) {
  const by = {}, dec = { accept: 0, decline: 0, verify: 0 };
  rows.forEach((r) => { const res = r.result || classifyPlan(); by[res.label] = (by[res.label] || 0) + 1; dec[res.decision]++; });
  return { total: rows.length, by, dec, pctAccept: rows.length ? Math.round((dec.accept / rows.length) * 100) : 0 };
}
