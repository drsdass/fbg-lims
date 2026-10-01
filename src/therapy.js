// Therapy guide for molecular reports: which drug options to list next to each detected organism, by specimen site,
// and which drug classes each detected resistance gene takes off the list.
//
// THIS IS A DRAFT STARTING POINT, NOT CLINICAL GUIDANCE. Nothing here prints on a report until the laboratory
// director reviews it in Therapy guide, names the source (for example a licensed Sanford Guide subscription, IDSA
// guidelines or the local antibiogram) and approves it. Any later edit returns the guide to draft.

export const SITES = { urine: "Urine", wound: "Wound", nail: "Nail" };
export const SITE_OF = { WOUND: "wound", UTI: "urine", UTIABR: "urine", NAIL: "nail" };

const o = (drug, cls, sites, extra) => ({ drug, cls, sites, ...(extra || {}) });

export const THERAPY_SEED = {
  v: 1,
  source: "",
  groups: [
    { id: "staph", name: "Staphylococci", organisms: ["Staphylococcus aureus", "Staphylococcus saprophyticus"], options: [
      o("Cefazolin / cephalexin", "Cephalosporin", ["wound"]),
      o("Dicloxacillin", "Anti-staphylococcal penicillin", ["wound"]),
      o("Trimethoprim-sulfamethoxazole", "Folate antagonist", ["wound", "urine"]),
      o("Doxycycline", "Tetracycline", ["wound"]),
      o("Clindamycin", "Lincosamide", ["wound"]),
      o("Linezolid", "Oxazolidinone", ["wound"]),
      o("Vancomycin", "Glycopeptide", ["wound"]),
      o("Nitrofurantoin", "Nitrofuran", ["urine"]),
      o("Cephalexin", "Cephalosporin", ["urine"]),
    ] },
    { id: "strep", name: "Streptococci", organisms: ["Streptococcus pyogenes", "Streptococcus agalactiae"], options: [
      o("Penicillin / amoxicillin", "Penicillin", ["wound", "urine"]),
      o("Cephalexin", "Cephalosporin", ["wound", "urine"]),
      o("Clindamycin", "Lincosamide", ["wound"], { note: "Resistance is increasing; confirm with susceptibility testing." }),
    ] },
    { id: "entero", name: "Enterococci", organisms: ["Enterococcus faecalis", "Enterococcus faecium"], options: [
      o("Ampicillin / amoxicillin", "Penicillin", ["wound", "urine"], { exclude: ["Enterococcus faecium"] }),
      o("Nitrofurantoin", "Nitrofuran", ["urine"]),
      o("Fosfomycin", "Phosphonic acid", ["urine"]),
      o("Vancomycin", "Glycopeptide", ["wound"]),
      o("Linezolid", "Oxazolidinone", ["wound", "urine"]),
    ] },
    { id: "enterobact", name: "Enterobacterales", organisms: ["Escherichia coli", "Klebsiella pneumoniae", "Klebsiella oxytoca", "Proteus mirabilis", "Enterobacter cloacae", "Citrobacter freundii", "Morganella morganii"], options: [
      o("Nitrofurantoin", "Nitrofuran", ["urine"], { exclude: ["Proteus mirabilis", "Morganella morganii"] }),
      o("Fosfomycin", "Phosphonic acid", ["urine"]),
      o("Trimethoprim-sulfamethoxazole", "Folate antagonist", ["urine", "wound"]),
      o("Cephalexin", "Cephalosporin", ["urine"], { exclude: ["Enterobacter cloacae", "Citrobacter freundii", "Morganella morganii"] }),
      o("Amoxicillin-clavulanate", "Beta-lactam/beta-lactamase inhibitor", ["urine", "wound"], { exclude: ["Enterobacter cloacae", "Citrobacter freundii", "Morganella morganii"] }),
      o("Ceftriaxone", "Cephalosporin", ["wound"]),
      o("Ciprofloxacin / levofloxacin", "Fluoroquinolone", ["urine", "wound"]),
      o("Ertapenem", "Carbapenem", ["urine", "wound"]),
    ] },
    { id: "pseudo", name: "Pseudomonas", organisms: ["Pseudomonas aeruginosa"], options: [
      o("Piperacillin-tazobactam", "Beta-lactam/beta-lactamase inhibitor", ["wound", "urine"]),
      o("Cefepime", "Cephalosporin", ["wound", "urine"]),
      o("Ciprofloxacin / levofloxacin", "Fluoroquinolone", ["wound", "urine"]),
      o("Meropenem", "Carbapenem", ["wound", "urine"]),
      o("Tobramycin", "Aminoglycoside", ["wound", "urine"]),
    ] },
    { id: "acineto", name: "Acinetobacter", organisms: ["Acinetobacter baumannii"], options: [
      o("Ampicillin-sulbactam", "Beta-lactam/beta-lactamase inhibitor", ["wound"]),
      o("Meropenem", "Carbapenem", ["wound"]),
      o("Minocycline", "Tetracycline", ["wound"]),
    ] },
    { id: "anaerobe", name: "Anaerobes", organisms: ["Bacteroides fragilis", "Peptostreptococcus spp", "Clostridium perfringens"], options: [
      o("Metronidazole", "Nitroimidazole", ["wound"]),
      o("Amoxicillin-clavulanate", "Beta-lactam/beta-lactamase inhibitor", ["wound"]),
      o("Penicillin", "Penicillin", ["wound"], { exclude: ["Bacteroides fragilis"] }),
      o("Clindamycin", "Lincosamide", ["wound"], { exclude: ["Bacteroides fragilis"] }),
    ] },
    { id: "candida", name: "Candida", organisms: ["Candida albicans", "Candida parapsilosis"], options: [
      o("Fluconazole", "Azole antifungal", ["wound", "urine", "nail"]),
      o("Micafungin", "Echinocandin", ["wound"]),
      o("Itraconazole", "Azole antifungal", ["nail"]),
      o("Ciclopirox (topical)", "Hydroxypyridone antifungal", ["nail"]),
    ] },
    { id: "derm", name: "Dermatophytes", organisms: ["Trichophyton rubrum", "Trichophyton mentagrophytes/interdigitale", "Trichophyton tonsurans", "Epidermophyton floccosum", "Microsporum canis"], options: [
      o("Terbinafine (oral)", "Allylamine antifungal", ["nail"]),
      o("Itraconazole (oral)", "Azole antifungal", ["nail"]),
      o("Efinaconazole (topical)", "Azole antifungal", ["nail"]),
      o("Ciclopirox (topical)", "Hydroxypyridone antifungal", ["nail"]),
    ] },
    { id: "ndm", name: "Non-dermatophyte molds", organisms: ["Aspergillus spp", "Fusarium spp", "Scopulariopsis brevicaulis"], options: [
      o("Itraconazole (oral)", "Azole antifungal", ["nail"], { exclude: ["Fusarium spp"] }),
      o("Efinaconazole (topical)", "Azole antifungal", ["nail"]),
    ] },
  ],
  markers: [
    { name: "mecA (methicillin)", label: "mecA", strike: ["Anti-staphylococcal penicillin", "Penicillin", "Cephalosporin", "Beta-lactam/beta-lactamase inhibitor", "Carbapenem"], groups: ["staph"], note: "Methicillin resistance (MRSA pattern)." },
    { name: "vanA/vanB (vancomycin)", label: "vanA/vanB", strike: ["Glycopeptide"], groups: ["entero", "staph"], note: "Vancomycin resistance." },
    { name: "CTX-M (ESBL)", label: "CTX-M", strike: ["Penicillin", "Cephalosporin", "Beta-lactam/beta-lactamase inhibitor"], groups: ["enterobact"], note: "Extended-spectrum beta-lactamase." },
    { name: "TEM (ESBL)", label: "TEM", strike: ["Penicillin", "Cephalosporin"], groups: ["enterobact"], note: "TEM detection does not distinguish ESBL from non-ESBL variants." },
    { name: "SHV (ESBL)", label: "SHV", strike: ["Penicillin", "Cephalosporin"], groups: ["enterobact"], note: "SHV detection does not distinguish ESBL from non-ESBL variants." },
    { name: "KPC (carbapenemase)", label: "KPC", strike: ["Penicillin", "Cephalosporin", "Beta-lactam/beta-lactamase inhibitor", "Carbapenem"], groups: ["enterobact", "pseudo", "acineto"], note: "Carbapenemase." },
    { name: "NDM (carbapenemase)", label: "NDM", strike: ["Penicillin", "Cephalosporin", "Beta-lactam/beta-lactamase inhibitor", "Carbapenem"], groups: ["enterobact", "pseudo", "acineto"], note: "Metallo-beta-lactamase." },
    { name: "OXA-48 (carbapenemase)", label: "OXA-48", strike: ["Penicillin", "Beta-lactam/beta-lactamase inhibitor", "Carbapenem"], groups: ["enterobact"], note: "Carbapenemase." },
    { name: "VIM (carbapenemase)", label: "VIM", strike: ["Penicillin", "Cephalosporin", "Beta-lactam/beta-lactamase inhibitor", "Carbapenem"], groups: ["enterobact", "pseudo", "acineto"], note: "Metallo-beta-lactamase." },
    { name: "qnrA/qnrB (fluoroquinolone)", label: "qnr", strike: ["Fluoroquinolone"], groups: ["enterobact", "pseudo"], note: "Plasmid-mediated fluoroquinolone resistance." },
    { name: "sul1/dfrA (TMP-SMX)", label: "sul1/dfrA", strike: ["Folate antagonist"], groups: ["enterobact", "staph"], note: "Trimethoprim-sulfamethoxazole resistance." },
  ],
  approved: null,
};

