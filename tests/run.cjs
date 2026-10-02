// Runs every end-to-end suite against an in-memory stand-in for Supabase and compares each suite's output with the
// approved copy in tests/golden. Any difference fails the run so a person can look at it.
//   npm test                    run all suites
//   npm test -- 04_reports      run suites whose names contain "04_reports"
//   npm run test:update         accept the current output as the new approved copy (after reviewing the diff)
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const root = path.join(__dirname, ".."), dir = path.join(__dirname, "e2e"), gold = path.join(__dirname, "golden");
const update = process.argv.includes("--update"), only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function build() {
  const esbuild = require("esbuild");
  await esbuild.build({
    entryPoints: [path.join(root, "src/main.js")], bundle: true, format: "iife", outfile: path.join(__dirname, ".bundle.js"), logLevel: "warning",
    alias: { "@supabase/supabase-js": path.join(__dirname, "mock.js") }, loader: { ".css": "empty" },
    define: { "import.meta.env.VITE_SUPABASE_URL": '"https://abc.supabase.co"', "import.meta.env.VITE_SUPABASE_ANON_KEY": '"sb_publishable_testkey1234567890"' },
  });
}
// Remove what legitimately changes between runs: dates, times, generated IDs and sizes that depend on them.
const MON = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
function normalize(t) {
  return String(t).replace(/\r/g, "").replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((l) => l.trim() && !/Not implemented|^\s+at |^JSDOMERR/.test(l)).map((l) => l
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<ISO>")
    .replace(new RegExp(`${MON} \\d{1,2}, \\d{4}(, \\d{1,2}:\\d{2} [AP]M)?`, "g"), "<DATE>")
    .replace(new RegExp(`${MON} '?\\d{2}\\b`, "g"), "<MONTH>")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}(,? \d{1,2}:\d{2}(:\d{2})? ?[AP]M)?/g, "<DATE>")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})? ?[AP]M\b/g, "<TIME>").replace(/<DATE>, \d{1,2}(:\d{0,2})?/g, "<DATE>")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<YMD>").replace(/\b20\d{2}-(0[1-9]|1[0-2])\b/g, "<YM>")
    .replace(/FBG\d{6}(?=-|\b)/g, "FBG<YYMMDD>").replace(/\b(PU|SUP|BAT|MAN)-?\d{6}-[A-Z0-9]+\b/g, "$1-<ID>").replace(/\bINV-\d{4}-/g, "INV-<YYMM>-")
    .replace(/\b[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}\b/g, "<CODE>").replace(/\b(pk|pt|o|s|qr|ack|run|vendor|equipment|lot|sop|personnel|auto|uN|uP)(?=[a-z0-9]*\d)[a-z0-9]{6,}\b/g, "$1<ID>")
    .replace(/\b(application\/pdf) \d+/g, "$1 <BYTES>").replace(/\*(\d{6})\*(\d{4})\*/g, "*<YYMMDD>*<HHMM>*").replace(/\*\d{9}\*/g, "*<CTRL>*").replace(/\*\d{8}\*\d{4}\*\d+\*X\*/g, "*<YYYYMMDD>*<HHMM>*<G>*X*")
    .replace(/\b\d{14}\b/g, "<TS>").replace(/\b20\d{6}\b/g, "<YYYYMMDD>")
    .replace(/\s+$/, "")).join("\n") + "\n";
}
function failures(out, code) {
  const f = [];
  if (code !== 0) f.push(`exited with code ${code}`);
  for (const l of out.split("\n")) {
    const t = l.trim();
    if (/^([A-Z]\d*\s+)?errors:?(\s|$)/.test(t)) {
      const groups = t.match(/\[[^\]]*\]/g) || [];
      const open = (t.match(/\[/g) || []).length > groups.length;   // a long array printed over several lines
      if (open || groups.some((g) => g.replace(/[\[\]\s]/g, "").length)) f.push(t.slice(0, 200));
    }
    if (/^(TypeError|ReferenceError|SyntaxError|Error):/.test(l.trim())) f.push(l.trim().slice(0, 200));
  }
  return f;
}
function run(file) {
  return new Promise((res) => {
    // Hosting builders often set FORCE_COLOR, which wraps printed values in invisible color codes; turn it off.
    const p = spawn(process.execPath, [file], { cwd: __dirname, timeout: 300000, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => res({ out, code: code ?? 1 }));
  });
}
function diff(a, b) {
  const A = a.split("\n"), B = b.split("\n"), lines = [];
  for (let i = 0; i < Math.max(A.length, B.length) && lines.length < 12; i++) if (A[i] !== B[i]) lines.push(`  approved: ${A[i] ?? "(none)"}\n  now:      ${B[i] ?? "(none)"}`);
  return lines.join("\n");
}
(async () => {
  fs.mkdirSync(gold, { recursive: true });
  process.stdout.write("Building… "); await build(); console.log("done");
  const suites = fs.readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort().filter((f) => !only.length || only.some((o) => f.includes(o)));
  let bad = 0;
  for (const f of suites) {
    const t0 = Date.now(), { out, code } = await run(path.join(dir, f)), name = f.replace(/\.cjs$/, ""), norm = normalize(out), gfile = path.join(gold, name + ".txt");
    const fails = failures(out, code), secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (update) { if (!fails.length) fs.writeFileSync(gfile, norm); console.log(`${fails.length ? "FAIL" : "saved"}  ${name} (${secs}s)${fails.length ? "\n  " + fails.join("\n  ") : ""}`); bad += fails.length ? 1 : 0; continue; }
    const want = fs.existsSync(gfile) ? normalize(fs.readFileSync(gfile, "utf8")) : null;
    const changed = want !== null && want !== norm;
    if (fails.length || changed || want === null) {
      bad++; console.log(`FAIL  ${name} (${secs}s)`);
      fails.forEach((x) => console.log("  " + x));
      if (want === null) console.log("  no approved output yet: run npm run test:update");
      else if (changed) console.log(diff(want, norm));
      fs.mkdirSync(path.join(__dirname, ".out"), { recursive: true }); fs.writeFileSync(path.join(__dirname, ".out", name + ".txt"), norm);
    } else console.log(`pass  ${name} (${secs}s)`);
  }
  console.log(bad ? `\n${bad} suite${bad > 1 ? "s" : ""} failed` : `\nAll ${suites.length} suites passed`);
  process.exit(bad ? 1 : 0);
})();
