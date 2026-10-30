// Copies the PDF report renderer from send-alerts into partner-api, so partners get the same report the clinic gets.
// Both functions are single files (they're pasted into the Supabase dashboard editor), so the code is copied, not imported.
// Run after changing the PDF code in send-alerts:  node scripts/sync-partner-pdf.mjs
import fs from "node:fs";
const SRC = "supabase/functions/send-alerts/index.ts", DST = "supabase/functions/partner-api/index.ts";
const START = "// ---------- PDF report ----------", MARK = "// ---------- PDF report (generated:";
export function synced() {
  const src = fs.readFileSync(SRC, "utf8"), dst = fs.readFileSync(DST, "utf8");
  const i = src.indexOf(START), j = dst.indexOf(MARK);
  if (i < 0 || j < 0) throw new Error("PDF markers not found");
  const head = dst.slice(0, dst.indexOf("\n", j) + 1);
  return head + src.slice(src.indexOf("\n", i) + 1);
}
if (process.argv[1] && process.argv[1].endsWith("sync-partner-pdf.mjs")) { fs.writeFileSync(DST, synced()); console.log("partner-api PDF renderer updated from send-alerts"); }