// Short, stable fingerprint of everything clinical in the guide. Approval stores it; any edit changes it.
export function therapyHash(g) {
  const s = JSON.stringify({ source: g.source || "", groups: g.groups || [], markers: g.markers || [] });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
export const therapyApproved = (g) => !!(g && g.approved && g.approved.hash === therapyHash(g));

// For one molecular test's results: detected organisms with their drug options (struck where a detected resistance
// gene affects that class), the detected resistance genes, and how many targets were not detected.
export function therapyFor(g, code, results, isDetected) {
  const site = SITE_OF[code] || "wound";
  const names = Object.keys(results || {});
  const markerNames = new Set((g.markers || []).map((m) => m.name));
  const det = names.filter((n) => isDetected(results[n]));
  const genes = (g.markers || []).filter((m) => det.includes(m.name));
  const orgs = det.filter((n) => !markerNames.has(n)).map((name) => {
    const grp = (g.groups || []).find((x) => (x.organisms || []).includes(name));
    const options = !grp ? [] : (grp.options || [])
      .filter((op) => (op.sites || []).includes(site) && !(op.exclude || []).includes(name))
      .map((op) => {
        const hit = genes.filter((m) => (m.groups || []).includes(grp.id) && (m.strike || []).includes(op.cls));
        return { drug: op.drug, cls: op.cls, note: op.note || "", struck: hit.length > 0, why: hit.map((m) => m.label || m.name).join(", ") };
      });
    return { name, group: grp ? grp.name : "", options };
  });
  return { site, orgs, genes: genes.map((m) => ({ name: m.name, label: m.label || m.name, note: m.note || "" })), notDetected: names.length - det.length };
}
