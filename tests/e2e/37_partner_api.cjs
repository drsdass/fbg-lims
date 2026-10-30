// The partner-api Edge Function: its PDF renderer must match send-alerts, and (when Deno is installed) its behaviour is
// checked against an in-memory database by tests/partner/partner_api.test.ts. Hosts without Deno skip the second part.
const path=require('path'),fs=require('fs'),{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const SRC=fs.readFileSync(path.join(ROOT,'supabase/functions/send-alerts/index.ts'),'utf8'),DST=fs.readFileSync(path.join(ROOT,'supabase/functions/partner-api/index.ts'),'utf8');
const tail=s=>s.slice(s.indexOf('\n',s.indexOf(s===SRC?'// ---------- PDF report ----------':'// ---------- PDF report (generated:'))+1);
if(tail(SRC)!==tail(DST)){console.log('errors ["partner-api PDF renderer is out of date: run node scripts/sync-partner-pdf.mjs"]');process.exit(1)}
const deno=[process.env.DENO_BIN,'deno'].filter(Boolean).find(b=>{try{return spawnSync(b,['--version']).status===0}catch(e){return false}});
if(!deno){console.log('SKIP: Deno is not installed here; the PDF renderer is in sync.');process.exit(0)}
const r=spawnSync(deno,['run','-A',path.join(__dirname,'..','partner','partner_api.test.ts')],{cwd:ROOT,encoding:'utf8',timeout:240000,env:{...process.env,NO_COLOR:'1'}});
process.stdout.write(r.stdout||'');if(r.status!==0){console.log('Error: '+(r.stderr||'').split('\n').slice(0,6).join(' | '));process.exit(1)}
