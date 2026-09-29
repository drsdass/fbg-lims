import { DB, CONFIG_ERROR } from "./db.js";

const LOGO="/logo.png";

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=p=>p+crypto.randomUUID().replace(/-/g,"").slice(0,16);
const DAY=864e5;
const fmtD=d=>d?new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
const fmtDT=d=>d?new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"—";
const fmtDOB=d=>{if(!d)return"—";const[y,m,dd]=d.split("-");return `${m}/${dd}/${y}`};
const ageOf=dob=>{if(!dob)return"";const b=new Date(dob+"T00:00"),n=new Date();let a=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))a--;return a};
const localNow=()=>{const d=new Date(Date.now()-new Date().getTimezoneOffset()*6e4);return d.toISOString().slice(0,16)};
const initials=n=>String(n||"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("");

const ic=d=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I={
 home:ic('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
 users:ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
 plus:ic('<path d="M12 5v14M5 12h14"/>'),
 doc:ic('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
 bell:ic('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
 gear:ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
 flask:ic('<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7 15h10"/>'),
 building:ic('<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>'),
 list:ic('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
 send:ic('<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>'),
 search:ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
 moon:ic('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
 out:ic('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>'),
 check:ic('<path d="m5 12 5 5 9-10"/>'),
 print:ic('<path d="M7 9V3h10v6M7 17H4v-7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h-3"/><path d="M7 14h10v7H7z"/>'),
 alert:ic('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>'),
 info:ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'),
 pen:ic('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
 x:ic('<path d="M6 6l12 12M18 6 6 18"/>'),
 drop:ic('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'),
};
I.camera=ic('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>');
I.scan=ic('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>');
const tick=`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`;

/* ---------- catalog ---------- */
const Q=(name,opts,cutoff)=>({name,type:"qual",opts:opts||["Negative","Positive"],cutoff});
const N=(name,unit,lo,hi,crit,dp)=>({name,type:"quant",unit,lo,hi,crit,dp:dp??1});
const C=(name,unit,lo,hi,fn,dp,needs)=>({name,type:"calc",unit,lo,hi,fn,dp:dp??1,needs});
const NS=(name,unit,m,f,dp)=>({name,type:"quant",unit,lo:Math.min(m[0],f[0]),hi:Math.max(m[1],f[1]),sx:{M:m,F:f},dp});
const DET=["Not Detected","Detected"];
const UA5=["Negative","Trace","Small (1+)","Moderate (2+)","Large (3+)"];
const CATS=[
 {id:"tox",name:"Drug screen",note:"Presumptive immunoassay"},
 {id:"conf",name:"Drug confirmation",note:"Definitive LC-MS/MS"},
 {id:"mol",name:"Molecular pathology and urinalysis",note:"PCR panels and urinalysis"},
 {id:"blood",name:"Blood biomarkers",note:"104-biomarker directory"},
];
const gcode=n=>n<1?"—":n<=7?"G0480":n<=14?"G0481":n<=21?"G0482":"G0483";
const egfr=(g,p)=>{const s=g("Creatinine");if(!(s>0)||!["M","F"].includes(p.sex))return NaN;const f=p.sex==="F",k=f?.7:.9,al=f?-.241:-.302;return 142*Math.pow(Math.min(s/k,1),al)*Math.pow(Math.max(s/k,1),-1.2)*Math.pow(.9938,p.age)*(f?1.012:1)};
const ldlAny=g=>{const l=g("LDL Cholesterol");return isNaN(l)?(g("Triglycerides")<=400?g("Total Cholesterol")-g("HDL Cholesterol")-g("Triglycerides")/5:NaN):l};
const DEF={
 "Urine":[["Amphetamines",["Amphetamine","Methamphetamine","MDMA / Ecstasy","Methylphenidate"]],["Antidepressants, serotonergic",["Paroxetine"]],["Antidepressants, tricyclic",["Amitriptyline","Desipramine","Doxepin","Nortriptyline"]],["Barbiturates",["Butalbital","Phenobarbital"]],["Benzodiazepines",["Alprazolam","Clonazepam","Diazepam","Lorazepam","Temazepam"]],["Skeletal muscle relaxants and misc",["Carisoprodol","Cyclobenzaprine","Ketamine","Pregabalin","Cocaine / Benzoylecgonine","THC (Cannabinoids)","PCP (Phencyclidine)","Zolpidem"]],["Opiates and opioids",["Buprenorphine","Codeine","Fentanyl","Heroin / 6-AM","Hydrocodone","Hydromorphone","Meperidine","Methadone","Morphine","Naloxone","Oxycodone","Oxymorphone","Tapentadol","Tramadol"]]],
 "Oral fluid":[["Alcohol biomarkers",["ETG / ETS"]],["Anticonvulsants",["Gabapentin","Pregabalin"]],["Antipsychotics",["Aripiprazole","Olanzapine","Quetiapine","Risperidone"]],["Antidepressants, serotonergic / NOS",["Bupropion","Citalopram","Duloxetine","Fluoxetine","Paroxetine","Sertraline","Trazodone","Venlafaxine"]],["Antidepressants, tricyclic",["Amitriptyline","Desipramine","Doxepin","Imipramine","Nortriptyline"]],["Barbiturates",["Butalbital","Phenobarbital"]],["Benzodiazepines",["Alprazolam","Clonazepam","Diazepam","Lorazepam","Oxazepam","Temazepam"]],["Illicit panel",["6-Acetylmorphine / Heroin","Cocaine / Benzoylecgonine","MDA / MDMA (Ecstasy)","PCP (Phencyclidine)","THC (Cannabinoids)"]],["Muscle relaxants",["Carisoprodol","Cyclobenzaprine","Meprobamate"]],["Miscellaneous",["Mitragynine (Kratom)","Ketamine / Norketamine"]],["Opioid antagonists",["Naloxone","Naltrexone"]],["Opiates and opioids",["Buprenorphine","Codeine","Fentanyl","Hydrocodone","Hydromorphone","Meperidine","Methadone","Morphine","Oxycodone","Oxymorphone","Tapentadol","Tramadol"]],["Sedative-hypnotics",["Zolpidem"]],["Stimulants",["Amphetamine","Methamphetamine","Methylphenidate / Ritalinic acid","Phentermine"]]]
};
const SPECS=["Urine","Oral fluid"];
const defList=sp=>DEF[sp].flatMap(g=>g[1]);
const BILL_CLASS={"Amphetamine":"Amphetamines","Methamphetamine":"Amphetamines","MDMA / Ecstasy":"Methylenedioxyamphetamines","MDA / MDMA (Ecstasy)":"Methylenedioxyamphetamines","Methylphenidate":"Methylphenidate","Methylphenidate / Ritalinic acid":"Methylphenidate","Phentermine":"Phentermine","Paroxetine":"Antidepressants, serotonergic","Citalopram":"Antidepressants, serotonergic","Duloxetine":"Antidepressants, serotonergic","Fluoxetine":"Antidepressants, serotonergic","Sertraline":"Antidepressants, serotonergic","Venlafaxine":"Antidepressants, serotonergic","Bupropion":"Antidepressants, NOS","Trazodone":"Antidepressants, NOS","Amitriptyline":"Antidepressants, tricyclic","Desipramine":"Antidepressants, tricyclic","Doxepin":"Antidepressants, tricyclic","Imipramine":"Antidepressants, tricyclic","Nortriptyline":"Antidepressants, tricyclic","Butalbital":"Barbiturates","Phenobarbital":"Barbiturates","Alprazolam":"Benzodiazepines","Clonazepam":"Benzodiazepines","Diazepam":"Benzodiazepines","Lorazepam":"Benzodiazepines","Oxazepam":"Benzodiazepines","Temazepam":"Benzodiazepines","Carisoprodol":"Skeletal muscle relaxants","Cyclobenzaprine":"Skeletal muscle relaxants","Meprobamate":"Skeletal muscle relaxants","Ketamine":"Ketamine and norketamine","Ketamine / Norketamine":"Ketamine and norketamine","Pregabalin":"Pregabalin","Gabapentin":"Gabapentin","Cocaine / Benzoylecgonine":"Cocaine","THC (Cannabinoids)":"Cannabinoids, natural","PCP (Phencyclidine)":"Phencyclidine","Zolpidem":"Sedative-hypnotics","Buprenorphine":"Buprenorphine","Codeine":"Opiates","Morphine":"Opiates","Hydrocodone":"Opiates","Hydromorphone":"Opiates","Fentanyl":"Fentanyls","Heroin / 6-AM":"Heroin metabolite","6-Acetylmorphine / Heroin":"Heroin metabolite","Meperidine":"Meperidine","Methadone":"Methadone","Naloxone":"Opioid antagonists","Naltrexone":"Opioid antagonists","Oxycodone":"Oxycodone","Oxymorphone":"Oxycodone","Tapentadol":"Tapentadol","Tramadol":"Tramadol","ETG / ETS":"Alcohol biomarkers","Aripiprazole":"Antipsychotics","Olanzapine":"Antipsychotics","Quetiapine":"Antipsychotics","Risperidone":"Antipsychotics","Mitragynine (Kratom)":"Drugs, not otherwise specified"};
const classCount=list=>new Set((list||[]).map(n=>BILL_CLASS[n]||n)).size;
const PRESET={"Urine":["Amphetamine","Methamphetamine","Alprazolam","Clonazepam","Diazepam","Lorazepam","Temazepam","Buprenorphine","Codeine","Fentanyl","Heroin / 6-AM","Hydrocodone","Hydromorphone","Methadone","Morphine","Oxycodone","Oxymorphone","Tramadol","Cocaine / Benzoylecgonine","THC (Cannabinoids)","Carisoprodol"],"Oral fluid":["Amphetamine","Methamphetamine","Alprazolam","Clonazepam","Diazepam","Lorazepam","Buprenorphine","Codeine","Fentanyl","6-Acetylmorphine / Heroin","Hydrocodone","Hydromorphone","Methadone","Morphine","Oxycodone","Oxymorphone","Tramadol","Cocaine / Benzoylecgonine","THC (Cannabinoids)","Carisoprodol"]};
const SCREEN14=[["AMP","Amphetamines",500,["Amphetamine","Methamphetamine"]],["BAR","Barbiturates",200,["Butalbital","Phenobarbital"]],["BUP","Buprenorphine",10,["Buprenorphine"]],["BZO","Benzodiazepines",200,["Alprazolam","Clonazepam","Diazepam","Lorazepam","Temazepam"]],["COC","Cocaine",150,["Cocaine / Benzoylecgonine"]],["ETG","Ethyl glucuronide (EtG), screen only",500,[]],["MDMA","MDMA",500,["MDMA / Ecstasy"]],["MTD","Methadone",300,["Methadone"]],["OPI","Opiates",300,["Codeine","Morphine","Hydrocodone","Hydromorphone"]],["OXY","Oxycodone",100,["Oxycodone","Oxymorphone"]],["PCP","PCP",25,["PCP (Phencyclidine)"]],["FENT","Fentanyl",1,["Fentanyl"]],["THC","Cannabinoids (THC)",50,["THC (Cannabinoids)"]],["HEROIN","Heroin (6-MAM)",10,["Heroin / 6-AM"]]];
const SCREEN_LBL={none:"No lab screen",only:"14-panel screen only",reflex:"14-panel screen with definitive testing of positives"};
const BILLTYPES=["Medicare","Medicaid","Commercial insurance","Client bill","Self pay"];
const BILLFROM={"Medicare":"Medicare","Medicaid":"Medicaid","Commercial":"Commercial insurance","Self-pay":"Self pay"};
const isDef=c=>!!(T(c)&&T(c).dynamic);
const defCode=o=>o.tests.find(isDef);
const specOf=o=>o.tests.includes("CONFOF")?"Oral fluid":"Urine";
const COMPS={"Clonazepam":["Clonazepam","7-Aminoclonazepam"],"Alprazolam":["Alprazolam","alpha-Hydroxyalprazolam"],"Diazepam":["Diazepam","Nordiazepam"],"Buprenorphine":["Buprenorphine","Norbuprenorphine"],"Fentanyl":["Fentanyl","Norfentanyl"],"Methadone":["Methadone","EDDP"],"Oxycodone":["Oxycodone","Noroxycodone"],"Hydrocodone":["Hydrocodone","Norhydrocodone"],"Tramadol":["Tramadol","O-Desmethyltramadol"],"Zolpidem":["Zolpidem","Zolpidem phenyl-4-COOH"],"Meperidine":["Meperidine","Normeperidine"],"Carisoprodol":["Carisoprodol","Meprobamate"],"Cocaine / Benzoylecgonine":["Cocaine","Benzoylecgonine"],"Heroin / 6-AM":["6-MAM"],"6-Acetylmorphine / Heroin":["6-MAM"],"MDMA / Ecstasy":["MDMA","MDA"],"MDA / MDMA (Ecstasy)":["MDA","MDMA"],"Methylphenidate":["Methylphenidate","Ritalinic acid"],"Methylphenidate / Ritalinic acid":["Methylphenidate","Ritalinic acid"],"Ketamine":["Ketamine","Norketamine"],"Ketamine / Norketamine":["Ketamine","Norketamine"],"ETG / ETS":["EtG","EtS"],"Mitragynine (Kratom)":["Mitragynine"],"PCP (Phencyclidine)":["Phencyclidine"]};
const UCUT={"Amphetamine":100,"Methamphetamine":100,"MDMA":100,"MDA":100,"Methylphenidate":20,"Ritalinic acid":50,"Pregabalin":500,"Gabapentin":1000,"Benzoylecgonine":50,"Cocaine":50,"THC-COOH":15,"THC":10,"Phencyclidine":10,"Buprenorphine":5,"Norbuprenorphine":5,"Fentanyl":1,"Norfentanyl":1,"6-MAM":10,"Tramadol":100,"O-Desmethyltramadol":100,"Alprazolam":20,"alpha-Hydroxyalprazolam":20,"Clonazepam":20,"7-Aminoclonazepam":20,"Diazepam":20,"Nordiazepam":20,"Lorazepam":20,"Oxazepam":20,"Temazepam":20,"Zolpidem":10,"Zolpidem phenyl-4-COOH":10,"Butalbital":100,"Phenobarbital":100,"Carisoprodol":100,"Meprobamate":100,"Olanzapine":25,"Risperidone":10,"EtG":500,"EtS":100,"Mitragynine":10};
function defaultConfMap(){const m={};SPECS.forEach(sp=>{m[sp]={};defList(sp).forEach(an=>{let comps=COMPS[an]||[an];if(an==="THC (Cannabinoids)")comps=sp==="Urine"?["THC-COOH"]:["THC"];m[sp][an]=comps.map(c=>{const u=UCUT[c]??50;return{name:c,cutoff:sp==="Urine"?u:Math.max(.5,Math.round(u)/10)}})})});return m}
function syncTox(d){if(!d)return;const sp=d.toxSpec;if(sp){const ok=new Set(defList(sp));d.confirm=d.confirm.filter(x=>ok.has(x));d.meds=d.meds.filter(x=>ok.has(x))}else{d.confirm=[];d.meds=[]}
 if(sp!=="Urine"){d.screen="none";d.poct={}}
 d.tests=d.tests.filter(c=>!["UDS","CONF","CONFOF"].includes(c));if(sp==="Urine"&&d.screen!=="none")d.tests.unshift("UDS");if(sp&&d.confirm.length)d.tests.push(sp==="Urine"?"CONF":"CONFOF")}
const pocSummary=poct=>Object.entries(poct||{}).filter(([c,r])=>r.r||r.unexp||r.def).map(([c,r])=>`${c} ${r.r==="POS"?"positive":r.r==="NEG"?"negative":""}${r.unexp?" (unexpected)":""}${r.def?", definitive requested":""}`).join("; ");
function toxBlock(d){const sp=d.toxSpec;const pill=(k,v,l,on)=>`<span class="pill ${on?"on":""}" data-a="draftSet" data-k="${k}" data-val="${v}">${l}</span>`;
 let h=`<h2 style="margin:28px 0 6px">Toxicology</h2><p class="muted small" style="margin-bottom:12px">Follows the FBG toxicology requisition. Mark Rx for prescribed medications and Def for definitive tests.</p>
 <div class="radio-row">${pill("toxSpec","","No toxicology",!sp)}${pill("toxSpec","Urine","Urine",sp==="Urine")}${pill("toxSpec","Oral fluid","Oral fluid (saliva)",sp==="Oral fluid")}</div>`;
 if(!sp)return h;
 if(sp==="Urine")h+=`<div class="subbox"><b>Presumptive screen performed by FBG</b><div class="radio-row" style="margin-top:10px">${["none","only","reflex"].map(v=>pill("screen",v,SCREEN_LBL[v],d.screen===v)).join("")}</div></div>
 <div class="subbox"><div class="row between"><b>Provider POCT results</b><span class="xs muted">Optional. Checking Def adds that drug's definitive tests below.</span></div><div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Drug</th><th>Result</th><th>Unexpected</th><th>Def</th></tr></thead><tbody>${SCREEN14.map(([c,n,,map])=>{const r=d.poct[c]||{};return `<tr><td class="small"><b>${c}</b> <span class="muted">${esc(n)}</span></td><td><div class="radio-row">${["POS","NEG"].map(x=>`<span class="pill ${r.r===x?"on":""}" data-a="poctSet" data-c="${c}" data-val="${x}">${x==="POS"?"Pos":"Neg"}</span>`).join("")}</div></td><td><input type="checkbox" data-a="poctFlag" data-c="${c}" data-f="unexp" ${r.unexp?"checked":""} aria-label="${c} unexpected"></td><td>${map.length?`<input type="checkbox" data-a="poctFlag" data-c="${c}" data-f="def" ${r.def?"checked":""} aria-label="${c} definitive">`:`<span class="xs muted">Screen only</span>`}</td></tr>`}).join("")}</tbody></table></div></div>`;
 const n=d.confirm.length,cc=classCount(d.confirm);
 h+=`<div class="subbox"><div class="row between" style="margin-bottom:12px"><div><b>Definitive drug testing, ${sp.toLowerCase()}</b> <span class="small muted">${n} drug${n===1?"":"s"} in ${cc} billing class${cc===1?"":"es"}${n?`, bills as <span class="gcode">${gcode(cc)}</span>`:""}</span></div><div class="row"><button class="btn sm" data-a="confPreset" data-p="pain">Pain management set</button><button class="btn sm" data-a="confPreset" data-p="all">All</button><button class="btn sm ghost" data-a="confPreset" data-p="none">Clear</button></div></div>
 <div class="defgrid">${DEF[sp].map(([g,list])=>`<div><div class="defh">${esc(g)}</div><div class="defrow defhead"><span>Rx</span><span>Def</span><span></span></div>${list.map(an=>`<div class="defrow"><input type="checkbox" data-a="toggleArr" data-k="meds" data-val="${esc(an)}" ${d.meds.includes(an)?"checked":""} aria-label="${esc(an)} prescribed"><input type="checkbox" data-a="toggleArr" data-k="confirm" data-val="${esc(an)}" ${d.confirm.includes(an)?"checked":""} aria-label="${esc(an)} definitive"><span>${esc(an)}</span></div>`).join("")}</div>`).join("")}</div>
 <div class="field" style="margin-top:14px"><label>Medication names and doses</label><input class="input" data-b="draft.medsText" value="${esc(d.medsText)}" placeholder="e.g. Oxycodone 10 mg BID, Alprazolam 0.5 mg PRN"></div>
 <p class="xs muted" style="margin-top:8px">Medicare bills definitive testing by number of drug classes: G0480 (1–7), G0481 (8–14), G0482 (15–21), G0483 (22+). Order only what is medically necessary.</p></div>`;
 return h}
function billRow(d){if(!d.billType){const p=patientOf(d.patientId);d.billType=BILLFROM[p?.ins.type]||"Commercial insurance"}
 return `<div class="grid g2" style="margin-top:18px"><div class="field"><label class="req">Billing type</label><div class="radio-row">${BILLTYPES.map(b=>`<span class="pill ${d.billType===b?"on":""}" data-a="draftSet" data-k="billType" data-val="${b}">${b}</span>`).join("")}</div></div><div class="field"><label>Collector name</label><input class="input" data-b="draft.collector" value="${esc(d.collector)}"></div></div>
 <label class="check" style="margin-top:12px"><input type="checkbox" data-b="draft.recollect" ${d.recollect?"checked":""}>This is a recollected specimen</label>`}
function reflexCheck(o){if(!o.reflex||o.toxSpec!=="Urine")return[];const R=(o.results&&o.results.UDS)||{},add=[];
 SCREEN14.forEach(([c,n,,map])=>{if(R[n]&&R[n].v==="Positive")map.forEach(an=>{if(!o.confirm.includes(an)&&!add.includes(an))add.push(an)})});
 if(!add.length)return[];o.confirm.push(...add);if(!o.tests.includes("CONF"))o.tests.push("CONF");
 o.history.push({s:o.status,at:Date.now(),by:me()?me().name:"",note:`Reflex definitive testing added for positive screen: ${add.join(", ")}`});return add}
function toxReqSection(o){if(!o.toxSpec)return"";
 const poc=Object.entries(o.poct||{}).filter(([c,r])=>r.r||r.unexp||r.def);
 return `<div class="sect"><h3>Toxicology, ${esc(o.toxSpec)}</h3>
 ${o.toxSpec==="Urine"?`<p style="margin-top:6px"><b>Presumptive screen performed by FBG:</b> ${SCREEN_LBL[o.screen||"none"]}</p>`:""}
 ${poc.length?`<table><thead><tr><th>Provider POCT</th><th>Pos</th><th>Neg</th><th>Unexpected</th><th>Def</th></tr></thead><tbody>${poc.map(([c,r])=>`<tr><td>${c}</td><td>${r.r==="POS"?"X":""}</td><td>${r.r==="NEG"?"X":""}</td><td>${r.unexp?"X":""}</td><td>${r.def?"X":""}</td></tr>`).join("")}</tbody></table>`:""}
 ${o.confirm.length||o.meds.length?`<table><thead><tr><th>Drug</th><th>Rx</th><th>Def</th></tr></thead><tbody>${defList(o.toxSpec).filter(an=>o.confirm.includes(an)||o.meds.includes(an)).map(an=>`<tr><td>${esc(an)}</td><td>${o.meds.includes(an)?"X":""}</td><td>${o.confirm.includes(an)?"X":""}</td></tr>`).join("")}</tbody></table>`:""}
 ${o.medsText?`<p style="margin-top:6px">Medications: ${esc(o.medsText)}</p>`:""}</div>`}
const UTI_ORGS=["Escherichia coli","Klebsiella pneumoniae","Klebsiella oxytoca","Proteus mirabilis","Enterococcus faecalis","Enterococcus faecium","Pseudomonas aeruginosa","Staphylococcus saprophyticus","Enterobacter cloacae","Citrobacter freundii","Morganella morganii","Candida albicans"];
const TESTS=[
 {code:"UDS",cat:"tox",name:"Presumptive drug screen, 14-panel",specimen:"Urine",cpt:"80307",analytes:SCREEN14.map(([c,n,cut])=>Q(n,null,cut+" ng/mL"))},
 {code:"CONF",cat:"conf",name:"Definitive drug testing, urine (LC-MS/MS)",specimen:"Urine",cpt:"G0480–G0483",dynamic:true,spec:"Urine"},
 {code:"CONFOF",cat:"conf",name:"Definitive drug testing, oral fluid (LC-MS/MS)",specimen:"Oral fluid (saliva)",cpt:"G0480–G0483",dynamic:true,spec:"Oral fluid"},
 {code:"WOUND",cat:"mol",name:"Wound panel",specimen:"Sterile swab in transport vial",cpt:"87798, 87150",targets:true,analytes:["Staphylococcus aureus","Streptococcus pyogenes","Streptococcus agalactiae","Enterococcus faecalis","Pseudomonas aeruginosa","Escherichia coli","Klebsiella pneumoniae","Proteus mirabilis","Acinetobacter baumannii","Bacteroides fragilis","Peptostreptococcus spp","Clostridium perfringens","Candida albicans","mecA (methicillin)","vanA/vanB (vancomycin)","CTX-M (ESBL)","KPC (carbapenemase)"].map(n=>Q(n,DET))},
 {code:"UA",cat:"mol",name:"Urinalysis + microalbumin",specimen:"Urine, clean-catch, unpreserved sterile cup",cpt:"81003, 82043, 82570",analytes:[N("pH","",5,8,null,1),N("Specific gravity","",1.005,1.03,null,3),Q("Leukocytes",UA5),Q("Nitrite",["Negative","Positive"]),Q("Protein",["Negative","Trace","30 mg/dL (1+)","100 mg/dL (2+)","300 mg/dL (3+)"]),Q("Blood",UA5),Q("Glucose (urine)",["Negative","Trace","100 mg/dL","250 mg/dL","500 mg/dL","1000 mg/dL"]),Q("Ketones",UA5),Q("Bilirubin (urine)",["Negative","Small (1+)","Moderate (2+)","Large (3+)"]),N("Urobilinogen","mg/dL",.2,1,null,1),N("Microalbumin","mg/L",0,30,null,1),N("Creatinine (urine)","mg/dL",20,320,null,0),C("Albumin/creatinine ratio","mg/g",0,29.9,g=>g("Microalbumin")/g("Creatinine (urine)")*100,1,"microalbumin and urine creatinine")]},
 {code:"UTIABR",cat:"mol",name:"UTI panel with ABR",specimen:"Urine, preservative tube or sterile cup",cpt:"87798, 87150",targets:true,analytes:[...UTI_ORGS,"CTX-M (ESBL)","TEM (ESBL)","SHV (ESBL)","KPC (carbapenemase)","NDM (carbapenemase)","OXA-48 (carbapenemase)","VIM (carbapenemase)","qnrA/qnrB (fluoroquinolone)","vanA/vanB (vancomycin)","mecA (methicillin)","sul1/dfrA (TMP-SMX)"].map(n=>Q(n,DET))},
 {code:"UTI",cat:"mol",name:"UTI panel",specimen:"Urine, preservative tube or sterile cup",cpt:"87798, 87150",targets:true,analytes:[...UTI_ORGS,"CTX-M (ESBL)","KPC (carbapenemase)","vanA/vanB (vancomycin)","mecA (methicillin)"].map(n=>Q(n,DET))},
 {code:"NAIL",cat:"mol",name:"Nail fungal panel",specimen:"Nail clippings or scrapings in sterile cup",cpt:"87798",targets:true,analytes:["Trichophyton rubrum","Trichophyton mentagrophytes/interdigitale","Trichophyton tonsurans","Epidermophyton floccosum","Microsporum canis","Candida albicans","Candida parapsilosis","Aspergillus spp","Fusarium spp","Scopulariopsis brevicaulis"].map(n=>Q(n,DET))},
 {code:"CBC",cat:"blood",name:"Complete blood count with differential",specimen:"Whole blood, EDTA (lavender)",cpt:"85025",analytes:[N("WBC","x10³/µL",4,11,[1.5,30]),N("RBC","x10⁶/µL",4.2,5.9,null,2),NS("Hemoglobin","g/dL",[13.5,17.5],[12,15.5]),NS("Hematocrit","%",[41,53],[36,46]),N("MCV","fL",80,100),N("MCH","pg",27,33),N("MCHC","g/dL",32,36),N("RDW","%",11.5,14.5),N("Platelet Count","x10³/µL",150,450,[40,1000],0),N("MPV","fL",7.5,11.5),N("Immature Granulocytes","%",0,.5),N("Neutrophils %","%",40,75),N("Neutrophils Absolute","x10³/µL",1.8,7.7,null,2),N("Lymphocytes %","%",20,45),N("Lymphocytes Absolute","x10³/µL",1,4.8,null,2),N("Monocytes %","%",2,10),N("Monocytes Absolute","x10³/µL",.2,.9,null,2),N("Eosinophils %","%",0,6),N("Eosinophils Absolute","x10³/µL",0,.5,null,2),N("Basophils %","%",0,2),N("Basophils Absolute","x10³/µL",0,.2,null,2)]},
 {code:"CMP",cat:"blood",name:"Comprehensive metabolic panel",specimen:"Serum (SST)",cpt:"80053",fasting:true,analytes:[N("Sodium","mmol/L",135,145,[120,160],0),N("Potassium","mmol/L",3.5,5.1,[2.8,6.2]),N("Chloride","mmol/L",98,107,null,0),N("Carbon Dioxide (CO2)","mmol/L",22,29,null,0),N("Glucose","mg/dL",70,99,[50,400],0),N("BUN","mg/dL",7,20,null,0),NS("Creatinine","mg/dL",[.74,1.35],[.59,1.04],2),N("Calcium","mg/dL",8.5,10.5,[6.5,13]),N("Total Protein","g/dL",6,8.3),N("Albumin","g/dL",3.5,5),N("Total Bilirubin","mg/dL",.1,1.2),N("ALP","U/L",44,147,null,0),N("AST","U/L",10,40,null,0),N("ALT","U/L",7,56,null,0),C("eGFR","mL/min/1.73m²",60,null,egfr,0,"creatinine, age and sex"),C("BUN/Creatinine Ratio","",10,20,g=>g("BUN")/g("Creatinine"),1,"BUN and creatinine"),C("Globulin","g/dL",2,3.5,g=>g("Total Protein")-g("Albumin"),1,"total protein and albumin"),C("Albumin/Globulin Ratio","",1.1,2.5,g=>g("Albumin")/(g("Total Protein")-g("Albumin")),2,"total protein and albumin")]},
 {code:"LIPID",cat:"blood",name:"Lipids panel",specimen:"Serum (SST), fasting preferred",cpt:"80061",fasting:true,abn:true,fee:25,analytes:[N("Total Cholesterol","mg/dL",0,199,null,0),N("HDL Cholesterol","mg/dL",40,100,null,0),N("LDL Cholesterol","mg/dL",0,99,null,0),N("Triglycerides","mg/dL",0,149,null,0),C("Non-HDL Cholesterol","mg/dL",0,129,g=>g("Total Cholesterol")-g("HDL Cholesterol"),0,"total and HDL cholesterol"),C("VLDL (calculated)","mg/dL",5,40,g=>g("Triglycerides")<=400?g("Triglycerides")/5:NaN,0,"triglycerides of 400 or less"),C("LDL (calculated)","mg/dL",0,99,g=>g("Triglycerides")<=400?g("Total Cholesterol")-g("HDL Cholesterol")-g("Triglycerides")/5:NaN,0,"lipids with triglycerides of 400 or less"),C("Total Cholesterol / HDL Ratio","",0,5,g=>g("Total Cholesterol")/g("HDL Cholesterol"),1,"total and HDL cholesterol"),C("LDL / HDL Ratio","",0,3.5,g=>ldlAny(g)/g("HDL Cholesterol"),1,"LDL and HDL cholesterol"),C("Triglyceride / HDL Ratio","",0,3,g=>g("Triglycerides")/g("HDL Cholesterol"),1,"triglycerides and HDL cholesterol")]},
 {code:"IRON",cat:"blood",name:"Iron studies",specimen:"Serum (SST), morning draw preferred",cpt:"83540, 83550, 84466",analytes:[N("Iron","µg/dL",50,170,null,0),N("TIBC","µg/dL",250,450,null,0),N("Transferrin","mg/dL",200,360,null,0),C("Transferrin Saturation","%",20,50,g=>g("Iron")/g("TIBC")*100,0,"iron and TIBC")]},
 {code:"LIVER",cat:"blood",name:"Liver assessment",specimen:"Serum (SST)",cpt:"82248, 82977, 82239",needs:["CBC","CMP"],analytes:[N("Direct Bilirubin","mg/dL",0,.3),N("GGT","U/L",8,61,null,0),N("Total Bile Acids","µmol/L",0,10),C("FIB-4","",0,1.3,(g,p)=>p.age*g("AST")/(g("Platelet Count")*Math.sqrt(g("ALT"))),2,"AST, ALT, platelets and age (order CBC and CMP)"),C("APRI","",0,.5,g=>(g("AST")/40)/g("Platelet Count")*100,2,"AST and platelets (order CBC and CMP)")]},
 {code:"MINMET",cat:"blood",name:"Minerals and metabolic",specimen:"Serum (SST) and whole blood, EDTA (lavender)",cpt:"83735, 84100, 83036, 84550",needs:["CMP"],abn:true,fee:45,analytes:[N("Magnesium","mg/dL",1.7,2.4),N("Phosphorous","mg/dL",2.5,4.5),N("Hemoglobin A1C","%",4,5.6),NS("Uric Acid","mg/dL",[3.5,7.2],[2.6,6]),C("Corrected Calcium","mg/dL",8.5,10.5,g=>g("Calcium")+.8*(4-g("Albumin")),1,"calcium and albumin (order CMP)"),C("Est. Average Glucose (eAG)","mg/dL",68,114,g=>28.7*g("Hemoglobin A1C")-46.7,0,"hemoglobin A1C")]},
 {code:"MUSCLE",cat:"blood",name:"Muscle and cellular metabolism",specimen:"Serum (SST); lactate on sodium fluoride (gray), on ice",cpt:"82550, 83615, 83605, 83090",analytes:[N("Creatine Kinase (CK)","U/L",30,200,null,0),N("Lactate Dehydrogenase (LDH)","U/L",140,280,null,0),N("Lactate","mmol/L",.5,2.2,[-1,4]),N("Homocysteine","µmol/L",5,15)]},
 {code:"SEXH",cat:"blood",name:"Reproductive and sex hormones",specimen:"Serum (SST)",cpt:"82670, 84144, 84403, 84270, 82627",analytes:[NS("Estradiol","pg/mL",[10,40],[15,350],0),NS("Progesterone","ng/mL",[.1,.3],[.1,25]),NS("Total Testosterone","ng/dL",[264,916],[8,60],0),NS("SHBG","nmol/L",[10,57],[18,144],0),NS("DHEA-S","µg/dL",[80,560],[35,430],0)]},
 {code:"PITU",cat:"blood",name:"Pituitary hormones",specimen:"Serum (SST)",cpt:"83001, 83002, 84146",analytes:[NS("FSH","mIU/mL",[1.5,12.4],[3.5,12.5]),NS("LH","mIU/mL",[1.7,8.6],[2.4,12.6]),NS("Prolactin","ng/mL",[4,15.2],[4.8,23.3])]},
 {code:"THYROID",cat:"blood",name:"Thyroid assessment",specimen:"Serum (SST)",cpt:"84443, 84481, 84439, 84480, 84436, 86376, 86800",analytes:[N("TSH","µIU/mL",.4,4,null,2),N("Free T3","pg/mL",2.3,4.2),N("Free T4","ng/dL",.8,1.8,null,2),N("Total T3","ng/dL",80,200,null,0),N("Total T4","µg/dL",5,12),N("TPO Antibodies","IU/mL",0,34,null,0),N("Thyroglobulin Antibodies","IU/mL",0,4)]},
 {code:"MICRO",cat:"blood",name:"Metabolic and micronutrients",specimen:"Serum (SST), fasting",cpt:"83525, 84681, 82607, 82306, 82533, 82728, 82746",fasting:true,needs:["CMP","LIPID"],abn:true,fee:185,analytes:[N("Fasting Insulin","µIU/mL",2.6,24.9),N("C-Peptide","ng/mL",1.1,4.4),N("Vitamin B12","pg/mL",232,1245,null,0),N("Vitamin D (25-OH)","ng/mL",30,100,null,0),N("Cortisol","µg/dL",6.2,19.4),NS("Ferritin","ng/mL",[30,400],[13,150],0),N("Folate","ng/mL",3.4,40),C("HOMA-IR","",0,2.5,g=>g("Fasting Insulin")*g("Glucose")/405,2,"fasting insulin and glucose (order CMP)"),C("QUICKI","",.34,null,g=>1/(Math.log10(g("Fasting Insulin"))+Math.log10(g("Glucose"))),3,"fasting insulin and glucose (order CMP)"),C("TyG Index","",0,8.5,g=>Math.log(g("Triglycerides")*g("Glucose")/2),2,"triglycerides and glucose (order CMP and lipids)")]},
 {code:"TUMOR",cat:"blood",name:"Tumor markers",specimen:"Serum (SST)",cpt:"84153, 84154",abn:true,fee:60,analytes:[N("PSA (Total)","ng/mL",0,4,null,2),N("Free PSA","ng/mL",null,null,null,2),C("% Free PSA","%",25,null,g=>g("Free PSA")/g("PSA (Total)")*100,0,"total and free PSA")]},
 {code:"PTH",cat:"blood",name:"Bone and parathyroid",specimen:"Serum (SST) or EDTA plasma",cpt:"83970",analytes:[N("Intact PTH","pg/mL",15,65,null,0)]},
 {code:"LIPASE",cat:"blood",name:"Pancreatic",specimen:"Serum (SST)",cpt:"83690",analytes:[N("Lipase","U/L",13,60,null,0)]},
 {code:"INFLAM",cat:"blood",name:"Inflammation",specimen:"Serum (SST)",cpt:"86141",needs:["CBC","LIPID"],abn:true,fee:35,analytes:[N("hs-CRP","mg/L",0,3,null,2),C("NLR","",1,3,g=>g("Neutrophils Absolute")/g("Lymphocytes Absolute"),2,"CBC with differential"),C("PLR","",50,150,g=>g("Platelet Count")/g("Lymphocytes Absolute"),0,"CBC with differential"),C("MHR","",null,null,g=>g("Monocytes Absolute")/(g("HDL Cholesterol")/38.67),2,"CBC and HDL cholesterol"),C("SII","",null,null,g=>g("Platelet Count")*g("Neutrophils Absolute")/g("Lymphocytes Absolute"),0,"CBC with differential"),C("SIRI","",null,null,g=>g("Neutrophils Absolute")*g("Monocytes Absolute")/g("Lymphocytes Absolute"),2,"CBC with differential")]},
];
const T=code=>TESTS.find(t=>t.code===code);

const BIO_NUM={};(()=>{let n=0;TESTS.filter(t=>t.cat==="blood").forEach(t=>t.analytes.forEach(a=>BIO_NUM[a.name]=++n))})();
const ICD_QUICK=[["Z79.891","Long-term use of opiate analgesic"],["Z79.899","Other long-term drug therapy"],["F11.20","Opioid dependence, uncomplicated"],["G89.29","Other chronic pain"],["Z51.81","Therapeutic drug level monitoring"],["N39.0","UTI, site not specified"],["R30.0","Dysuria"],["L08.9","Local skin infection, unspecified"],["E11.621","Type 2 diabetes with foot ulcer"],["B35.1","Tinea unguium"],["E11.9","Type 2 diabetes w/o complications"],["R73.03","Prediabetes"],["E78.5","Hyperlipidemia, unspecified"],["E55.9","Vitamin D deficiency"],["E03.9","Hypothyroidism, unspecified"],["R53.83","Other fatigue"],["Z00.00","General adult exam"]];
function refRange(a,sex){const r=a.sx&&a.sx[sex]?a.sx[sex]:[a.lo??null,a.hi??null];return r[0]==null&&r[1]==null?null:r}
function rangeText(a,sex){const r=refRange(a,sex);if(!r)return"—";if(r[0]==null)return`≤ ${r[1]}`;if(r[1]==null)return`≥ ${r[0]}`;return`${r[0]}–${r[1]}`}
function calcVal(results,a,p){const g=n=>{for(const code in results){if(code==="_id")continue;const r=results[code]&&results[code][n];if(r&&!r.calc&&r.v!==""&&r.v!=null){const v=parseFloat(r.v);if(!isNaN(v))return v}}return NaN};
 const v=a.fn(g,{age:ageOf(p.dob),sex:p.sex});if(!isFinite(v))return null;const m=Math.pow(10,a.dp);return Math.round(v*m)/m}
function storeCalcs(o,p){o.tests.forEach(code=>{const t=T(code);analytesFor(o,t).forEach(a=>{if(a.type!=="calc")return;const v=calcVal(o.results,a,p);o.results[code]=o.results[code]||{};o.results[code][a.name]={v:v==null?"":String(v),calc:true}})})}
const analytesFor=(o,t)=>t.dynamic?(o.confirm||[]).map(c=>({name:c,type:"conf"})):t.analytes;

/* ---------- consent templates ---------- */
const TXT={
 patient:`<p>I voluntarily consent to the collection and testing of my specimen. I understand that I am responsible for all co-pays, deductibles, and amounts not covered by my insurance. I assign to First Bio Genetics all insurance payment(s) made for any laboratory services provided to me and direct same to represent me in any grievances or appeals process relating to the payment of these laboratory services. I consent to the release of any medical records necessary to process any insurance claim(s).</p>`,
 genetic:`<p><b>Purpose.</b> This test analyzes genes that affect how your body processes certain medications. Results may help your provider choose medications or doses.</p><p><b>Possible results.</b> Results describe predicted metabolizer status. They do not diagnose disease. Some findings may have implications for biological relatives.</p><p><b>Limitations.</b> Not all genetic variants are tested. A normal result does not guarantee a normal response to every medication.</p><p><b>Privacy.</b> Genetic results are protected health information. The federal Genetic Information Nondiscrimination Act (GINA) limits use of genetic information by health insurers and most employers. Your specimen will not be used for research without separate consent.</p><p><b>Your choice.</b> Genetic testing is voluntary. You may decline or ask questions before signing.</p>`,
 abnIntro:`Medicare does not pay for everything, even some care that you or your provider have good reason to think you need. We expect Medicare may not pay for the tests below, for example because of frequency limits or medical-necessity rules.`,
 abnOpts:{"1":"Option 1. I want the tests listed. I may be asked to pay now, but I also want Medicare billed for an official decision on payment. If Medicare doesn't pay, I am responsible, and I can appeal.","2":"Option 2. I want the tests listed, but do not bill Medicare. I am responsible for payment and cannot appeal.","3":"Option 3. I don't want the tests listed. I understand I am not responsible for payment and cannot appeal."},
 provider:`I certify that I am the treating provider, that the tests ordered are medically necessary for the diagnosis or treatment of this patient, and that results will be used in managing the patient's care. Documentation supporting medical necessity is maintained in the patient's medical record.`,
 agreement:`<p><b>Laboratory services agreement.</b> The practice agrees to submit orders only from licensed providers, to collect and ship specimens according to First Bio Genetics collection instructions, and to maintain documentation of medical necessity for every order.</p><p><b>Business Associate Agreement (HIPAA).</b> Each party will safeguard protected health information, use it only for treatment, payment and operations, report any breach without unreasonable delay, and require the same of its subcontractors.</p><p><b>Portal use.</b> Portal accounts are individual. Users will not share credentials and will notify First Bio Genetics when a user leaves the practice.</p>`,
};

/* ---------- storage ---------- */
const KEY="fbg-lims-v1";
let S;
function fakeSig(name){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90"><text x="14" y="60" font-family="Brush Script MT,Segoe Script,cursive" font-size="40" fill="#1c2638">${name}</text></svg>`;return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)}
function seed(){
 const now=Date.now();
 const s={v:3,seq:1040,session:null,theme:null,
  lab:{name:"First Bio Genetics",address:"1830 S. Alma School Rd Ste 134, Mesa, AZ 85210",phone:"(480) 847-1916",email:"info@firstbiogenetics.com",clia:"03D2287865",director:"Dr. Guihua Cao",directorCred:""},
  clinics:[],users:[],patients:[],orders:[],notes:[],outbox:[]};
 s.clinics=[
  {id:"c1",acct:"FBG-1001",name:"Pacific Coast Pain & Wellness",npi:"1427389015",taxId:"33-1234567",specialty:"Pain management",phone:"(949) 555-0142",fax:"(949) 555-0143",address:"2 Park Plaza, Suite 400",city:"Irvine",state:"CA",zip:"92614",contactName:"Maria Lopez",contactEmail:"clinic@pacificcoastpain.com",status:"active",createdAt:now-90*DAY,notify:{email:true,sms:true,fax:false,criticalPhone:"(949) 555-0144"},
   providers:[{id:"p1",name:"Daniel Reyes",cred:"MD",npi:"1639201847",email:"dreyes@pacificcoastpain.com",phone:"(949) 555-0150"},{id:"p2",name:"Priya Nair",cred:"NP",npi:"1790436218",email:"pnair@pacificcoastpain.com",phone:"(949) 555-0151"}],
   agreement:{signer:"Maria Lopez",title:"Practice manager",date:now-90*DAY,sig:fakeSig("Maria Lopez")}},
  {id:"c2",acct:"FBG-1002",name:"Harbor Family Medicine",npi:"1558302914",taxId:"95-7654321",specialty:"Family medicine",phone:"(562) 555-0110",fax:"(562) 555-0111",address:"410 Ocean Blvd",city:"Long Beach",state:"CA",zip:"90802",contactName:"Tom Alvarez",contactEmail:"admin@harborfm.com",status:"active",createdAt:now-60*DAY,notify:{email:true,sms:false,fax:true,criticalPhone:"(562) 555-0112"},
   providers:[{id:"p3",name:"Alan Chu",cred:"DO",npi:"1881726354",email:"achu@harborfm.com",phone:"(562) 555-0120"}],
   agreement:{signer:"Tom Alvarez",title:"Office manager",date:now-60*DAY,sig:fakeSig("Tom Alvarez")}},
  {id:"c3",acct:"FBG-1003",name:"Sierra Urgent Care",npi:"1316095572",taxId:"82-4455667",specialty:"Urgent care",phone:"(951) 555-0190",fax:"",address:"27500 Ynez Rd",city:"Temecula",state:"CA",zip:"92591",contactName:"Grace Kim",contactEmail:"ops@sierrauc.com",status:"pending",createdAt:now-1*DAY,notify:{email:true,sms:true,fax:false,criticalPhone:"(951) 555-0191"},
   providers:[{id:"p4",name:"Grace Kim",cred:"PA-C",npi:"1467280931",email:"gkim@sierrauc.com",phone:"(951) 555-0192"}],
   agreement:{signer:"Grace Kim",title:"Medical director",date:now-1*DAY,sig:fakeSig("Grace Kim")}},
 ];
 s.users=[
  {id:"u1",email:"lab@firstbiogenetics.com",pw:"demo",name:"Jordan Ellis",role:"lab"},
  {id:"u2",email:"clinic@pacificcoastpain.com",pw:"demo",name:"Maria Lopez",role:"clinic",clinicId:"c1"},
  {id:"u3",email:"admin@harborfm.com",pw:"demo",name:"Tom Alvarez",role:"clinic",clinicId:"c2"},
  {id:"u4",email:"ops@sierrauc.com",pw:"demo",name:"Grace Kim",role:"clinic",clinicId:"c3"},
 ];
 const P=[["c1","James","Whitaker","1958-03-14","M","Medicare","Medicare Part B","1EG4TE5MK72"],["c1","Linda","Castillo","1975-11-02","F","Commercial","Blue Shield of CA","XEH884120331"],["c1","Robert","Nguyen","1954-07-21","M","Medicare","Medicare Part B","3JK7PL2RT45"],["c1","Ashley","Morgan","1990-05-09","F","Medicaid","Medi-Cal","91827364A"],["c1","Kevin","Patel","1983-01-30","M","Commercial","Aetna","W284917336"],["c1","Susan","Hart","1962-09-17","F","Self-pay","",""],["c2","Michael","Brooks","1971-12-05","M","Commercial","Anthem","ANT55120987"],["c2","Elena","Ruiz","1988-08-22","F","Commercial","Cigna","U8820193"]];
 P.forEach((p,i)=>s.patients.push({id:"pt"+(i+1),clinicId:p[0],mrn:"FBP"+(10230+i),first:p[1],last:p[2],dob:p[3],sex:p[4],phone:"(949) 555-01"+(60+i),email:"",address:"",city:"",state:"CA",zip:"",ins:{type:p[5],payer:p[6],member:p[7],group:""},createdAt:now-(80-i*5)*DAY}));
 let seq=1001;
 const mk=(pt,prov,tests,o)=>{
  const p=s.patients.find(x=>x.id===pt),c=s.clinics.find(x=>x.id===p.clinicId),pr=c.providers.find(x=>x.id===prov);
  const t0=now-(o.days*DAY)-3*3600e3;
  const order={id:uid("o"),accession:acc(t0,seq++),clinicId:c.id,patientId:pt,providerId:prov,tests,confirm:o.confirm||[],meds:o.meds||[],medsText:"",icd:o.icd||[],toxSpec:tests.includes("CONFOF")?"Oral fluid":tests.some(x=>x==="UDS"||x==="CONF")?"Urine":"",screen:o.screen||(tests.includes("UDS")?"only":"none"),reflex:o.screen==="reflex",poct:o.poct||{},collector:c.contactName,recollect:false,billType:BILLFROM[p.ins.type],collectedAt:t0,createdAt:t0,stat:false,fasting:false,notes:"",
   consents:{patient:{method:"now",name:`${p.first} ${p.last}`,sig:fakeSig(`${p.first} ${p.last}`),at:t0},provider:{name:`${pr.name}, ${pr.cred}`,sig:fakeSig(pr.name),at:t0,attest:true}},
   status:"Ordered",history:[{s:"Ordered",at:t0,by:c.contactName}],results:{},readAt:null,releasedAt:null};
  if(tests.some(x=>T(x).genetic))order.consents.genetic={sig:fakeSig(`${p.first} ${p.last}`),at:t0,agree:true};
  const flow=["Received","In Process","Released"],stop=flow.indexOf(o.status);
  for(let i=0;i<=stop;i++){const at=t0+(i+1)*(i===2?30:8)*3600e3;order.history.push({s:flow[i],at,by:"Jordan Ellis"});order.status=flow[i];if(flow[i]==="Released")order.releasedAt=at}
  if(o.status==="Released"||o.status==="In Process"){fillDefaults(order,false,p.sex);(o.tweak||(()=>{}))(order.results)}
  if(o.status==="Released"){storeCalcs(order,p);computeFlags(order,p.sex);if(o.read)order.readAt=order.releasedAt+3600e3;
   s.notes.push({id:uid("n"),aud:c.id,orderId:order.id,title:"Results ready",body:`${order.accession} for ${p.first} ${p.last[0]}. is released.`,level:order.flags.crit?"crit":"ok",at:order.releasedAt,read:!!o.read});}
  s.orders.push(order);return order;};
 const set=(r,code,name,v,c)=>{r[code]=r[code]||{};r[code][name]={v,c}};
 mk("pt1","p1",["UDS","CONF"],{days:4,status:"Released",screen:"reflex",confirm:[...PRESET.Urine],meds:["Oxycodone","Oxymorphone","Alprazolam"],poct:{OXY:{r:"POS"},THC:{r:"POS",unexp:true,def:true}},icd:["Z79.891","G89.29"],tweak:r=>{set(r,"UDS","Oxycodone","Positive","620");set(r,"UDS","Cannabinoids (THC)","Positive","112");set(r,"CONF","Oxycodone","Positive","Oxycodone 1,240; Noroxycodone 610");set(r,"CONF","Oxymorphone","Positive","Oxymorphone 180");set(r,"CONF","THC (Cannabinoids)","Positive","THC-COOH 88")}});
 mk("pt4","p2",["CONFOF"],{days:0,status:"Received",confirm:[...PRESET["Oral fluid"]],meds:["Buprenorphine"],icd:["F11.20","Z79.899"]});
 mk("pt2","p1",["UDS"],{days:0,status:"Received",screen:"reflex",icd:["Z79.891"]});
 mk("pt2","p2",["UTIABR"],{days:6,status:"Released",read:true,icd:["N39.0","R30.0"],tweak:r=>{set(r,"UTIABR","Escherichia coli","Detected");set(r,"UTIABR","CTX-M (ESBL)","Detected")}});
 mk("pt3","p1",["CMP","LIPID","MINMET"],{days:2,status:"Released",icd:["E11.9","E78.5"],tweak:r=>{set(r,"CMP","Glucose","142");set(r,"MINMET","Hemoglobin A1C","7.2");set(r,"LIPID","LDL Cholesterol","131");set(r,"LIPID","Total Cholesterol","214");set(r,"LIPID","Triglycerides","188")}});
 mk("pt4","p2",["UA"],{days:1,status:"In Process",icd:["R30.0"]});
 mk("pt5","p1",["CBC","THYROID","SEXH"],{days:1,status:"Received",icd:["R53.83","E03.9"]});
 mk("pt6","p2",["NAIL"],{days:0,status:"Ordered",icd:["B35.1"]});
 mk("pt7","p3",["CBC","CMP","LIPID","LIVER","INFLAM"],{days:9,status:"Released",read:true,icd:["Z00.00","E78.5"],tweak:r=>{set(r,"CMP","AST","52");set(r,"CMP","ALT","61")}});
 mk("pt8","p3",["IRON","MICRO","CMP","LIPID"],{days:0,status:"Ordered",icd:["R53.83","E55.9"]});
 s.notes.push({id:uid("n"),aud:"lab",orderId:null,title:"New clinic registration",body:"Sierra Urgent Care submitted onboarding and is waiting for approval.",level:"info",at:now-DAY,read:false});
 s.seq=seq;
 return s;
}
function acc(t,n){const d=new Date(t);return `FBG${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(n).padStart(4,"0")}`}
function load(){try{const r=localStorage.getItem(KEY);if(r){const x=JSON.parse(r);if(x&&x.v===3){S=x;return}}}catch(e){}S=seed()}
function save(){if(me())DB.queueSave(S,isLab())}

/* ---------- results logic ---------- */
function fillDefaults(o,onlyEmpty,sex){
 o.results=o.results||{};
 o.tests.forEach(code=>{const t=T(code);o.results[code]=o.results[code]||{};
  analytesFor(o,t).forEach(a=>{if(a.type==="calc")return;const cur=o.results[code][a.name];if(onlyEmpty&&cur&&cur.v!==""&&cur.v!=null)return;
   if(a.type==="quant"){const r=refRange(a,sex);let v=1;if(r){v=r[0]==null?r[1]*.6:r[1]==null?r[0]*1.5:r[0]===0?r[1]*.6:(r[0]+r[1])/2}const m=Math.pow(10,a.dp??1);o.results[code][a.name]={v:String(Math.round(v*m)/m)}}
   else if(a.type==="conf")o.results[code][a.name]={v:"Negative",c:""};
   else o.results[code][a.name]={v:a.opts[0]};});});
}
function flagOf(a,r,sex){if(!r||r.v===""||r.v==null)return"";
 if(a.type==="quant"||a.type==="calc"){const v=parseFloat(r.v);if(isNaN(v))return"";if(a.crit&&(v<a.crit[0]||v>a.crit[1]))return"C";const rr=refRange(a,sex);if(!rr)return"";if(rr[0]!=null&&v<rr[0])return"L";if(rr[1]!=null&&v>rr[1])return"H";return""}
 if(a.type==="conf")return r.v==="Positive"?"A":"";
 return r.v!==a.opts[0]?"A":"";}
function consistency(o,cls,r){const pres=(o.meds||[]).includes(cls),pos=r&&r.v==="Positive";
 if(pos&&pres)return["Consistent","ok"];if(!pos&&!pres)return["Consistent","ok"];if(pos)return["Inconsistent, not reported","warn"];return["Inconsistent, reported but not detected","warn"]}
function computeFlags(o,sex){if(sex===undefined)sex=patientOf(o.patientId).sex;let ab=0,crit=0,inc=0;o.tests.forEach(code=>{const t=T(code);analytesFor(o,t).forEach(a=>{const r=(o.results[code]||{})[a.name];const f=flagOf(a,r,sex);if(f)ab++;if(f==="C")crit++;if(a.type==="conf"&&consistency(o,a.name,r)[1]==="warn")inc++})});o.flags={ab,crit,inc};return o.flags}

/* ---------- app state ---------- */
let route={v:"dash",p:{}};
let ui={pq:"",pins:"",rq:"",rstat:"",rcat:"",rfrom:"",rto:"",runread:false,qq:"",qstat:"active",qclinic:"",gq:""};
let lf={email:"",pw:""};
let reg=null,draft=null,ptForm=null,cs=null,provForm=null,labForm=null,rej=null;
let sigs={};
const roots={au:()=>AU,ui:()=>ui,lf:()=>lf,reg:()=>reg,draft:()=>draft,pt:()=>ptForm,cs:()=>cs,prov:()=>provForm,labf:()=>labForm,rej:()=>rej,res:()=>resEdit};
let resEdit=null;

const me=()=>S.users.find(u=>u.id===S.session);
const isLab=()=>me()?.role==="lab";
const clinicOf=id=>S.clinics.find(c=>c.id===id);
const patientOf=id=>S.patients.find(p=>p.id===id);
const provOf=(o)=>{const c=clinicOf(o.clinicId);return c?.providers.find(p=>p.id===o.providerId)};
const myClinic=()=>clinicOf(me()?.clinicId);
const scopeOrders=()=>isLab()?S.orders:S.orders.filter(o=>o.clinicId===me().clinicId);
const scopePatients=()=>isLab()?S.patients:S.patients.filter(p=>p.clinicId===me().clinicId);
const audience=()=>isLab()?"lab":me().clinicId;
const unread=()=>S.notes.filter(n=>n.aud===audience()&&!n.read).length;
const pname=p=>p?`${p.last}, ${p.first}`:"—";
const testNames=o=>o.tests.map(c=>T(c)?.name||c);

function go(v,p={}){if((v==="order"||v==="patient")&&p.id)DB.logView(v==="order"?"orders":"patients",p.id);route={v,p};if(v!=="order-new"&&v!=="entry")sigs={};window.scrollTo(0,0);render()}
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;$("#toast").appendChild(t);setTimeout(()=>t.remove(),2800)}
function pushNote(aud,orderId,title,body,level){S.notes.unshift({id:uid("n"),aud,orderId,title,body,level:level||"info",at:Date.now(),read:false})}
function applyTheme(){if(S.theme)document.documentElement.setAttribute("data-theme",S.theme);else document.documentElement.removeAttribute("data-theme")}

/* ---------- render ---------- */
function render(){
 const ae=document.activeElement,fb=ae&&ae.dataset?ae.dataset.b:null;let pos=null;try{pos=fb?ae.selectionStart:null}catch(e){}
 const app=$("#app");
 if(!me()){app.innerHTML=(AUTHV[route.v]||vLogin)()}
 else app.innerHTML=shell(page());
 after();
 if(openForm&&$("#modal-root").innerHTML){refreshing=true;formModal(openForm);refreshing=false}
 if(fb){const el=document.querySelector(`[data-b="${CSS.escape(fb)}"]`);if(el&&el!==document.activeElement){el.focus();try{if(pos!=null)el.setSelectionRange(pos,pos)}catch(e){}}}
}
function page(){
 const v=route.v,lab=isLab();
 const map=lab?{dash:vLabDash,queue:vQueue,order:vOrder,entry:vEntry,clinics:vClinics,menu:vMenu,instruments:vInstruments,billing:vBilling,"order-new":vOrderNew,audit:vAudit,outbox:vOutbox,labset:vLabSet,notes:vNotes,patient:vPatient}
             :{dash:vClinicDash,patients:vPatients,patient:vPatient,"order-new":vOrderNew,results:vResults,order:vOrder,notes:vNotes,menu:vMenu,settings:vSettings};
 return (map[v]||map.dash)();
}
function shell(content){
 const u=me(),lab=isLab(),c=lab?null:myClinic(),n=unread();
 const openQ=S.orders.filter(o=>["Ordered","Received","In Process"].includes(o.status)).length;
 const unreadRes=lab?0:S.orders.filter(o=>o.clinicId===u.clinicId&&o.status==="Released"&&!o.readAt).length;
 const items=lab?[["dash","Dashboard",I.home],["order-new","Enter requisition",I.plus],["queue","Accessioning",I.flask,openQ],["instruments","Instruments",I.chip,(pendingFor("UDS").length+pendingFor("CONF").length+pendingFor("CONFOF").length+refPending().length)||""],["billing","Billing",I.dollar,S.claims.filter(c=>claimStatus(c)==="Ready").length||""],["clinics","Clinics",I.building,S.clinics.filter(x=>x.status==="pending").length||""],["menu","Test menu",I.list],["outbox","Notification log",I.send],["audit","Audit log",I.list],["labset","Lab settings",I.gear]]
  :[["dash","Dashboard",I.home],["patients","Patients",I.users],["order-new","New order",I.plus],["results","Orders & results",I.doc,unreadRes||""],["notes","Notifications",I.bell,n||""],["menu","Test menu",I.list],["settings","Clinic settings",I.gear]];
 const act=v=>route.v===v||(v==="results"&&route.v==="order"&&!lab)||(v==="queue"&&["order","entry"].includes(route.v)&&lab)||(v==="patients"&&route.v==="patient");
 return `<div class="shell"><aside class="side">
  <div class="brand"><img src="${LOGO}" alt="First Bio Genetics"></div>
  <div class="portal-tag">${lab?"<b>Laboratory</b> workspace":`<b>${esc(c.name)}</b>`}</div>
  <nav class="nav" aria-label="Main">${items.map(([v,l,i,cnt])=>`<button class="${act(v)?"on":""}" data-a="go" data-v="${v}">${i}<span>${l}</span>${cnt?`<span class="cnt">${cnt}</span>`:""}</button>`).join("")}</nav>
  <div class="side-foot">You'll be signed out after 15 minutes of inactivity.</div>
 </aside><div class="main">
 <header class="top">
  <div class="search">${I.search}<input class="input" data-b="ui.gq" placeholder="${lab?"Search accession, patient or clinic":"Search patients or accession numbers"}" value="${esc(ui.gq)}" aria-label="Search"></div>
  <div class="me">
   <button class="icon-btn" data-a="theme" title="Switch light / dark" aria-label="Switch theme">${I.moon}</button>
   <button class="icon-btn" data-a="go" data-v="notes" title="Notifications" aria-label="Notifications">${I.bell}${n?`<span class="dotcount">${n}</span>`:""}</button>
   <div class="avatar">${initials(u.name)}</div>
   <div class="who"><b>${esc(u.name)}</b><span class="muted">${lab?"Lab staff":"Clinic user"}</span></div>
   <button class="icon-btn" data-a="logout" title="Sign out" aria-label="Sign out">${I.out}</button>
  </div></header>
 <main class="page">${ui.gq.trim()?vSearch():content}</main></div></div>`;
}

/* ---------- auth ---------- */
function vLogin(){return `<div class="auth"><div class="auth-l"><div class="auth-card">
 <div class="brand"><img src="${LOGO}" alt="First Bio Genetics"></div>
 <div><h1>Sign in</h1><p class="muted" style="margin-top:6px">Order tests, capture consents and view results for your patients.</p></div>
 <form id="loginForm" class="stack" style="gap:16px" autocomplete="on"><div class="field"><label for="le">Email</label><input id="le" name="email" class="input" type="email" autocomplete="username" data-b="lf.email" value="${esc(lf.email)}"></div>
 <div class="field"><label for="lp">Password</label><input id="lp" name="password" class="input" type="password" autocomplete="current-password" data-b="lf.pw" value="${esc(lf.pw)}" data-enter="login"></div>
 <button type="submit" class="btn primary block" data-a="login">Sign in</button></form>
 <button class="link" style="align-self:flex-start" data-a="forgotPw">Forgot password?</button>
 <div class="or">New to First Bio Genetics?</div>
 <button class="btn block" data-a="startReg">Register your clinic</button>
 </div></div>
 <div class="auth-r"><canvas id="molecule" aria-hidden="true"></canvas><div class="copy">
  <h2>Every specimen, from order to result.</h2>
  <p>One portal for toxicology, molecular and blood testing, with consents and signatures captured at the point of order.</p>
  <ul><li><span></span>Clinic onboarding with signed agreements</li><li><span></span>Orders with ICD-10, ABN and genetic consent</li><li><span></span>Result alerts to the ordering provider</li></ul>
 </div></div></div>`}

function newReg(){return {step:1,name:"",npi:"",taxId:"",specialty:"",phone:"",fax:"",address:"",city:"",state:"CA",zip:"",clia:"",
 providers:[{name:"",cred:"",npi:"",email:"",phone:""}],user:{name:"",email:"",pw:"",title:""},notify:{email:true,sms:false,fax:false,criticalPhone:""},agree:false,baa:false}}
function vRegister(){
 const r=reg,st=["Practice","Providers","Portal access","Agreements"];
 const inp=(k,l,o={})=>`<div class="field ${o.cls||""}"><label class="${o.req?"req":""}">${l}</label><input class="input" data-b="reg.${k}" value="${esc(k.split(".").reduce((a,x)=>a?.[x],r)??"")}" ${o.type?`type="${o.type}"`:""} ${o.ph?`placeholder="${o.ph}"`:""}>${o.hint?`<span class="hint">${o.hint}</span>`:""}</div>`;
 let body="";
 if(r.step===1)body=`<div class="grid g2">${inp("name","Practice name",{req:1,cls:"spanall"})}${inp("npi","Group NPI",{req:1,hint:"10 digits"})}${inp("taxId","Tax ID (EIN)",{req:1,ph:"XX-XXXXXXX"})}${inp("specialty","Specialty",{ph:"e.g. Pain management"})}${inp("clia","CLIA certificate (if any)",{hint:"Only if your practice holds a CLIA waiver"})}${inp("phone","Phone",{req:1})}${inp("fax","Fax")}${inp("address","Street address",{req:1,cls:"spanall"})}${inp("city","City",{req:1})}<div class="grid g2">${inp("state","State",{req:1})}${inp("zip","ZIP",{req:1})}</div></div>`;
 if(r.step===2)body=`<p class="muted" style="margin-bottom:16px">Add every provider who will order tests. Each needs an individual NPI.</p>${r.providers.map((p,i)=>`<div class="subbox" style="margin-top:${i?12:0}px"><div class="row between" style="margin-bottom:12px"><b>Provider ${i+1}</b>${r.providers.length>1?`<button class="link" data-a="regDelProv" data-i="${i}">Remove</button>`:""}</div><div class="grid g3">${inp(`providers.${i}.name`,"Full name",{req:1})}${inp(`providers.${i}.cred`,"Credentials",{ph:"MD, DO, NP, PA-C"})}${inp(`providers.${i}.npi`,"Individual NPI",{req:1})}${inp(`providers.${i}.email`,"Email for result alerts",{req:1,type:"email",cls:"span2"})}${inp(`providers.${i}.phone`,"Mobile for text alerts")}</div></div>`).join("")}<button class="btn sm" style="margin-top:14px" data-a="regAddProv">${I.plus} Add another provider</button>`;
 if(r.step===3)body=`<div class="grid g2">${inp("user.name","Your name",{req:1})}${inp("user.title","Title",{ph:"Practice manager"})}${inp("user.email","Login email",{req:1,type:"email"})}${inp("user.pw","Password",{req:1,type:"password",hint:"At least 8 characters"})}</div>
  <h3 style="margin:26px 0 6px">Result notifications</h3><p class="muted small" style="margin-bottom:12px">Alerts say results are ready and link to the portal. They never contain patient results.</p>
  <div class="stack" style="gap:10px"><label class="check"><input type="checkbox" data-b="reg.notify.email" ${r.notify.email?"checked":""}>Email the ordering provider</label><label class="check"><input type="checkbox" data-b="reg.notify.sms" ${r.notify.sms?"checked":""}>Text the ordering provider</label><label class="check"><input type="checkbox" data-b="reg.notify.fax" ${r.notify.fax?"checked":""}>Fax a copy of the report to the practice</label></div>
  <div class="grid g2" style="margin-top:16px">${inp("notify.criticalPhone","Phone for critical values",{req:1,hint:"The lab calls this number and documents read-back"})}</div>`;
 if(r.step===4)body=`<div class="consent"><div class="consent-h"><h3>Laboratory services agreement and BAA</h3></div><div class="consent-b"><div class="legal">${TXT.agreement}</div>
  <label class="check"><input type="checkbox" data-b="reg.agree" ${r.agree?"checked":""}>I agree to the laboratory services agreement on behalf of ${esc(r.name||"the practice")}.</label>
  <label class="check"><input type="checkbox" data-b="reg.baa" ${r.baa?"checked":""}>I agree to the Business Associate Agreement.</label>
  <div class="grid g2"><div class="field"><label>Signer</label><input class="input" value="${esc(r.user.name)}" disabled></div><div class="field"><label>Title</label><input class="input" value="${esc(r.user.title)}" disabled></div></div>
  ${sigPad("reg","Authorized signature")}</div></div>`;
 return `<div style="max-width:880px;margin:0 auto;padding:32px 20px">
  <div class="row between" style="margin-bottom:24px"><div class="brand" style="width:220px"><img src="${LOGO}" alt="First Bio Genetics"></div><button class="btn ghost" data-a="cancelReg">Back to sign in</button></div>
  <h1>Register your clinic</h1><p class="muted" style="margin:6px 0 22px">About five minutes. We review new clinics within one business day; you can start adding patients right away.</p>
  <div class="steps">${st.map((s,i)=>`<div class="stepi ${r.step===i+1?"on":r.step>i+1?"done":""}"><span class="n">${r.step>i+1?tick:i+1}</span>${s}</div>`).join("")}</div>
  <div class="panel"><div class="panel-b">${body}</div><div class="wiz-foot"><button class="btn" data-a="regBack" ${r.step===1?"disabled":""}>Back</button><button class="btn primary" data-a="regNext">${r.step===4?"Submit registration":"Continue"}</button></div></div></div>`;
}

/* ---------- signature pad ---------- */
function sigPad(k,label){return `<div class="sig"><div class="sig-h"><span>${esc(label)}</span><button class="link" data-a="sigClear" data-k="${k}">Clear</button></div><canvas class="sigc" data-k="${k}" aria-label="${esc(label)} pad"></canvas><div class="sig-line">${sigs[k]?"Signed":"Sign with your mouse, finger or stylus"}</div></div>`}
function initSigs(){document.querySelectorAll("canvas.sigc").forEach(cv=>{
 const k=cv.dataset.k,dpr=window.devicePixelRatio||1,w=cv.clientWidth||500,h=cv.clientHeight||150;cv.width=w*dpr;cv.height=h*dpr;
 const ctx=cv.getContext&&cv.getContext("2d");if(!ctx)return;ctx.scale(dpr,dpr);ctx.lineWidth=2.2;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#0e1726";
 if(sigs[k]){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,w,h);im.src=sigs[k]}
 let drawing=false,last=null;const pt=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
 cv.addEventListener("pointerdown",e=>{drawing=true;last=pt(e);cv.setPointerCapture(e.pointerId);ctx.beginPath();ctx.arc(last[0],last[1],1,0,7);ctx.fillStyle="#0e1726";ctx.fill()});
 cv.addEventListener("pointermove",e=>{if(!drawing)return;const p=pt(e);ctx.beginPath();ctx.moveTo(last[0],last[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();last=p});
 const end=()=>{if(!drawing)return;drawing=false;sigs[k]=cv.toDataURL("image/png");const l=cv.parentElement.querySelector(".sig-line");if(l)l.textContent="Signed"};
 cv.addEventListener("pointerup",end);cv.addEventListener("pointerleave",end);cv.addEventListener("pointercancel",end);
});}

/* ---------- shared pieces ---------- */
const badge=s=>`<span class="badge st-${String(s).replace(/\s/g,"").toLowerCase()}">${esc(s)}</span>`;
const JCOL=["#8e79c6","#6f88cf","#3f98d9","#1aa3df"];
function journey(o){
 if(o.status==="Rejected")return `<div class="banner danger">${I.alert}<div><b>Specimen rejected.</b> ${esc(o.rejectReason||"")}</div></div>`;
 const flow=["Ordered","Received","In Process","Released"],idx=flow.indexOf(o.status);
 return `<div class="journey">${flow.map((s,i)=>{const h=[...o.history].reverse().find(x=>x.s===s);const cls=i<idx?"done":i===idx?"now":"";
  return `${i?`<div class="jlink ${i<=idx?"done":""}" style="--c1:${JCOL[i-1]};--c2:${JCOL[i]}"></div>`:""}<div class="jstep ${cls}" style="--c:${JCOL[i]}"><div class="jnode"></div><div class="jlbl">${s==="In Process"?"Testing":s}</div><div class="jtime">${h?fmtDT(h.at):""}</div></div>`}).join("")}</div>`}
function flagSummary(o){if(o.status!=="Released"||!o.flags)return `<span class="faint">—</span>`;const f=o.flags;if(!f.ab&&!f.inc)return `<span class="muted small">Normal</span>`;
 return `${f.crit?`<span class="flag C">${f.crit} critical</span> `:""}${f.ab-f.crit>0?`<span class="flag A">${f.ab-f.crit} abnormal</span> `:""}${f.inc?`<span class="flag A">${f.inc} inconsistent</span>`:""}`}
function ordersTable(list,opts={}){
 if(!list.length)return `<div class="empty"><h3>${opts.emptyTitle||"No orders yet"}</h3><p>${opts.emptyText||""}</p></div>`;
 const lab=isLab();
 return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Accession</th><th>Patient</th>${lab?"<th>Clinic</th>":""}<th>Tests</th><th>Collected</th><th>Status</th><th>Findings</th></tr></thead><tbody>
 ${list.map(o=>{const p=patientOf(o.patientId);const un=!lab&&o.status==="Released"&&!o.readAt;return `<tr class="click" data-a="openOrder" data-id="${o.id}"><td>${un?'<span class="unread-dot" title="New result"></span>':""}<span class="acc">${o.accession}</span>${o.stat?' <span class="flag C">STAT</span>':""}</td><td><div class="nm">${esc(pname(p))}</div><div class="xs muted">DOB ${fmtDOB(p?.dob)}</div></td>${lab?`<td class="small">${esc(clinicOf(o.clinicId)?.name)}</td>`:""}<td class="small">${o.tests.map(c=>`<span class="tag">${isDef(c)?`Def ×${o.confirm.length}`:c}</span>`).join("")}</td><td class="small">${fmtD(o.collectedAt)}</td><td>${badge(o.status)}</td><td class="small">${flagSummary(o)}</td></tr>`}).join("")}</tbody></table></div>`}

function vSearch(){
 const q=ui.gq.trim().toLowerCase();
 const pts=scopePatients().filter(p=>`${p.first} ${p.last} ${p.last}, ${p.first} ${p.mrn} ${p.dob}`.toLowerCase().includes(q)).slice(0,10);
 const ords=scopeOrders().filter(o=>{const p=patientOf(o.patientId);return `${o.accession} ${p?.first} ${p?.last} ${clinicOf(o.clinicId)?.name}`.toLowerCase().includes(q)}).slice(0,12);
 return `<div class="page-h"><div><h1>Search results</h1><p class="muted">Matches for “${esc(ui.gq)}”</p></div><button class="btn" data-a="clearSearch">Clear search</button></div>
 <div class="stack"><div class="panel"><div class="panel-h"><h2>Patients</h2></div>${pts.length?`<div class="tbl-wrap"><table class="tbl"><tbody>${pts.map(p=>`<tr class="click" data-a="openPatient" data-id="${p.id}"><td class="nm">${esc(pname(p))}</td><td class="small">DOB ${fmtDOB(p.dob)}</td><td class="small">${p.mrn}</td>${isLab()?`<td class="small">${esc(clinicOf(p.clinicId)?.name)}</td>`:""}</tr>`).join("")}</tbody></table></div>`:`<div class="empty">No patients match.</div>`}</div>
 <div class="panel"><div class="panel-h"><h2>Orders</h2></div>${ordersTable(ords,{emptyTitle:"No orders match"})}</div></div>`}

/* ---------- clinic pages ---------- */
function vClinicDash(){
 const c=myClinic(),os=scopeOrders();
 const open=os.filter(o=>["Ordered","Received","In Process"].includes(o.status)).length;
 const newRes=os.filter(o=>o.status==="Released"&&!o.readAt).length;
 const month=os.filter(o=>o.createdAt>Date.now()-30*DAY).length;
 const recent=[...os].sort((a,b)=>(b.releasedAt||b.createdAt)-(a.releasedAt||a.createdAt)).slice(0,7);
 return `<div class="page-h"><div><h1>Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${esc(me().name.split(" ")[0])}</h1><p class="muted">${esc(c.name)}</p></div><div class="row"><button class="btn" data-a="newPatient">${I.plus} Add patient</button><button class="btn primary" data-a="go" data-v="order-new">${I.plus} New order</button></div></div>
 <div class="stack">
 ${c.status==="pending"?`<div class="banner warn">${I.info}<div><b>Your clinic is under review.</b> You can add patients and place orders now. The lab will begin processing specimens once your account is approved, usually within one business day.</div></div>`:""}
 <div class="stats"><button class="stat" data-a="goResults" data-f="unread"><div class="v">${newRes}</div><div class="k">New results to review</div></button><button class="stat" data-a="goResults" data-f="open"><div class="v">${open}</div><div class="k">Orders in progress</div></button><div class="stat"><div class="v">${month}</div><div class="k">Orders, last 30 days</div></div><button class="stat" data-a="go" data-v="patients"><div class="v">${scopePatients().length}</div><div class="k">Patients</div></button></div>
 <div class="panel"><div class="panel-h"><h2>Recent activity</h2><button class="link" data-a="go" data-v="results">View all orders</button></div>${ordersTable(recent,{emptyTitle:"No orders yet",emptyText:"Place your first order to see it here."})}</div></div>`}

function vPatients(){
 let list=scopePatients();const q=ui.pq.trim().toLowerCase();
 if(q)list=list.filter(p=>`${p.first} ${p.last} ${p.mrn} ${fmtDOB(p.dob)} ${p.ins.member}`.toLowerCase().includes(q));
 if(ui.pins)list=list.filter(p=>p.ins.type===ui.pins);
 list=[...list].sort((a,b)=>a.last.localeCompare(b.last));
 return `<div class="page-h"><div><h1>Patients</h1><p class="muted">${scopePatients().length} patients</p></div><button class="btn primary" data-a="newPatient">${I.plus} Add patient</button></div>
 <div class="panel"><div class="panel-h"><div class="row" style="flex:1"><div class="search" style="max-width:340px">${I.search}<input class="input" data-b="ui.pq" data-live="1" placeholder="Name, DOB, MRN or member ID" value="${esc(ui.pq)}"></div>
 <select class="input" style="width:auto" data-b="ui.pins" data-live="1"><option value="">All coverage</option>${["Medicare","Medicaid","Commercial","Self-pay"].map(x=>`<option ${ui.pins===x?"selected":""}>${x}</option>`).join("")}</select></div></div>
 ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Patient</th><th>DOB</th><th>Sex</th><th>MRN</th><th>Coverage</th><th>Orders</th><th>Last order</th></tr></thead><tbody>${list.map(p=>{const os=S.orders.filter(o=>o.patientId===p.id);const last=os.sort((a,b)=>b.createdAt-a.createdAt)[0];return `<tr class="click" data-a="openPatient" data-id="${p.id}"><td class="nm">${esc(pname(p))}</td><td class="small">${fmtDOB(p.dob)} <span class="faint">(${ageOf(p.dob)})</span></td><td class="small">${p.sex}</td><td class="small">${p.mrn}</td><td class="small">${esc(p.ins.type)}${p.ins.payer?` <span class="faint">${esc(p.ins.payer)}</span>`:""}</td><td class="small">${os.length}</td><td class="small">${last?fmtD(last.createdAt):"—"}</td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty"><h3>No patients found</h3><p>Try a different name or date of birth, or add a new patient.</p></div>`}</div>`}

function vPatient(){
 const p=patientOf(route.p.id);if(!p)return `<div class="empty">Patient not found.</div>`;
 const os=S.orders.filter(o=>o.patientId===p.id).sort((a,b)=>b.createdAt-a.createdAt);
 const f=(k,v)=>`<div><div class="xs muted">${k}</div><div style="font-weight:500;color:var(--ink)">${esc(v||"—")}</div></div>`;
 return `<div class="crumb"><button data-a="go" data-v="${isLab()?"queue":"patients"}">${isLab()?"Accessioning":"Patients"}</button> / ${esc(pname(p))}</div>
 <div class="page-h"><div><h1>${esc(p.first)} ${esc(p.last)}</h1><p class="muted">${p.mrn} · DOB ${fmtDOB(p.dob)} · ${ageOf(p.dob)} yrs · ${p.sex==="M"?"Male":p.sex==="F"?"Female":"Other"}</p></div>
 <div class="row">${isLab()?`<button class="btn ghost" data-a="auditFor" data-q="${esc(p.mrn)}">Access history</button>`:""}<button class="btn" data-a="editPatient" data-id="${p.id}">${I.pen} Edit</button><button class="btn primary" data-a="orderFor" data-id="${p.id}">${I.plus} ${isLab()?"Enter requisition":"New order"}</button></div></div>
 <div class="stack"><div class="panel"><div class="panel-h"><h2>Demographics and coverage</h2></div><div class="panel-b grid g4">${f("Phone",p.phone)}${f("Email",p.email)}${f("Address",[p.address,p.city,p.state,p.zip].filter(Boolean).join(", "))}${f("Clinic",clinicOf(p.clinicId)?.name)}${f("Coverage",p.ins.type)}${f("Payer",p.ins.payer)}${f("Member ID",p.ins.member)}${f("Group",p.ins.group)}${p.ins.subscriber?f("Subscriber",p.ins.subscriber):""}${p.ins.cardFront||p.ins.cardBack?`<div class="spanall"><div class="xs muted" style="margin-bottom:6px">Insurance card</div><div class="cardthumbs">${["cardFront","cardBack"].filter(k=>p.ins[k]).map(k=>`<img src="${p.ins[k]}" alt="Insurance card ${k==="cardFront"?"front":"back"}" data-a="viewCard">`).join("")}</div></div>`:""}</div></div>
 <div class="panel"><div class="panel-h"><h2>Orders and results</h2></div>${ordersTable(os,{emptyTitle:"No orders for this patient"})}</div></div>`}

function patientForm(){const f=ptForm;const i=(k,l,o={})=>`<div class="field ${o.cls||""}"><label class="${o.req?"req":""}">${l}</label><input class="input" data-b="pt.${k}" value="${esc(k.split(".").reduce((a,x)=>a?.[x],f)??"")}" ${o.type?`type="${o.type}"`:""}></div>`;
 return `<div class="grid g2">${i("first","First name",{req:1})}${i("last","Last name",{req:1})}${i("dob","Date of birth",{req:1,type:"date"})}
 <div class="field"><label class="req">Sex</label><select class="input" data-b="pt.sex">${[["","Select"],["F","Female"],["M","Male"],["X","Other / unknown"]].map(([v,l])=>`<option value="${v}" ${f.sex===v?"selected":""}>${l}</option>`).join("")}</select></div>
 ${i("phone","Phone",{type:"tel"})}${i("email","Email",{type:"email"})}${i("address","Street address",{cls:"spanall"})}${i("city","City")}<div class="grid g2">${i("state","State")}${i("zip","ZIP")}</div>
 <div class="field"><label class="req">Coverage</label><select class="input" data-b="pt.ins.type" data-live="1">${["","Medicare","Medicaid","Commercial","Self-pay"].map(x=>`<option value="${x}" ${f.ins.type===x?"selected":""}>${x||"Select"}</option>`).join("")}</select></div>
 ${f.ins.type!=="Self-pay"?`${cardSection(f)}${i("ins.payer","Payer name",{req:1})}${i("ins.member",f.ins.type==="Medicare"?"Medicare beneficiary ID (MBI)":"Member ID",{req:1})}${i("ins.group","Group number")}${i("ins.subscriber","Subscriber name, if not the patient")}`:""}</div>`}
function cardTile(f,k,label){const img=f.ins[k];
 return img?`<div class="cardtile has"><img src="${img}" alt="${label} of insurance card"><div class="acts"><label class="link">Retake<input type="file" accept="image/*" data-card="${k}" hidden></label><button class="link" data-a="cardRemove" data-k="${k}">Remove</button></div></div>`
 :`<label class="cardtile">${I.camera}<span>${label} of card</span><span class="xs muted" style="font-weight:500">Take a photo or upload</span><input type="file" accept="image/*" data-card="${k}" hidden></label>`}
function cardSection(f){const can=SAMPLE&&SAMPLE_IMG;
 return `<div class="spanall"><div class="lbl">Insurance card</div><div class="cards">${cardTile(f,"cardFront","Front")}${cardTile(f,"cardBack","Back")}</div>
 ${f.ins.cardFront&&can?`<div class="row" style="margin-top:10px"><button class="btn sm" data-a="readCard" ${cardBusy?"disabled":""}>${I.scan} ${cardBusy?"Reading card…":"Fill in from card photo"}</button><span class="xs muted">Claude reads the card and fills the fields below. Check each one against the card.</span></div>`:""}
 ${f.cardRead?`<div class="xs muted" style="margin-top:6px">Filled from card photo${f.cardRead.plan?`: ${esc(f.cardRead.plan)}`:""}. Verify before saving.</div>`:""}</div>`}
function validPatient(f){if(!f.first.trim()||!f.last.trim()||!f.dob||!f.sex||!f.ins.type)return"Add name, date of birth, sex and coverage.";if(f.ins.type!=="Self-pay"&&(!f.ins.payer.trim()||!f.ins.member.trim()))return"Add the payer name and member ID.";return""}
function blankPatient(){return {first:"",last:"",dob:"",sex:"",phone:"",email:"",address:"",city:"",state:"CA",zip:"",ins:{type:"",payer:"",member:"",group:"",subscriber:""}}}
function savePatientForm(){const e=validPatient(ptForm);if(e){toast(e);return null}
 let p;if(ptForm.id){p=patientOf(ptForm.id);Object.assign(p,JSON.parse(JSON.stringify(ptForm)))}
 else{p={...JSON.parse(JSON.stringify(ptForm)),id:uid("pt"),clinicId:isLab()?(draft&&draft.clinicId):me().clinicId,mrn:"FBP"+rid()+String(Date.now()%100).padStart(2,"0"),createdAt:Date.now()};S.patients.push(p)}
 save();return p}

/* ---------- order wizard ---------- */
const dClinic=()=>clinicOf(draft&&draft.clinicId)||myClinic();
function newDraft(pid){const cid=pid?patientOf(pid).clinicId:(isLab()?"":me().clinicId),cc=clinicOf(cid);return {step:pid?2:1,clinicId:cid,paper:isLab(),received:true,scans:[],genPaper:false,abnPaper:false,provPaper:false,patientId:pid||"",pq:"",newPt:false,toxSpec:"",screen:"none",poct:{},collector:me()?me().name:"",recollect:false,billType:"",providerId:cc&&cc.providers[0]?cc.providers[0].id:"",tests:[],confirm:[],meds:[],medsText:"",icd:[],icdFree:"",collectedAt:localNow(),stat:false,fasting:false,notes:"",tq:"",
 pMethod:isLab()?"paper":"now",repName:"",repRel:"",onFile:false,genAgree:false,abnChoice:"",abnCost:"",provAttest:false}}
function needs(){const p=patientOf(draft.patientId),ts=draft.tests.map(T);return {genetic:ts.some(t=>t.genetic),abn:draft.billType==="Medicare"&&ts.some(t=>t.abn),abnTests:ts.filter(t=>t.abn),tox:ts.some(t=>t.cat==="tox"||t.cat==="conf"),fasting:ts.some(t=>t.fasting)}}
function vOrderNew(){
 if(!draft)draft=newDraft();
 syncTox(draft);
 if(draft.clinicId!==draft._cid){const cc=clinicOf(draft.clinicId);if(draft._cid!==undefined||(draft.patientId&&patientOf(draft.patientId)?.clinicId!==draft.clinicId))draft.patientId=draft.patientId&&patientOf(draft.patientId)?.clinicId===draft.clinicId?draft.patientId:"";draft.providerId=cc&&cc.providers.some(x=>x.id===draft.providerId)?draft.providerId:(cc&&cc.providers[0]?cc.providers[0].id:"");draft._cid=draft.clinicId}
 const d=draft,st=["Patient","Tests & diagnosis","Consents & signatures","Review"];
 let body="";
 if(d.step===1){
  const pick=isLab()?`<div class="field" style="max-width:460px;margin-bottom:18px"><label class="req">Clinic on the requisition</label><select class="input" data-b="draft.clinicId" data-live="1"><option value="">Choose a clinic</option>${[...S.clinics].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}" ${d.clinicId===c.id?"selected":""}>${esc(c.name)}${c.acct?` (${c.acct})`:""}${c.status!=="active"?` · ${c.status}`:""}</option>`).join("")}</select>${d.clinicId&&clinicOf(d.clinicId).status!=="active"?`<span class="hint" style="color:var(--warn)">This clinic isn't approved yet. Approve it on the Clinics page before receiving its specimens.</span>`:""}</div>`:"";
  if(isLab()&&!d.clinicId){body=pick+`<p class="muted">Choose the clinic named on the paper requisition to find or add the patient.</p>`}
  else if(d.newPt){body=pick+`<div class="row between" style="margin-bottom:16px"><h2>New patient</h2><button class="link" data-a="draftPickExisting">Choose an existing patient instead</button></div>${patientForm()}`}
  else{const q=d.pq.trim().toLowerCase();let list=scopePatients().filter(p=>!isLab()||p.clinicId===d.clinicId);if(q)list=list.filter(p=>`${p.first} ${p.last} ${p.mrn} ${fmtDOB(p.dob)}`.toLowerCase().includes(q));
   body=pick+`<div class="row between" style="margin-bottom:14px"><div class="search" style="max-width:380px;flex:1">${I.search}<input class="input" data-b="draft.pq" data-live="1" placeholder="Search by name, DOB or MRN" value="${esc(d.pq)}"></div><button class="btn" data-a="draftNewPt">${I.plus} New patient</button></div>
   <div class="tbl-wrap" style="border:1px solid var(--border);border-radius:var(--r)"><table class="tbl"><tbody>${list.slice(0,12).map(p=>`<tr class="click" data-a="draftPick" data-id="${p.id}"><td style="width:36px"><input type="radio" name="pp" ${d.patientId===p.id?"checked":""} aria-label="Select"></td><td class="nm">${esc(pname(p))}</td><td class="small">DOB ${fmtDOB(p.dob)}</td><td class="small">${p.mrn}</td><td class="small">${esc(p.ins.type)}</td></tr>`).join("")||`<tr><td class="empty">No matches. Add a new patient instead.</td></tr>`}</tbody></table></div>`}
 }
 if(d.step===2){const c=dClinic(),tq=d.tq.trim().toLowerCase(),nd=needs();
  body=`<div class="grid g3"><div class="field"><label class="req">Ordering provider</label><select class="input" data-b="draft.providerId">${c.providers.map(p=>`<option value="${p.id}" ${d.providerId===p.id?"selected":""}>${esc(p.name)}, ${esc(p.cred)} · NPI ${p.npi}</option>`).join("")}</select></div>
  <div class="field"><label class="req">Collection date and time</label><input class="input" type="datetime-local" data-b="draft.collectedAt" value="${esc(d.collectedAt)}"></div>
  <div class="field"><label>Priority</label><div class="radio-row"><span class="pill ${!d.stat?"on":""}" data-a="draftSet" data-k="stat" data-val="0">Routine</span><span class="pill ${d.stat?"on":""}" data-a="draftSet" data-k="stat" data-val="1">STAT</span></div></div></div>
  ${billRow(d)}${toxBlock(d)}<div class="row between" style="margin:30px 0 8px"><h2>Molecular and blood tests</h2><div class="search" style="max-width:280px;flex:1">${I.search}<input class="input" data-b="draft.tq" data-live="1" placeholder="Find a test or CPT" value="${esc(d.tq)}"></div></div>
  ${CATS.filter(c=>c.id==="mol"||c.id==="blood").map(cat=>{const ts=TESTS.filter(t=>t.cat===cat.id&&(!tq||`${t.name} ${t.code} ${t.cpt}`.toLowerCase().includes(tq)));if(!ts.length)return"";
   return `<div class="cat-h"><h3>${cat.name}</h3><span class="xs muted">${cat.note}</span>${cat.id==="blood"?`<button class="link" style="margin-left:auto" data-a="allBlood">${TESTS.filter(x=>x.cat==="blood").every(x=>d.tests.includes(x.code))?"Clear all blood panels":"Select all 15 panels (104 biomarkers)"}</button>`:""}</div><div class="tests">${ts.map(t=>{const on=d.tests.includes(t.code);return `<button type="button" class="tcard ${on?"on":""}" data-a="toggleTest" data-id="${t.code}" aria-pressed="${on}"><span class="box">${on?tick:""}</span><span><span class="t">${esc(t.name)}</span><span class="m" style="display:block">${esc(t.specimen)} · ${t.dynamic?"choose drug classes":`${t.analytes.length} ${t.cat==="blood"?"biomarkers":t.targets?"targets":"analytes"}`}${t.abn?" · ABN may apply":""}${t.genetic?" · consent required":""}</span></span></button>`}).join("")}</div>
   ${cat.id==="conf"&&d.tests.includes("CONF")?`<div class="subbox"><div class="row between" style="margin-bottom:10px"><div><b>Drug classes to confirm</b> <span class="muted small">${d.confirm.length} selected · bills as <span class="gcode">${gcode(d.confirm.length)}</span></span></div><div class="row"><button class="btn sm" data-a="confPreset" data-p="pain">Pain management set</button><button class="btn sm" data-a="confPreset" data-p="all">All</button><button class="btn sm ghost" data-a="confPreset" data-p="none">Clear</button></div></div><div class="radio-row">${CONF_CLASSES.map(x=>`<span class="pill ${d.confirm.includes(x)?"on":""}" data-a="toggleArr" data-k="confirm" data-val="${esc(x)}">${esc(x)}</span>`).join("")}</div><p class="xs muted" style="margin-top:10px">Medicare bills definitive testing by number of drug classes: G0480 (1–7), G0481 (8–14), G0482 (15–21), G0483 (22+). Order only the classes that are medically necessary.</p></div>`:""}`}).join("")}
  ${(()=>{const need=[...new Set(d.tests.flatMap(c=>T(c).needs||[]))].filter(c=>!d.tests.includes(c));return need.length?`<div class="banner info" style="margin-top:18px">${I.info}<div>Some calculated biomarkers use results from other panels. Add ${need.map(c=>esc(T(c).name)).join(" and ")} so they can be calculated. <button class="link" data-a="addNeeds">Add ${need.length>1?"them":"it"}</button></div></div>`:""})()}
  ${false?`<h2 style="margin:28px 0 6px">Current medications</h2><p class="muted small" style="margin-bottom:10px">Used to report whether each drug result is consistent with what the patient is prescribed.</p><div class="radio-row">${CONF_CLASSES.map(x=>`<span class="pill ${d.meds.includes(x)?"on":""}" data-a="toggleArr" data-k="meds" data-val="${esc(x)}">${esc(x)}</span>`).join("")}</div><div class="field" style="margin-top:12px"><label>Medication names and doses</label><input class="input" data-b="draft.medsText" value="${esc(d.medsText)}" placeholder="e.g. Oxycodone 10 mg BID, Alprazolam 0.5 mg PRN"></div>`:""}
  ${nd.fasting?`<label class="check" style="margin-top:18px"><input type="checkbox" data-b="draft.fasting" ${d.fasting?"checked":""}>Patient was fasting at collection</label>`:""}
  <h2 style="margin:28px 0 6px">Diagnosis codes (ICD-10)</h2><p class="muted small" style="margin-bottom:10px">At least one is required to support medical necessity.</p>
  <div class="radio-row">${ICD_QUICK.map(([c,l])=>`<span class="pill ${d.icd.includes(c)?"on":""}" data-a="toggleArr" data-k="icd" data-val="${c}" title="${esc(l)}"><b>${c}</b> ${esc(l)}</span>`).join("")}${d.icd.filter(c=>!ICD_QUICK.some(q=>q[0]===c)).map(c=>`<span class="pill on" data-a="toggleArr" data-k="icd" data-val="${esc(c)}"><b>${esc(c)}</b><span class="x">✕</span></span>`).join("")}</div>
  <div class="row" style="margin-top:12px"><input class="input" style="max-width:220px" data-b="draft.icdFree" value="${esc(d.icdFree)}" placeholder="Other code, e.g. M54.50" data-enter="addIcd"><button class="btn" data-a="addIcd">Add code</button></div>
  <div class="field" style="margin-top:22px"><label>Notes for the lab</label><textarea class="input" data-b="draft.notes" placeholder="Optional">${esc(d.notes)}</textarea></div>`;
 }
 if(d.step===3){const p=patientOf(d.patientId),pr=dClinic().providers.find(x=>x.id===d.providerId),nd=needs(),paper=d.paper;
  body=`<div class="stack">
  ${paper?`<div class="consent"><div class="consent-h"><h3>Paper requisition</h3><span class="badge st-ordered">Required</span></div><div class="consent-b"><p class="small">Photograph or scan every page of the signed requisition. It's stored with the order as the original record.</p>
   <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${d.scans.map((u,i)=>`<div class="cardtile has" style="aspect-ratio:.77"><img src="${u}" alt="Requisition page ${i+1}"><div class="acts"><button class="link" data-a="scanRemove" data-i="${i}">Remove</button></div></div>`).join("")}<label class="cardtile" style="aspect-ratio:.77">${I.camera}<span>${d.scans.length?"Add another page":"Add requisition page"}</span><span class="xs muted" style="font-weight:500">Take a photo or upload</span><input type="file" accept="image/*" data-reqscan="1" hidden></label></div></div></div>`:""}
  <div class="consent"><div class="consent-h"><h3>Patient consent and responsibility</h3><span class="badge st-ordered">Required</span></div><div class="consent-b"><div class="legal">${TXT.patient}</div>
   <div class="radio-row">${paper?`<span class="pill ${d.pMethod==="paper"?"on":""}" data-a="draftSet" data-k="pMethod" data-val="paper">Patient signed the paper requisition</span>`:""}<span class="pill ${d.pMethod==="now"?"on":""}" data-a="draftSet" data-k="pMethod" data-val="now">Patient signs now</span><span class="pill ${d.pMethod==="rep"?"on":""}" data-a="draftSet" data-k="pMethod" data-val="rep">Authorized representative signs</span><span class="pill ${d.pMethod==="file"?"on":""}" data-a="draftSet" data-k="pMethod" data-val="file">Signed consent on file at practice</span></div>
   ${d.pMethod==="rep"?`<div class="grid g2"><div class="field"><label class="req">Representative name</label><input class="input" data-b="draft.repName" value="${esc(d.repName)}"></div><div class="field"><label class="req">Relationship or authority</label><input class="input" data-b="draft.repRel" value="${esc(d.repRel)}" placeholder="e.g. Parent, legal guardian, POA"></div></div>`:""}
   ${d.pMethod==="paper"?`<p class="small muted">The patient's signature on the attached requisition is the consent of record.</p>`:d.pMethod==="file"?`<label class="check"><input type="checkbox" data-b="draft.onFile" ${d.onFile?"checked":""}>I confirm a current signed consent for ${esc(p.first)} ${esc(p.last)} is on file at the practice and can be produced on request.</label>`:sigPad("patient",d.pMethod==="rep"?"Representative signature":`${p.first} ${p.last}, patient signature`)}
  </div></div>
  ${nd.genetic?`<div class="consent"><div class="consent-h"><h3>Informed consent for genetic testing</h3><span class="badge st-ordered">Required for PGx</span></div><div class="consent-b"><div class="legal">${TXT.genetic}</div><label class="check"><input type="checkbox" data-b="draft.genAgree" ${d.genAgree?"checked":""}>I have read this information, had the chance to ask questions, and consent to genetic testing.</label>${paper?`<label class="check"><input type="checkbox" data-b="draft.genPaper" ${d.genPaper?"checked":""}>The patient signed a genetic testing consent on paper (attached).</label>`:""}${paper&&d.genPaper?"":sigPad("genetic","Patient signature for genetic testing")}</div></div>`:""}
  ${nd.abn?`<div class="consent"><div class="consent-h"><h3>Advance Beneficiary Notice of Non-coverage (ABN)</h3><span class="badge st-pending">Medicare patient</span></div><div class="consent-b"><p class="small">${TXT.abnIntro}</p>
   <div class="tbl-wrap" style="border:1px solid var(--border);border-radius:var(--r-sm)"><table class="tbl"><thead><tr><th>Test</th><th>Reason Medicare may not pay</th><th>Estimated cost</th></tr></thead><tbody>${nd.abnTests.map(t=>`<tr><td class="nm">${esc(t.name)}</td><td class="small">May exceed frequency limits or not meet coverage criteria</td><td>$${t.fee}</td></tr>`).join("")}</tbody></table></div>
   <div class="stack" style="gap:8px">${Object.entries(TXT.abnOpts).map(([k,v])=>`<label class="check"><input type="radio" name="abn" data-a="draftSet" data-k="abnChoice" data-val="${k}" ${d.abnChoice===k?"checked":""}>${esc(v)}</label>`).join("")}</div>
   ${paper?`<label class="check"><input type="checkbox" data-b="draft.abnPaper" ${d.abnPaper?"checked":""}>The patient signed an ABN on paper with this choice (attached).</label>`:""}${paper&&d.abnPaper?"":sigPad("abn","Patient signature for ABN")}<p class="xs muted">Use the current CMS-R-131 form for billing. This captures the patient's choice and signature at the point of order.</p></div></div>`:""}
  <div class="consent"><div class="consent-h"><h3>Provider attestation and signature</h3><span class="badge st-ordered">Required</span></div><div class="consent-b"><p class="small">${TXT.provider}</p>${paper?`<label class="check"><input type="checkbox" data-b="draft.provPaper" ${d.provPaper?"checked":""}>${esc(pr.name)}, ${esc(pr.cred)} (NPI ${pr.npi}) signed the paper requisition.</label>`:`<label class="check"><input type="checkbox" data-b="draft.provAttest" ${d.provAttest?"checked":""}>I, ${esc(pr.name)}, ${esc(pr.cred)} (NPI ${pr.npi}), attest to the statement above.</label>${sigPad("provider",`${pr.name}, ${pr.cred}`)}`}</div></div>
  </div>`;
 }
 if(d.step===4){const p=patientOf(d.patientId),pr=dClinic().providers.find(x=>x.id===d.providerId),nd=needs();const drop=nd.abn&&d.abnChoice==="3";
  const kept=d.tests.filter(c=>!(drop&&T(c).abn));
  const row=(k,v)=>`<tr><td class="muted" style="width:210px">${k}</td><td>${v}</td></tr>`;
  body=`${drop?`<div class="banner warn" style="margin-bottom:16px">${I.info}<div>The patient declined the ABN tests, so ${nd.abnTests.map(t=>esc(t.name)).join(", ")} will be removed from this order.</div></div>`:""}
  <div class="tbl-wrap"><table class="tbl"><tbody>
  ${row("Patient",`<b>${esc(pname(p))}</b> · DOB ${fmtDOB(p.dob)} · ${esc(p.ins.type)} ${esc(p.ins.payer)} ${esc(p.ins.member)}`)}
  ${row("Ordering provider",`${esc(pr.name)}, ${esc(pr.cred)} · NPI ${pr.npi}`)}
  ${row("Billing type",esc(d.billType))}
  ${d.toxSpec?row("Toxicology",`${esc(d.toxSpec)}${d.toxSpec==="Urine"?`, ${SCREEN_LBL[d.screen].toLowerCase()}`:""}${pocSummary(d.poct)?`<div class="small muted">Provider POCT: ${esc(pocSummary(d.poct))}</div>`:""}`):""}
  ${row("Collected",fmtDT(d.collectedAt)+(d.stat?' <span class="flag C">STAT</span>':"")+(d.fasting?" · fasting":"")+(d.collector?` · collected by ${esc(d.collector)}`:"")+(d.recollect?" · recollected specimen":""))}
  ${row("Tests",kept.map(c=>`<div>${esc(T(c).name)} <span class="faint small">CPT ${isDef(c)?gcode(classCount(d.confirm)):T(c).cpt}</span></div>`).join(""))}
  ${d.confirm.length?row(`Definitive drugs (${classCount(d.confirm)} billing classes)`,`${d.confirm.map(x=>`<span class="tag">${esc(x)}</span>`).join("")}`):""}
  ${nd.tox?row("Prescribed (Rx)",(d.meds.map(x=>`<span class="tag">${esc(x)}</span>`).join("")||"None reported")+(d.medsText?`<div class="small muted">${esc(d.medsText)}</div>`:"")):""}
  ${row("Specimens",[...new Set(kept.map(c=>T(c).specimen))].map(esc).join(", "))}
  ${row("Diagnosis codes",d.icd.map(c=>`<span class="tag">${esc(c)}</span>`).join(""))}
  ${d.paper?row("Paper requisition",`${d.scans.length} page${d.scans.length===1?"":"s"} attached<label class="check" style="margin-top:8px"><input type="checkbox" data-b="draft.received" ${d.received?"checked":""}>The specimen arrived with this requisition. Mark it received now.</label>`):""}
  ${row("Signatures",`Patient consent ${d.pMethod==="file"?"(on file)":d.pMethod==="paper"?"(on paper)":"✓"}${nd.genetic?" · Genetic consent ✓":""}${nd.abn?` · ABN option ${d.abnChoice} ✓`:""} · Provider attestation ✓`)}
  ${d.notes?row("Notes",esc(d.notes)):""}
  </tbody></table></div>`;
 }
 const p=patientOf(d.patientId);
 return `<div class="page-h"><div><h1>${d.paper?"Enter paper requisition":"New order"}</h1><p class="muted">${p?`For ${esc(p.first)} ${esc(p.last)}${d.paper&&dClinic()?` · ${esc(dClinic().name)}`:""}`:d.paper?"Enter the order exactly as written on the paper form":"Choose a patient to begin"}</p></div><button class="btn ghost" data-a="cancelOrder">Discard order</button></div>
 <div class="steps">${st.map((s,i)=>`<div class="stepi ${d.step===i+1?"on":d.step>i+1?"done":""}"><span class="n">${d.step>i+1?tick:i+1}</span>${s}</div>`).join("")}</div>
 <div class="panel"><div class="panel-b">${body}</div><div class="wiz-foot"><button class="btn" data-a="ordBack" ${d.step===1?"disabled":""}>Back</button><button class="btn primary" data-a="ordNext">${d.step===4?"Submit order":"Continue"}</button></div></div>`;
}
function ordValidate(){syncTox(draft);const d=draft,nd=needs();
 if(d.step===1){if(isLab()&&!d.clinicId)return toast("Choose the clinic on the requisition."),false;if(d.newPt){const p=savePatientForm();if(!p)return false;d.patientId=p.id;d.newPt=false;ptForm=null;return true}if(!d.patientId){toast("Select a patient or add a new one.");return false}}
 if(d.step===2){if(!d.providerId)return toast("Choose the ordering provider."),false;if(d.toxSpec&&!d.tests.some(c=>["UDS","CONF","CONFOF"].includes(c)))return toast("For toxicology, choose a lab screen or at least one definitive drug."),false;if(!d.tests.length)return toast("Select at least one test."),false;if(!d.billType)return toast("Choose a billing type."),false;if(!d.icd.length)return toast("Add at least one ICD-10 code."),false;if(!d.collectedAt)return toast("Add the collection date and time."),false;if(new Date(d.collectedAt)>new Date(Date.now()+5*6e4))return toast("Collection time can't be in the future."),false}
 if(d.step===3&&d.paper){if(!d.scans.length)return toast("Attach a photo or scan of the paper requisition."),false;
  if(d.pMethod!=="paper"){if(d.pMethod==="file"&&!d.onFile)return toast("Confirm the signed consent is on file."),false;if(d.pMethod!=="file"&&!sigs.patient)return toast("Collect the patient consent signature."),false}
  if(nd.genetic&&(!d.genAgree||!(d.genPaper||sigs.genetic)))return toast("Record the genetic testing consent."),false;
  if(nd.abn&&(!d.abnChoice||!(d.abnPaper||sigs.abn)))return toast("Record the patient's ABN choice and signature."),false;
  if(!d.provPaper)return toast("Confirm the provider signed the requisition."),false;
  return true}
 if(d.step===3){if(d.pMethod==="file"){if(!d.onFile)return toast("Confirm the signed consent is on file."),false}else{if(d.pMethod==="rep"&&(!d.repName.trim()||!d.repRel.trim()))return toast("Add the representative's name and relationship."),false;if(!sigs.patient)return toast("Collect the patient consent signature."),false}
  if(nd.genetic&&(!d.genAgree||!sigs.genetic))return toast("Complete the genetic testing consent and signature."),false;
  if(nd.abn&&(!d.abnChoice||!sigs.abn))return toast("Record the patient's ABN choice and signature."),false;
  if(!d.provAttest||!sigs.provider)return toast("The provider must attest and sign."),false}
 return true}
async function submitOrder(){if(submitting)return;const d=draft,nd=needs(),p=patientOf(d.patientId),c=dClinic(),pr=c.providers.find(x=>x.id===d.providerId);
 let tests=[...d.tests];if(nd.abn&&d.abnChoice==="3")tests=tests.filter(x=>!T(x).abn);
 if(!tests.length){toast("No tests remain after the ABN choice. Change the choice or the tests.");return}
 const now=Date.now();let seqN;submitting=true;try{seqN=await DB.nextSeq("accession")}catch(e){submitting=false;return toast("Couldn't get an accession number. Check your connection and try again.")}submitting=false;
 const o={id:uid("o"),accession:acc(now,seqN),clinicId:c.id,patientId:p.id,providerId:pr.id,tests,confirm:tests.some(isDef)?[...d.confirm]:[],toxSpec:d.toxSpec,screen:d.screen,reflex:d.screen==="reflex",poct:JSON.parse(JSON.stringify(d.poct)),collector:d.collector,recollect:d.recollect,billType:d.billType,meds:[...d.meds],medsText:d.medsText,icd:[...d.icd],collectedAt:new Date(d.collectedAt).getTime(),createdAt:now,stat:d.stat,fasting:d.fasting,notes:d.notes,
  source:d.paper?"paper":"portal",scans:d.paper?[...d.scans]:[],
  consents:{patient:d.pMethod==="paper"?{method:"paper",name:`${p.first} ${p.last}`,at:now}:d.pMethod==="file"?{method:"file",name:`${p.first} ${p.last}`,at:now}:{method:d.pMethod,name:d.pMethod==="rep"?`${d.repName} (${d.repRel})`:`${p.first} ${p.last}`,sig:sigs.patient,at:now},provider:d.paper?{name:`${pr.name}, ${pr.cred}`,paper:true,at:now,attest:true}:{name:`${pr.name}, ${pr.cred}`,sig:sigs.provider,at:now,attest:true}},
  status:"Ordered",history:[{s:"Ordered",at:now,by:me().name,note:d.paper?"Entered from paper requisition":undefined}],results:{},readAt:null,releasedAt:null};
 if(nd.genetic)o.consents.genetic=d.genPaper?{paper:true,at:now,agree:true}:{sig:sigs.genetic,at:now,agree:true};
 if(nd.abn)o.consents.abn=d.abnPaper?{choice:d.abnChoice,tests:nd.abnTests.map(t=>t.code),paper:true,at:now}:{choice:d.abnChoice,tests:nd.abnTests.map(t=>t.code),sig:sigs.abn,at:now};
 if(d.paper&&d.received&&c.status==="active"){o.status="Received";o.history.push({s:"Received",at:now,by:me().name})}
 S.orders.push(o);if(!d.paper)pushNote("lab",o.id,d.stat?"New STAT order":"New order",`${c.name} ordered ${tests.length} test${tests.length>1?"s":""} (${o.accession}).`,d.stat?"crit":"info");
 save();draft=null;sigs={};go("order",{id:o.id});toast(o.source==="paper"?(o.status==="Received"?"Requisition entered and specimen received":"Requisition entered"):"Order submitted");setTimeout(()=>showRequisition(o.id),60)}

/* ---------- order detail ---------- */
function vOrder(){
 const o=S.orders.find(x=>x.id===route.p.id);if(!o)return `<div class="empty">Order not found.</div>`;
 const lab=isLab(),p=patientOf(o.patientId),c=clinicOf(o.clinicId),pr=provOf(o);
 if(!lab&&o.status==="Released"&&!o.readAt){o.readAt=Date.now();S.notes.filter(n=>n.orderId===o.id&&n.aud===c.id).forEach(n=>n.read=true);save()}
 const k=(a,b)=>`<div><div class="xs muted">${a}</div><div style="color:var(--ink);font-weight:500">${b}</div></div>`;
 const cons=o.consents||{};
 const sigCell=(label,obj)=>obj?`<div class="stack" style="gap:6px"><div class="small"><b>${label}</b></div>${obj.sig?`<img class="sig-img" src="${obj.sig}" alt="${label} signature">`:`<div class="small muted">${obj.paper||obj.method==="paper"?"Signed on paper requisition":"Signed consent on file at practice"}</div>`}<div class="xs muted">${esc(obj.name||"")} · ${fmtDT(obj.at)}${obj.choice?` · Option ${obj.choice}`:""}</div></div>`:"";
 let actions="";
 if(lab){
  if(o.status==="Ordered")actions=`<button class="btn danger" data-a="reject" data-id="${o.id}">Reject specimen</button><button class="btn primary" data-a="receive" data-id="${o.id}">${I.check} Mark received</button>`;
  if(o.status==="Received")actions=`<button class="btn danger" data-a="reject" data-id="${o.id}">Reject specimen</button><button class="btn primary" data-a="startTesting" data-id="${o.id}">Start testing</button>`;
  if(o.status==="In Process")actions=`<button class="btn primary" data-a="go" data-v="entry" data-id="${o.id}">${I.pen} Enter results</button>`;
 }
 if(o.status==="Released")actions+=`<button class="btn primary" data-a="report" data-id="${o.id}">${I.doc} View report</button>`;
 return `<div class="crumb"><button data-a="go" data-v="${lab?"queue":"results"}">${lab?"Accessioning":"Orders & results"}</button> / ${o.accession}</div>
 <div class="page-h"><div><h1 class="row">${o.accession} ${badge(o.status)}${o.stat?'<span class="flag C">STAT</span>':""}</h1><p class="muted">${esc(pname(p))} · ${esc(c.name)}</p></div><div class="row">${lab?`<button class="btn ghost" data-a="auditFor" data-q="${o.accession}">Access history</button>`:""}<button class="btn" data-a="req" data-id="${o.id}">${I.print} Requisition and labels</button>${actions}</div></div>
 <div class="stack">
 <div class="panel"><div class="panel-b">${journey(o)}</div></div>
 ${o.status==="Released"&&o.flags&&(o.flags.crit||o.flags.ab||o.flags.inc)?`<div class="banner ${o.flags.crit?"danger":"warn"}">${I.alert}<div><b>${o.flags.crit?"Critical value reported.":"Abnormal findings."}</b> ${o.flags.crit?`${o.flags.crit} critical, `:""}${o.flags.ab-o.flags.crit} abnormal${o.tests.some(isDef)?`, ${o.flags.inc} inconsistent with reported medications`:""}. Open the report for details.</div></div>`:""}
 <div class="panel"><div class="panel-h"><h2>Order details</h2></div><div class="panel-b grid g4">
  ${k("Patient",`<button class="link" style="font-size:14px" data-a="openPatient" data-id="${p.id}">${esc(pname(p))}</button><div class="xs muted">DOB ${fmtDOB(p.dob)} · ${p.sex} · ${p.mrn}</div>`)}
  ${k("Ordering provider",`${esc(pr?.name)}, ${esc(pr?.cred)}<div class="xs muted">NPI ${pr?.npi}</div>`)}
  ${k("Billing",`${esc(o.billType||p.ins.type)}<div class="xs muted">${esc(p.ins.payer)} ${esc(p.ins.member)}</div>`)}
  ${k("Collected",fmtDT(o.collectedAt)+(o.fasting?`<div class="xs muted">Fasting</div>`:"")+(o.collector?`<div class="xs muted">By ${esc(o.collector)}</div>`:"")+(o.recollect?`<div class="xs muted">Recollected specimen</div>`:""))}
  <div class="span2">${k("Tests",o.tests.map(c=>`<div>${esc(T(c).name)} <span class="faint small">CPT ${isDef(c)?gcode(classCount(o.confirm)):T(c).cpt}</span>${lab?` <span class="tag">${routeOf(c)==="ref"?esc(S.lab.refLab||"Reference lab"):ROUTE_NAME[routeOf(c)]}</span>`:""}</div>`).join("")+(o.sendout?`<div class="xs muted" style="margin-top:4px">Sent to ${esc(o.sendout.lab||"reference lab")} on ${o.sendout.manifest}, ${fmtDT(o.sendout.at)}</div>`:""))}</div>
  ${k("Diagnosis codes",o.icd.map(x=>`<span class="tag">${esc(x)}</span>`).join(""))}
  ${k("Specimens",[...new Set(o.tests.map(c=>T(c).specimen))].map(esc).join(", "))}
  ${o.toxSpec?`<div class="spanall">${k("Toxicology",`${esc(o.toxSpec)}${o.toxSpec==="Urine"?`, ${SCREEN_LBL[o.screen||"none"].toLowerCase()}`:""}${pocSummary(o.poct)?`<div class="xs muted">Provider POCT: ${esc(pocSummary(o.poct))}</div>`:""}`)}</div>`:""}${o.confirm.length?`<div class="spanall">${k(`Definitive drugs (${o.confirm.length} drugs, ${classCount(o.confirm)} billing classes, ${gcode(classCount(o.confirm))})`,o.confirm.map(x=>`<span class="tag">${o.meds.includes(x)?"Rx · ":""}${esc(x)}</span>`).join(""))}</div>`:""}
  ${!o.toxSpec&&(o.meds.length||o.medsText)?`<div class="spanall">${k("Reported medications",o.meds.map(x=>`<span class="tag">${esc(x)}</span>`).join("")+(o.medsText?`<div class="small muted">${esc(o.medsText)}</div>`:""))}</div>`:""}
  ${o.notes?`<div class="spanall">${k("Notes",esc(o.notes))}</div>`:""}
 </div></div>
 <div class="panel"><div class="panel-h"><h2>Consents and signatures</h2></div><div class="panel-b grid g4">${sigCell("Patient consent",cons.patient)}${sigCell("Genetic testing consent",cons.genetic)}${sigCell("ABN",cons.abn)}${sigCell("Provider attestation",cons.provider)}</div></div>
 ${o.scans&&o.scans.length?`<div class="panel"><div class="panel-h"><h2>Paper requisition</h2><span class="small muted">${o.scans.length} page${o.scans.length===1?"":"s"}</span></div><div class="panel-b cardthumbs">${o.scans.map((u,i)=>`<img src="${u}" alt="Requisition page ${i+1}" data-a="viewCard" style="height:140px">`).join("")}</div></div>`:""}
 <div class="panel"><div class="panel-h"><h2>Activity</h2></div><div class="tbl-wrap"><table class="tbl"><tbody>${[...o.history].reverse().map(h=>`<tr><td style="width:180px" class="small muted">${fmtDT(h.at)}</td><td>${badge(h.s)}</td><td class="small">${esc(h.by||"")}${h.note?` · ${esc(h.note)}`:""}</td></tr>`).join("")}</tbody></table></div></div>
 </div>`}

function vResults(){
 let list=scopeOrders();const q=ui.rq.trim().toLowerCase();
 if(q)list=list.filter(o=>{const p=patientOf(o.patientId);return `${o.accession} ${p.first} ${p.last} ${fmtDOB(p.dob)} ${o.tests.join(" ")}`.toLowerCase().includes(q)});
 if(ui.rstat==="open")list=list.filter(o=>["Ordered","Received","In Process"].includes(o.status));else if(ui.rstat)list=list.filter(o=>o.status===ui.rstat);
 if(ui.rcat)list=list.filter(o=>o.tests.some(c=>T(c).cat===ui.rcat));
 if(ui.rfrom)list=list.filter(o=>o.collectedAt>=new Date(ui.rfrom+"T00:00").getTime());
 if(ui.rto)list=list.filter(o=>o.collectedAt<=new Date(ui.rto+"T23:59").getTime());
 if(ui.runread)list=list.filter(o=>o.status==="Released"&&!o.readAt);
 list=[...list].sort((a,b)=>b.createdAt-a.createdAt);
 return `<div class="page-h"><div><h1>Orders and results</h1><p class="muted">${list.length} of ${scopeOrders().length} orders</p></div><button class="btn primary" data-a="go" data-v="order-new">${I.plus} New order</button></div>
 <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><div class="row" style="flex:1">
  <div class="search" style="max-width:300px;min-width:200px">${I.search}<input class="input" data-b="ui.rq" data-live="1" placeholder="Patient, DOB or accession" value="${esc(ui.rq)}"></div>
  <select class="input" style="width:auto" data-b="ui.rstat" data-live="1"><option value="">Any status</option><option value="open" ${ui.rstat==="open"?"selected":""}>In progress</option>${["Ordered","Received","In Process","Released","Rejected"].map(s=>`<option ${ui.rstat===s?"selected":""}>${s}</option>`).join("")}</select>
  <select class="input" style="width:auto" data-b="ui.rcat" data-live="1"><option value="">All test types</option>${CATS.map(c=>`<option value="${c.id}" ${ui.rcat===c.id?"selected":""}>${c.name}</option>`).join("")}</select>
  <input class="input" type="date" style="width:auto" data-b="ui.rfrom" data-live="1" value="${ui.rfrom}" aria-label="Collected from"><input class="input" type="date" style="width:auto" data-b="ui.rto" data-live="1" value="${ui.rto}" aria-label="Collected to">
  <label class="check small"><input type="checkbox" data-b="ui.runread" data-live="1" ${ui.runread?"checked":""}>New results only</label></div>
  ${ui.rq||ui.rstat||ui.rcat||ui.rfrom||ui.rto||ui.runread?`<button class="link" data-a="clearFilters">Clear filters</button>`:""}</div>
 ${ordersTable(list,{emptyTitle:"No orders match these filters",emptyText:"Clear a filter or widen the date range."})}</div>`}

function vNotes(){
 const list=S.notes.filter(n=>n.aud===audience()).sort((a,b)=>b.at-a.at);
 return `<div class="page-h"><div><h1>Notifications</h1><p class="muted">${unread()} unread</p></div>${unread()?`<button class="btn" data-a="readAll">Mark all as read</button>`:""}</div>
 <div class="panel">${list.length?list.map(n=>`<div class="note ${n.read?"":"unread"} ${n.level}"><div class="ico">${n.level==="crit"?I.alert:n.level==="ok"?I.check:I.bell}</div><div style="flex:1"><div class="row between"><b style="color:var(--ink)">${esc(n.title)}</b><span class="xs muted">${fmtDT(n.at)}</span></div><div class="small">${esc(n.body)}</div>${n.orderId?`<button class="link" style="margin-top:6px" data-a="openNote" data-id="${n.id}">Open order</button>`:!isLab()?"":`<button class="link" style="margin-top:6px" data-a="go" data-v="clinics">Review clinics</button>`}</div></div>`).join(""):`<div class="empty"><h3>You're all caught up</h3><p>Result alerts will appear here.</p></div>`}</div>`}

function vSettings(){
 const c=myClinic();if(!cs)cs=JSON.parse(JSON.stringify(c));
 const i=(k,l,o={})=>`<div class="field ${o.cls||""}"><label>${l}</label><input class="input" data-b="cs.${k}" value="${esc(k.split(".").reduce((a,x)=>a?.[x],cs)??"")}"></div>`;
 return `<div class="page-h"><div><h1>Clinic settings</h1><p class="muted">Account ${esc(c.acct||"")} ${badge(c.status)} · onboarded ${fmtD(c.createdAt)}</p></div><button class="btn primary" data-a="saveClinic">Save changes</button></div>
 <div class="stack"><div class="panel"><div class="panel-h"><h2>Practice</h2></div><div class="panel-b grid g3">${i("name","Practice name",{cls:"span2"})}${i("npi","Group NPI")}${i("taxId","Tax ID")}${i("phone","Phone")}${i("fax","Fax")}${i("address","Street address",{cls:"span2"})}${i("city","City")}${i("state","State")}${i("zip","ZIP")}</div></div>
 <div class="panel"><div class="panel-h"><h2>Result notifications</h2></div><div class="panel-b stack" style="gap:10px"><label class="check"><input type="checkbox" data-b="cs.notify.email" ${cs.notify.email?"checked":""}>Email the ordering provider when results are released</label><label class="check"><input type="checkbox" data-b="cs.notify.sms" ${cs.notify.sms?"checked":""}>Text the ordering provider</label><label class="check"><input type="checkbox" data-b="cs.notify.fax" ${cs.notify.fax?"checked":""}>Fax the report to the practice</label><div class="grid g3" style="margin-top:6px">${i("notify.criticalPhone","Phone for critical values")}</div></div></div>
 <div class="panel"><div class="panel-h"><h2>Providers</h2><button class="btn sm" data-a="addProv">${I.plus} Add provider</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>NPI</th><th>Alert email</th><th>Mobile</th><th></th></tr></thead><tbody>${c.providers.map(p=>`<tr><td class="nm">${esc(p.name)}, ${esc(p.cred)}</td><td class="small">${p.npi}</td><td class="small">${esc(p.email)}</td><td class="small">${esc(p.phone)}</td><td style="text-align:right"><button class="link" data-a="editProv" data-id="${p.id}">Edit</button></td></tr>`).join("")}</tbody></table></div></div>
 <div class="panel"><div class="panel-h"><h2>Signed agreements</h2></div><div class="panel-b row" style="gap:24px"><img class="sig-img" src="${c.agreement?.sig||""}" alt="Agreement signature"><div class="small">Laboratory services agreement and BAA<br><span class="muted">${esc(c.agreement?.signer)}, ${esc(c.agreement?.title)} · ${fmtD(c.agreement?.date)}</span></div></div></div></div>`}

/* ---------- lab pages ---------- */
function vLabDash(){
 const os=S.orders,now=Date.now();
 const aw=os.filter(o=>o.status==="Ordered"),ip=os.filter(o=>["Received","In Process"].includes(o.status)),today=os.filter(o=>o.releasedAt&&o.releasedAt>now-DAY),pend=S.clinics.filter(c=>c.status==="pending");
 const calls=S.outbox.filter(x=>x.channel==="Phone (critical)"&&x.status!=="Completed");
 const queue=os.filter(o=>["Ordered","Received","In Process"].includes(o.status)).sort((a,b)=>(b.stat-a.stat)||a.createdAt-b.createdAt);
 return `<div class="page-h"><div><h1>Lab dashboard</h1><p class="muted">${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p></div><button class="btn primary" data-a="newReq">${I.plus} Enter paper requisition</button></div>
 <div class="stack">
 ${calls.length?`<div class="banner danger">${I.alert}<div><b>${calls.length} critical value call${calls.length>1?"s":""} to document.</b> <button class="link" data-a="go" data-v="outbox">Open notification log</button></div></div>`:""}
 ${pend.length?`<div class="banner warn">${I.building}<div><b>${pend.length} clinic${pend.length>1?"s":""} waiting for approval.</b> <button class="link" data-a="go" data-v="clinics">Review registrations</button></div></div>`:""}
 <div class="stats"><button class="stat" data-a="goQueue" data-f="Ordered"><div class="v">${aw.length}</div><div class="k">Awaiting receipt</div></button><button class="stat" data-a="goQueue" data-f="active"><div class="v">${ip.length}</div><div class="k">Received or testing</div></button><div class="stat"><div class="v">${today.length}</div><div class="k">Released, last 24 hours</div></div><button class="stat" data-a="go" data-v="clinics"><div class="v">${S.clinics.filter(c=>c.status==="active").length}</div><div class="k">Active clinics</div></button></div>
 <div class="panel"><div class="panel-h"><h2>Work queue</h2><button class="link" data-a="go" data-v="queue">Open accessioning</button></div>${ordersTable(queue,{emptyTitle:"The queue is clear"})}</div></div>`}

function vQueue(){
 let list=S.orders;const q=ui.qq.trim().toLowerCase();
 if(ui.qstat==="active")list=list.filter(o=>["Ordered","Received","In Process"].includes(o.status));else if(ui.qstat)list=list.filter(o=>o.status===ui.qstat);
 if(ui.qclinic)list=list.filter(o=>o.clinicId===ui.qclinic);
 if(q)list=list.filter(o=>{const p=patientOf(o.patientId);return `${o.accession} ${p.first} ${p.last}`.toLowerCase().includes(q)});
 list=[...list].sort((a,b)=>(b.stat-a.stat)||b.createdAt-a.createdAt);
 const tabs=[["active","Open"],["Ordered","Awaiting receipt"],["Received","Received"],["In Process","Testing"],["Released","Released"],["Rejected","Rejected"],["","All"]];
 return `<div class="page-h"><div><h1>Accessioning</h1><p class="muted">Receive specimens, run tests and release results.</p></div></div>
 <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><div class="radio-row">${tabs.map(([v,l])=>`<span class="pill ${ui.qstat===v?"on":""}" data-a="setUi" data-k="qstat" data-val="${v}">${l}</span>`).join("")}</div>
 <div class="row"><div class="search" style="min-width:220px">${I.search}<input class="input" data-b="ui.qq" data-live="1" placeholder="Accession or patient" value="${esc(ui.qq)}" data-enter="scanAcc"></div><select class="input" style="width:auto" data-b="ui.qclinic" data-live="1"><option value="">All clinics</option>${S.clinics.map(c=>`<option value="${c.id}" ${ui.qclinic===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div></div>
 ${ordersTable(list,{emptyTitle:"Nothing here",emptyText:"Try another status tab."})}</div>
 <p class="xs muted" style="margin-top:10px">Tip: scan a requisition barcode into the search box and press Enter to open that order.</p>`}

function vEntry(){
 const o=S.orders.find(x=>x.id===route.p.id);if(!o)return `<div class="empty">Order not found.</div>`;
 if(!resEdit||resEdit._id!==o.id){resEdit=JSON.parse(JSON.stringify(o.results||{}));resEdit._id=o.id}
 const p=patientOf(o.patientId);
 const cell=(code,a,idx)=>{if(a.type==="calc"){const v=calcVal(resEdit,a,p),f=v==null?"":flagOf(a,{v:String(v)},p.sex);return `<td><b>${v??"—"}</b> <span class="xs muted">calculated</span>${v==null?`<div class="xs faint">Needs ${esc(a.needs)}</div>`:""}</td><td class="small muted">${esc(a.unit)}</td><td class="small muted">${rangeText(a,p.sex)}</td><td>${f?`<span class="flag ${f}">${f}</span>`:""}</td>`}const r=(resEdit[code]||{})[a.name]||{};const f=flagOf(a,r,p.sex);
  if(a.type==="quant")return `<td><input class="input" style="max-width:120px" inputmode="decimal" data-b="res.${code}.${idx}.v" value="${esc(r.v??"")}" data-live="1"></td><td class="small muted">${esc(a.unit)}</td><td class="small muted">${rangeText(a,p.sex)}</td><td>${f?`<span class="flag ${f}">${f}</span>`:""}</td>`;
  if(a.type==="conf")return `<td><select class="input" style="max-width:150px" data-b="res.${code}.${idx}.v" data-live="1">${["","Negative","Positive"].map(x=>`<option ${r.v===x?"selected":""} value="${x}">${x||"Select"}</option>`).join("")}</select></td><td><input class="input" style="max-width:300px" placeholder="e.g. Oxycodone 1240" data-b="res.${code}.${idx}.c" value="${esc(r.c??"")}"></td><td class="small">${r.v?(()=>{const [t,k]=consistency(o,a.name,r);return `<span style="color:var(--${k})">${t}</span>`})():""}</td><td>${f?`<span class="flag ${f}">${f}</span>`:""}</td>`;
  return `<td><select class="input" style="max-width:220px" data-b="res.${code}.${idx}.v" data-live="1">${["",...a.opts].map(x=>`<option ${r.v===x?"selected":""} value="${esc(x)}">${esc(x||"Select")}</option>`).join("")}</select></td><td class="small muted" colspan="2">${a.cutoff?"Cutoff "+esc(a.cutoff):""}</td><td>${f?`<span class="flag ${f}">${f}</span>`:""}</td>`};
 return `<div class="crumb"><button data-a="go" data-v="queue">Accessioning</button> / <button data-a="openOrder" data-id="${o.id}">${o.accession}</button> / Results</div>
 <div class="page-h"><div><h1>Enter results</h1><p class="muted">${o.accession} · ${esc(pname(p))} · DOB ${fmtDOB(p.dob)}</p></div><div class="row"><button class="btn" data-a="fillNormals">Fill blanks with normals</button><button class="btn" data-a="saveResults">Save draft</button><button class="btn ok" data-a="release">${I.send} Release to provider</button></div></div>
 <div class="panel"><div class="panel-b re-grid">${o.tests.map(code=>{const t=T(code);const as=analytesFor(o,t);
  return `<div class="re-test"><div class="re-head"><b>${esc(t.name)}</b><span class="small muted">${esc(t.specimen)} · CPT ${isDef(code)?gcode(classCount(o.confirm)):esc(t.cpt)}</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Analyte</th>${isDef(code)?"<th>Result</th><th>Positive analytes</th><th>Consistency</th>":"<th>Result</th><th>Units</th><th>Reference</th>"}<th>Flag</th></tr></thead><tbody>${as.map((a,idx)=>`<tr><td class="nm small">${esc(a.name)}${a.type==="conf"&&o.meds.includes(a.name)?' <span class="tag">Rx</span>':""}</td>${cell(code,a,idx)}</tr>`).join("")}</tbody></table></div></div>`}).join("")}</div></div>
 <p class="xs muted" style="margin-top:10px">Flags: H high, L low, A abnormal, C critical. Critical values create a phone-call task for the clinic's critical-value number.</p>`}

function vClinics(){
 const list=[...S.clinics].sort((a,b)=>(a.status==="pending"?-1:1)-(b.status==="pending"?-1:1));
 return `<div class="page-h"><div><h1>Clinics</h1><p class="muted">${S.clinics.length} registered</p></div></div>
 <div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Clinic</th><th>NPI</th><th>Location</th><th>Providers</th><th>Orders</th><th>Status</th><th></th></tr></thead><tbody>${list.map(c=>`<tr><td><div class="nm">${esc(c.name)}</div><div class="xs muted">${esc(c.acct||"")} · ${esc(c.contactName)} · ${esc(c.contactEmail)}</div></td><td class="small">${c.npi}</td><td class="small">${esc(c.city)}, ${esc(c.state)}</td><td class="small">${c.providers.length}</td><td class="small">${S.orders.filter(o=>o.clinicId===c.id).length}</td><td>${badge(c.status)}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-a="viewClinic" data-id="${c.id}">Details</button> ${c.status==="pending"?`<button class="btn sm ok" data-a="approveClinic" data-id="${c.id}">Approve</button>`:c.status==="active"?`<button class="btn sm ghost" data-a="suspendClinic" data-id="${c.id}">Suspend</button>`:`<button class="btn sm" data-a="approveClinic" data-id="${c.id}">Reactivate</button>`}</td></tr>`).join("")}</tbody></table></div></div>`}

function vMenu(){const lab=isLab(),L=S.lab;
 return `<div class="page-h"><div><h1>Test menu</h1><p class="muted">Provider reference guide, effective September 2026. For pricing, collection requirements and turnaround times, contact ${esc(L.phone||"the lab")}${L.email?` or ${esc(L.email)}`:""}.</p></div></div>
 <div class="stack">${CATS.map(cat=>`<div class="panel"><div class="panel-h"><div><h2>${cat.name}</h2>${lab&&cat.id==="mol"?`<p class="small muted">Target lists are a starting set. Confirm them against the reference lab's validated panels.</p>`:""}${cat.id==="blood"?`<p class="small muted">Calculated biomarkers are derived automatically when the panels they depend on are on the same order.</p>`:""}</div><span class="small muted">${cat.note}</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Test</th><th>Specimen</th><th>CPT</th><th>${cat.id==="blood"?"Biomarkers":cat.id==="mol"?"Targets and analytes":"Analytes"}</th></tr></thead><tbody>${TESTS.filter(t=>t.cat===cat.id).map(t=>`<tr><td style="vertical-align:top;min-width:190px"><div class="nm">${esc(t.name)}</div>${lab?`<div class="xs muted">${ROUTE_NAME[routeOf(t.code)]}</div>`:""}${t.abn?`<div class="xs muted">ABN may apply for Medicare</div>`:""}${t.fasting?`<div class="xs muted">Fasting preferred</div>`:""}</td><td class="small" style="vertical-align:top;min-width:150px">${esc(t.specimen)}</td><td class="small" style="vertical-align:top">${esc(t.cpt)}</td><td class="small" style="vertical-align:top">${t.dynamic?DEF[t.spec].map(([g,l])=>`<div style="margin-bottom:6px"><span class="xs muted">${esc(g)}</span><br>${l.map(x=>`<span class="tag">${esc(x)}</span>`).join("")}</div>`).join(""):t.analytes.map(a=>`<span class="tag">${cat.id==="blood"?BIO_NUM[a.name]+". ":""}${esc(a.name)}${a.type==="calc"?" (calc)":""}</span>`).join("")}</td></tr>`).join("")}</tbody></table></div></div>`).join("")}</div>`}

function vOutbox(){const list=[...S.outbox].sort((a,b)=>b.at-a.at),q=list.filter(x=>x.status==="Queued").length,f=list.filter(x=>x.status==="Failed").length;
 const st=x=>x.channel==="Phone (critical)"?(x.status!=="Completed"?`<button class="btn sm danger" data-a="logCall" data-id="${x.id}">Document call</button>`:`<span class="badge st-released">Completed</span>`)
  :x.status==="Sent"?`<span class="badge st-released">Sent</span>`:x.status==="Queued"?`<span class="badge st-pending">Queued</span>`:x.status==="Failed"?`<span class="badge st-rejected">Failed</span>`:`<span class="badge">${esc(x.status)}</span>`;
 return `<div class="page-h"><div><h1>Notification log</h1><p class="muted">Result alerts to providers by email, text and fax.</p></div><div class="row">${f?`<button class="btn" data-a="retryAlerts">Retry ${f} failed</button>`:""}${q?`<button class="btn primary" data-a="sendAlerts" ${alertBusy?"disabled":""}>${alertBusy?"Sending…":`Send ${q} queued now`}</button>`:""}</div></div>
 <div class="banner info" style="margin-bottom:18px">${I.info}<div>Emails and texts say only that results are ready and link to the portal; they contain no patient information. Faxes carry the full report with a confidentiality notice and go to the clinic's fax number on file.</div></div>
 <div class="panel">${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Channel</th><th>To</th><th>Order</th><th>Status</th></tr></thead><tbody>${list.map(x=>{const o=x.orderId?orderOf(x.orderId):null;return `<tr><td class="small">${fmtDT(x.at)}</td><td class="small"><b>${esc(x.channel)}</b>${x.crit?' <span class="flag C">Critical</span>':""}</td><td class="small">${esc(x.to)}</td><td class="small">${o?`<button class="link" data-a="openOrder" data-id="${o.id}">${o.accession}</button>`:""}</td><td>${st(x)}${x.detail?`<div class="xs muted" style="max-width:340px">${esc(x.detail)}</div>`:""}${x.sentAt?`<div class="xs faint">${fmtDT(x.sentAt)}</div>`:""}</td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty"><h3>No alerts yet</h3><p>Release a result to send the first one.</p></div>`}</div>`}

function vLabSet(){if(!labForm)labForm=JSON.parse(JSON.stringify(S.lab));
 const i=(k,l,o={})=>`<div class="field ${o.cls||""}"><label>${l}</label><input class="input" data-b="labf.${k}" value="${esc(labForm[k]??"")}"></div>`;
 return `<div class="page-h"><div><h1>Lab settings</h1><p class="muted">Shown in the header of every patient report.</p></div><button class="btn primary" data-a="saveLab">Save changes</button></div>
 <div class="stack"><div class="panel"><div class="panel-h"><h2>Laboratory profile</h2></div><div class="panel-b grid g2">${i("name","Laboratory name")}${i("clia","CLIA number")}${i("address","Address",{cls:"spanall"})}${i("phone","Phone")}${i("email","Email")}<div class="grid g2">${i("director","Laboratory director")}${i("directorCred","Credentials")}</div></div></div>
 <div class="panel"><div class="panel-h"><h2>Billing and send-outs</h2></div><div class="panel-b grid g2">${i("npi","Lab NPI (billing provider)")}${i("taxId","Lab Tax ID")}${i("refLab","Reference lab name")}${i("billingCo","Billing company")}<label class="check spanall"><input type="checkbox" data-b="labf.billRef" ${labForm.billRef?"checked":""}>Bill reference-lab tests on our claims (only if you have a purchased-service arrangement with the reference lab). Off means the reference lab bills them.</label></div></div></div>`}

/* ---------- documents ---------- */
function paperHead(title,o){const L=S.lab;return `<div class="ph"><div><img src="${LOGO}" alt="First Bio Genetics"><div style="margin-top:8px;font-size:11.5px;color:#5d687c">${esc(L.address)}${L.phone?` · ${esc(L.phone)}`:""}${L.email?` · ${esc(L.email)}`:""}${L.clia?`<br>CLIA ${esc(L.clia)}`:""}</div></div><div style="text-align:right"><h2 style="font-size:18px">${title}</h2><svg class="bc" data-v="${o.accession}"></svg></div></div>`}
function metaBlock(o){const p=patientOf(o.patientId),c=clinicOf(o.clinicId),pr=provOf(o);const m=(k,v)=>`<div><span>${k}</span><b>${v}</b></div>`;
 return `<div class="meta">${m("Patient",esc(pname(p)))}${m("DOB / Sex",`${fmtDOB(p.dob)} · ${p.sex}`)}${m("MRN",p.mrn)}${m("Ordering provider",`${esc(pr?.name)}, ${esc(pr?.cred)}`)}${m("Provider NPI",pr?.npi)}${m("Client",esc(c.name)+(c.acct?` (${c.acct})`:""))}${m("Accession",o.accession)}${m("Collected",fmtDT(o.collectedAt))}${m("Received",fmtDT(o.history.find(h=>h.s==="Received")?.at))}${o.releasedAt?m("Reported",fmtDT(o.releasedAt)):m("Billing type",`${esc(o.billType||p.ins.type)} ${esc(p.ins.member)}`)}${m("Diagnosis",o.icd.map(esc).join(", "))}${m("Specimen",[...new Set(o.tests.map(c=>T(c).specimen))].map(esc).join(", "))}</div>`}
function showRequisition(id){DB.logView("orders",id,"requisition");lastDoc={tbl:"orders",id,what:"requisition"};const o=S.orders.find(x=>x.id===id),p=patientOf(o.patientId),cons=o.consents||{};
 const specs=[...new Set(o.tests.map(c=>T(c).specimen))];
 const html=`<div class="paper">${paperHead("Test requisition",o)}${metaBlock(o)}
 <div class="sect"><h3>Tests ordered</h3><table><thead><tr><th>Code</th><th>Test</th><th>CPT</th><th>Specimen</th></tr></thead><tbody>${o.tests.map(c=>`<tr><td>${c}</td><td>${esc(T(c).name)}</td><td>${isDef(c)?gcode(classCount(o.confirm)):esc(T(c).cpt)}</td><td>${esc(T(c).specimen)}</td></tr>`).join("")}</tbody></table></div>
 ${!o.toxSpec&&(o.meds.length||o.medsText)?`<div class="sect"><h3>Reported medications</h3><p>${o.meds.map(esc).join(", ")}${o.medsText?`<br>${esc(o.medsText)}`:""}</p></div>`:""}
 ${toxReqSection(o)}<div class="sect"><h3>Signatures</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:8px">${[["Patient consent",cons.patient],["Genetic consent",cons.genetic],["ABN",cons.abn],["Provider attestation",cons.provider]].filter(x=>x[1]).map(([l,s])=>`<div>${s.sig?`<img src="${s.sig}" style="height:48px;display:block" alt="">`:`<div style="height:48px;font-size:11px;color:#5d687c;padding-top:16px">${s.paper||s.method==="paper"?"Signed on paper requisition":"Consent on file at practice"}</div>`}<div style="border-top:1px solid #0e1726;font-size:11px;padding-top:3px">${l}${s.choice?` (option ${s.choice})`:""} · ${fmtD(s.at)}</div></div>`).join("")}</div></div>
 ${p.ins.cardFront||p.ins.cardBack?`<div class="sect"><h3>Insurance card</h3><div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">${["cardFront","cardBack"].filter(k=>p.ins[k]).map(k=>`<img src="${p.ins[k]}" style="width:300px;max-width:100%;border:1px solid #d3dae5;border-radius:6px" alt="">`).join("")}</div></div>`:""}<div class="sect"><h3>Specimen labels</h3><div class="labels">${specs.map((sp,i)=>`<div class="label"><b>${esc(p.last)}, ${esc(p.first)}</b> · DOB ${fmtDOB(p.dob)}<br>${esc(sp)} · ${fmtDT(o.collectedAt)}<svg class="bc" data-v="${o.accession}" data-small="1"></svg>${o.accession}-${i+1}</div>`).join("")}</div></div></div>`;
 modal(`Requisition ${o.accession}`,html,{wide:1,print:1})}
// Plain data version of the report, used to build the faxed PDF on the server.
function reportModel(o){const p=patientOf(o.patientId),c=clinicOf(o.clinicId),pr=provOf(o),L=S.lab;computeFlags(o,p.sex);
 return {lab:{name:L.name,address:L.address,phone:L.phone,email:L.email,clia:L.clia,director:[L.director,L.directorCred].filter(Boolean).join(", ")},
  accession:o.accession,patient:{name:pname(p),dob:fmtDOB(p.dob),sex:p.sex,mrn:p.mrn},provider:pr?`${pr.name}, ${pr.cred}`:"",npi:pr?pr.npi:"",clinic:c.name,acct:c.acct||"",
  collected:fmtDT(o.collectedAt),received:fmtDT((o.history.find(h=>h.s==="Received")||{}).at),reported:fmtDT(o.releasedAt),releasedBy:(o.history.find(h=>h.s==="Released")||{}).by||"",
  icd:o.icd.join(", "),specimen:[...new Set(o.tests.map(x=>T(x).specimen))].join(", "),flags:o.flags,
  sections:o.tests.map(code=>{const t=T(code),as=analytesFor(o,t),R=o.results[code]||{};
   if(isDef(code)){const notT=o.meds.filter(m=>!o.confirm.includes(m));return {title:t.name,performedBy:L.name,cols:["Drug","Rx","Result","Positive analytes (ng/mL)","Consistency"],
    rows:as.map(a=>{const r=R[a.name]||{},[ct,k]=consistency(o,a.name,r);return {cells:[a.name,o.meds.includes(a.name)?"Rx":"",r.v||"",r.c||"",ct],flag:k==="warn"}}),
    note:notT.length?`Prescribed but not ordered for definitive testing: ${notT.join(", ")}.`:""}}
   return {title:t.name,performedBy:routeOf(code)==="ref"?(L.refLab||"reference laboratory"):L.name,cols:["Analyte","Result","Flag","Units","Reference"],
    rows:as.map(a=>{const r=R[a.name]||{},f=flagOf(a,r,p.sex),q=a.type==="quant"||a.type==="calc";return {cells:[a.name+(a.type==="calc"?" (calculated)":""),r.v||(a.type==="calc"?"Not calculated":""),f,q?a.unit:"",q?rangeText(a,p.sex):a.cutoff?"Cutoff "+a.cutoff:a.opts?a.opts[0]:""],flag:!!f,crit:f==="C"}}),
    note:t.cat==="tox"?"Presumptive screening results. EtG is reported from the screen only; definitive EtG testing is not performed on urine. Other positive results should be confirmed by definitive testing before clinical action.":""}})}}
function showReport(id){DB.logView("orders",id,"report");lastDoc={tbl:"orders",id,what:"report"};const o=S.orders.find(x=>x.id===id),L=S.lab,P=patientOf(o.patientId);computeFlags(o,P.sex);
 const body=o.tests.map(code=>{const t=T(code),as=analytesFor(o,t),R=o.results[code]||{};
  if(isDef(code)){const notT=o.meds.filter(m=>!o.confirm.includes(m));return `<div class="sect"><h3>${esc(t.name)} <span style="font-weight:400;font-size:11px;color:#5d687c">Performed by ${esc(S.lab.name)}</span></h3><table><thead><tr><th>Drug</th><th>Rx</th><th>Result</th><th>Positive analytes (ng/mL)</th><th>Consistency</th></tr></thead><tbody>${as.map(a=>{const r=R[a.name]||{},[ct,k]=consistency(o,a.name,r);return `<tr class="${k==="warn"?"abn-row":""}"><td>${esc(a.name)}</td><td>${o.meds.includes(a.name)?"Rx":""}</td><td><b>${esc(r.v||"—")}</b></td><td>${esc(r.c||"")}</td><td>${ct}</td></tr>`}).join("")}</tbody></table>${notT.length?`<p style="font-size:11px;color:#5d687c;margin-top:6px">Prescribed but not ordered for definitive testing: ${notT.map(esc).join(", ")}.</p>`:""}</div>`}
  return `<div class="sect"><h3>${esc(t.name)} <span style="font-weight:400;font-size:11px;color:#5d687c">Performed by ${routeOf(code)==="ref"?esc(S.lab.refLab||"reference laboratory"):esc(S.lab.name)}</span></h3><table><thead><tr><th>Analyte</th><th>Result</th><th>Flag</th><th>Units</th><th>Reference</th></tr></thead><tbody>${as.map(a=>{const r=R[a.name]||{},f=flagOf(a,r,P.sex);return `<tr class="${f==="C"?"crit-row":f?"abn-row":""}"><td>${a.type==="calc"?`${esc(a.name)} <span style="font-size:10.5px;color:#6b7589">calculated</span>`:esc(a.name)}</td><td><b>${esc(r.v||(a.type==="calc"?"Not calculated":"—"))}</b></td><td>${f?`<span class="flag ${f}">${f}</span>`:""}</td><td>${a.type==="quant"||a.type==="calc"?esc(a.unit):""}</td><td>${a.type==="quant"||a.type==="calc"?rangeText(a,P.sex):a.cutoff?"Cutoff "+esc(a.cutoff):a.opts?esc(a.opts[0]):""}</td></tr>`}).join("")}</tbody></table>${t.cat==="tox"?`<p style="font-size:11px;color:#5d687c;margin-top:6px">Presumptive screening results. EtG is reported from the screen only; definitive EtG testing is not performed on urine. Other positive results should be confirmed by definitive testing before clinical action.</p>`:""}</div>`}).join("");
 const html=`<div class="paper">${paperHead("Laboratory report",o)}${metaBlock(o)}${body}
 <div class="foot">Released ${fmtDT(o.releasedAt)} by ${esc(o.history.find(h=>h.s==="Released")?.by||"")}. Laboratory director: ${esc(L.director)}${L.directorCred?", "+esc(L.directorCred):""}.<br>Flags: H high, L low, A abnormal, C critical. Results should be interpreted by the ordering provider in the context of the patient's clinical presentation.</div></div>`;
 modal(`Report ${o.accession}`,html,{wide:1,print:1})}

/* ---------- modal ---------- */
function modal(title,body,o={}){$("#modal-root").innerHTML=`<div class="modal-bg" data-a="bgClose"><div class="modal ${o.wide?"wide":""} ${refreshing?"noanim":""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><div class="row">${o.print?`<button class="btn sm" data-a="print">${I.print} Print</button>`:""}<button class="icon-btn" data-a="closeModal" aria-label="Close">${I.x}</button></div></div><div class="${o.print?"":"modal-b"}">${body}</div>${o.foot?`<div class="modal-f">${o.foot}</div>`:""}</div></div>`;
 document.querySelectorAll("#modal-root svg.bc").forEach(s=>{try{if(window.JsBarcode)JsBarcode(s,s.dataset.v,{format:"CODE128",height:s.dataset.small?38:44,width:s.dataset.small?1.3:1.6,displayValue:!s.dataset.small,fontSize:12,margin:0,background:"transparent"});else s.outerHTML=`<div style="font-weight:700;letter-spacing:.08em">${esc(s.dataset.v)}</div>`}catch(e){}});
 initSigs()}
function closeModal(){$("#modal-root").innerHTML="";openForm=null;ptForm=null;provForm=null;rej=null}
let openForm=null,refreshing=false;
function formModal(kind){openForm=kind;
 if(kind==="patient")modal(ptForm.id?"Edit patient":"Add patient",patientForm(),{foot:`<button class="btn" data-a="closeModal">Cancel</button><button class="btn primary" data-a="savePatient">${ptForm.id?"Save changes":"Add patient"}</button>`});
 if(kind==="prov"){const f=provForm,i=(k,l,o={})=>`<div class="field ${o.cls||""}"><label class="${o.req?"req":""}">${l}</label><input class="input" data-b="prov.${k}" value="${esc(f[k]??"")}"></div>`;
  modal(f.id?"Edit provider":"Add provider",`<div class="grid g2">${i("name","Full name",{req:1})}${i("cred","Credentials",{req:1})}${i("npi","Individual NPI",{req:1})}${i("phone","Mobile for text alerts")}${i("email","Email for result alerts",{req:1,cls:"spanall"})}</div>`,{foot:`<button class="btn" data-a="closeModal">Cancel</button><button class="btn primary" data-a="saveProv">Save provider</button>`})}
 if(kind==="reject")modal("Reject specimen",`<div class="field"><label class="req">Reason</label><select class="input" data-b="rej.reason">${["","Quantity not sufficient","Specimen leaked in transit","Unlabeled or mislabeled specimen","Received outside stability window","Wrong specimen type","Missing required signature"].map(x=>`<option ${rej.reason===x?"selected":""} value="${x}">${x||"Select a reason"}</option>`).join("")}</select></div><p class="small muted" style="margin-top:12px">The clinic is notified and asked to recollect.</p>`,{foot:`<button class="btn" data-a="closeModal">Cancel</button><button class="btn danger" data-a="confirmReject">Reject specimen</button>`});
 if(kind==="call"){modal("Document critical value call",`<div class="grid"><div class="field"><label class="req">Spoke with</label><input class="input" data-b="rej.who" value="${esc(rej.who||"")}" placeholder="Name and role"></div><label class="check"><input type="checkbox" data-b="rej.readback" ${rej.readback?"checked":""}>Result was read back and confirmed</label></div>`,{foot:`<button class="btn" data-a="closeModal">Cancel</button><button class="btn primary" data-a="confirmCall">Save call record</button>`})}
}
function clinicModal(id){const c=clinicOf(id);const row=(k,v)=>`<tr><td class="muted small" style="width:180px">${k}</td><td class="small">${v}</td></tr>`;
 modal(c.name,`<div class="tbl-wrap"><table class="tbl"><tbody>${row("Status",badge(c.status))}${row("Group NPI",c.npi)}${row("Tax ID",esc(c.taxId))}${row("Specialty",esc(c.specialty))}${row("Address",`${esc(c.address)}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.zip)}`)}${row("Phone / fax",`${esc(c.phone)} / ${esc(c.fax||"—")}`)}${row("Primary contact",`${esc(c.contactName)} · ${esc(c.contactEmail)}`)}${row("Critical value phone",esc(c.notify.criticalPhone))}${row("Alerts",["email","sms","fax"].filter(k=>c.notify[k]).join(", ")||"None")}${row("Providers",c.providers.map(p=>`${esc(p.name)}, ${esc(p.cred)} · NPI ${p.npi}`).join("<br>"))}${row("Agreement",`<img class="sig-img" src="${c.agreement?.sig}" alt=""><div class="xs muted">${esc(c.agreement?.signer)}, ${esc(c.agreement?.title)} · ${fmtD(c.agreement?.date)}</div>`)}</tbody></table></div><p class="xs muted" style="margin-top:12px">Before approving, verify each NPI in the NPPES registry.</p>`,{foot:c.status==="pending"?`<button class="btn" data-a="closeModal">Close</button><button class="btn ok" data-a="approveClinic" data-id="${c.id}">Approve clinic</button>`:""})}

/* ---------- lab workflow ---------- */
function advance(o,s,note){o.status=s;o.history.push({s,at:Date.now(),by:me().name,note});save()}
function releaseOrder(o){
 const missing=[];o.tests.forEach(code=>analytesFor(o,T(code)).forEach(a=>{if(a.type==="calc")return;const r=(o.results[code]||{})[a.name];if(!r||r.v===""||r.v==null)missing.push(a.name)}));
 if(missing.length){toast(`${missing.length} result${missing.length>1?"s are":" is"} blank. Fill them before release.`);return false}
 storeCalcs(o,patientOf(o.patientId));computeFlags(o);advance(o,"Released");o.releasedAt=Date.now();o.readAt=null;
 const c=clinicOf(o.clinicId),pr=provOf(o),p=patientOf(o.patientId),crit=o.flags.crit>0;
 pushNote(c.id,o.id,crit?"Critical result":"Results ready",`${o.accession} for ${p.first} ${p.last[0]}. is released${crit?" with a critical value":""}.`,crit?"crit":"ok");
 const msg=`First Bio Genetics: ${crit?"a CRITICAL result":"new results"} for accession ${o.accession} ${crit?"is":"are"} ready. Sign in to the portal to view.`;
 const log=(channel,to,status,extra)=>S.outbox.push({id:uid("m"),at:Date.now(),channel,to,msg,status:status||"Queued",orderId:o.id,crit,...(extra||{})});
 if(c.notify.email&&pr?.email)log("Email",`${pr.name} <${pr.email}>`,null,{dest:pr.email});
 if(c.notify.sms&&pr?.phone)log("Text",`${pr.name} ${pr.phone}`,null,{dest:pr.phone});
 if(c.notify.fax&&c.fax)log("Fax",`${c.name} ${c.fax}`,null,{dest:c.fax,report:reportModel(o)});
 if(crit)log("Phone (critical)",`${c.name} ${c.notify.criticalPhone}`,"Action needed");
 buildClaim(o);save();return true}

/* ---------- actions ---------- */
const A={
 go:e=>{const d=e.dataset;ui.gq="";if(d.v==="entry")resEdit=null;if(d.v==="order-new"&&!draft)draft=null;if(d.v==="settings")cs=null;if(d.v==="labset")labForm=null;go(d.v,{id:d.id})},
 login(){const u=S.users.find(x=>x.email.toLowerCase()===lf.email.trim().toLowerCase()&&x.pw===lf.pw);if(!u)return toast("That email and password don't match an account.");S.session=u.id;save();lf={email:"",pw:""};go("dash")},
 demo:e=>{S.session=e.dataset.id;save();go("dash")},
 logout(){S.session=null;save();draft=null;cs=null;route={v:"login",p:{}};render()},
 startReg(){reg=newReg();sigs={};route={v:"register",p:{}};render()},
 cancelReg(){reg=null;route={v:"login",p:{}};render()},
 regAddProv(){reg.providers.push({name:"",cred:"",npi:"",email:"",phone:""});render()},
 regDelProv:e=>{reg.providers.splice(+e.dataset.i,1);render()},
 regBack(){reg.step--;render()},
 async regNext(){const r=reg;
  if(r.step===1){if(!r.name.trim()||!/^\d{10}$/.test(r.npi.trim())||!r.taxId.trim()||!r.phone.trim()||!r.address.trim()||!r.city.trim()||!r.state.trim()||!r.zip.trim())return toast("Complete the required fields. NPI must be 10 digits.")}
  if(r.step===2){if(r.providers.some(p=>!p.name.trim()||!/^\d{10}$/.test(p.npi.trim())||!p.email.includes("@")))return toast("Each provider needs a name, a 10-digit NPI and an email.")}
  if(r.step===3){if(!r.user.name.trim()||!r.user.email.includes("@")||r.user.pw.length<8)return toast("Add your name, email and a password of at least 12 characters.");if(r.user.pw.length<12)return toast("Use a password of at least 12 characters.");if(!r.notify.criticalPhone.trim())return toast("Add a phone number for critical values.")}
  if(r.step===4){if(!r.agree||!r.baa)return toast("Accept both agreements to continue.");if(!sigs.reg)return toast("Sign the agreement to continue.");
   const clinic={name:r.name.trim(),npi:r.npi.trim(),taxId:r.taxId,specialty:r.specialty,phone:r.phone,fax:r.fax,address:r.address,city:r.city,state:r.state,zip:r.zip,clia:r.clia,contactName:r.user.name,contactEmail:r.user.email.trim(),notify:{...r.notify},providers:r.providers.map(p=>({...p,id:uid("p")})),agreement:{signer:r.user.name,title:r.user.title,date:Date.now(),sig:sigs.reg}};
   if(submitting)return;submitting=true;
   try{const res=await DB.registerClinic(r.user.email.trim(),r.user.pw,r.user.name,clinic);regDone=r.user.email.trim();reg=null;sigs={};
    if(res==="confirm"){route={v:"confirm",p:{}};render()}else{toast("Registration submitted");await boot()}}
   catch(e){toast(errMsg(e))}finally{submitting=false}
   return}
  r.step++;sigs.reg=sigs.reg;render()},
 sigClear:e=>{delete sigs[e.dataset.k];const cv=document.querySelector(`canvas.sigc[data-k="${e.dataset.k}"]`);if(cv){const ctx=cv.getContext("2d");ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);ctx.restore();const l=cv.parentElement.querySelector(".sig-line");if(l)l.textContent="Sign with your mouse, finger or stylus"}},
 theme(){const dark=document.documentElement.getAttribute("data-theme")==="dark"||(!S.theme&&matchMedia("(prefers-color-scheme: dark)").matches);S.theme=dark?"light":"dark";applyTheme();save()},
 resetDemo(){if(!confirm("Reset all demo data in this browser?"))return;const sess=S.session;S=seed();migrate();S.session=S.users.some(u=>u.id===sess)?sess:null;save();draft=null;cs=null;labForm=null;go("dash");toast("Demo data reset")},
 clearSearch(){ui.gq="";render()},
 goResults:e=>{ui.rstat=e.dataset.f==="open"?"open":"";ui.runread=e.dataset.f==="unread";go("results")},
 goQueue:e=>{ui.qstat=e.dataset.f;go("queue")},
 clearFilters(){Object.assign(ui,{rq:"",rstat:"",rcat:"",rfrom:"",rto:"",runread:false});render()},
 setUi:e=>{ui[e.dataset.k]=e.dataset.val;render()},
 openOrder:e=>{ui.gq="";go("order",{id:e.dataset.id})},
 openPatient:e=>{ui.gq="";go("patient",{id:e.dataset.id})},
 openNote:e=>{const n=S.notes.find(x=>x.id===e.dataset.id);n.read=true;save();go("order",{id:n.orderId})},
 readAll(){S.notes.filter(n=>n.aud===audience()).forEach(n=>n.read=true);save();render()},
 readCard,
 auditSearch(){loadAudit(false)},
 auditMore(){loadAudit(true)},
 auditFor:e=>{AU.q=e.dataset.q;AU.from=ymd(Date.now()-365*DAY,"-");AU.to=ymd(Date.now(),"-");AU.actor="";AU.action="";AU.rows=null;go("audit")},
 auditExport(){const q=v=>{v=String(v??"");return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v};const tmp=document.createElement("div");const txt=h=>{tmp.innerHTML=h;return tmp.textContent};
  const lines=[["Time","User","Activity","Record type","Record","Details"].join(",")].concat(AU.rows.map(r=>[new Date(r.at).toISOString(),auditWho(r.actor),ACT_LBL[r.action]||r.action,TBL_LBL[r.tbl]||r.tbl,txt(auditRecord(r)),txt(auditDetail(r))].map(q).join(",")));
  saveFile(`FBG_audit_${AU.from}_to_${AU.to}.csv`,lines.join("\r\n"))},
 newReq(){draft=newDraft();sigs={};go("order-new")},
 scanRemove:e=>{draft.scans.splice(+e.dataset.i,1);render()},
 cardRemove:e=>{if(ptForm){delete ptForm.ins[e.dataset.k];render()}},
 viewCard:e=>modal("Insurance card",`<img src="${e.getAttribute("src")}" alt="Insurance card" style="width:100%;border-radius:8px">`,{}),
 newPatient(){ptForm=blankPatient();formModal("patient")},
 editPatient:e=>{ptForm=JSON.parse(JSON.stringify(patientOf(e.dataset.id)));formModal("patient")},
 savePatient(){const isNew=!ptForm.id;const p=savePatientForm();if(!p)return;closeModal();toast(isNew?"Patient added":"Patient updated");go("patient",{id:p.id})},
 orderFor:e=>{draft=newDraft(e.dataset.id);sigs={};go("order-new")},
 cancelOrder(){if(!confirm("Discard this order? Anything entered will be lost."))return;draft=null;sigs={};go("dash")},
 draftNewPt(){draft.newPt=true;ptForm=blankPatient();render()},
 draftPickExisting(){draft.newPt=false;ptForm=null;render()},
 draftPick:e=>{draft.patientId=e.dataset.id;render()},

 draftSet:e=>{const k=e.dataset.k,v=e.dataset.val;draft[k]=k==="stat"?v==="1":v;render()},
 toggleTest:e=>{const c=e.dataset.id,t=draft.tests;const i=t.indexOf(c);if(i>=0)t.splice(i,1);else{t.push(c)}render()},
 toggleArr:e=>{const a=draft[e.dataset.k],v=e.dataset.val,i=a.indexOf(v);if(i>=0)a.splice(i,1);else a.push(v);render()},
 confPreset:e=>{draft.confirm=e.dataset.p==="pain"?[...PRESET[draft.toxSpec]]:e.dataset.p==="all"?defList(draft.toxSpec):[];render()},
 allBlood(){const b=TESTS.filter(x=>x.cat==="blood").map(x=>x.code),all=b.every(c=>draft.tests.includes(c));draft.tests=draft.tests.filter(c=>!b.includes(c));if(!all)draft.tests.push(...b);render()},
 addNeeds(){[...new Set(draft.tests.flatMap(c=>T(c).needs||[]))].forEach(c=>{if(!draft.tests.includes(c))draft.tests.push(c)});render()},
 poctSet:e=>{const c=e.dataset.c,r=draft.poct[c]=draft.poct[c]||{};r.r=r.r===e.dataset.val?"":e.dataset.val;render()},
 poctFlag:e=>{const c=e.dataset.c,f=e.dataset.f,r=draft.poct[c]=draft.poct[c]||{};r[f]=!r[f];if(f==="def"){const map=SCREEN14.find(x=>x[0]===c)[3];if(r.def)map.forEach(an=>{if(!draft.confirm.includes(an))draft.confirm.push(an)});else draft.confirm=draft.confirm.filter(an=>!map.includes(an))}render()},
 addIcd(){const v=draft.icdFree.trim().toUpperCase();if(!/^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$/.test(v))return toast("Enter a valid ICD-10 code, like M54.50.");if(!draft.icd.includes(v))draft.icd.push(v);draft.icdFree="";render()},
 ordBack(){draft.step--;render()},
 ordNext(){if(!ordValidate())return;if(draft.step===4)return submitOrder();draft.step++;window.scrollTo(0,0);render()},
 req:e=>showRequisition(e.dataset.id),
 report:e=>showReport(e.dataset.id),
 print(){if(lastDoc)DB.log("print",lastDoc.tbl,lastDoc.id,{what:lastDoc.what});document.body.classList.add("printing");setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove("printing"),300)},50)},
 closeModal,
 bgClose:(e,ev)=>{if(ev.target===e)closeModal()},
 saveClinic(){const c=myClinic();Object.assign(c,{name:cs.name,npi:cs.npi,taxId:cs.taxId,phone:cs.phone,fax:cs.fax,address:cs.address,city:cs.city,state:cs.state,zip:cs.zip,notify:cs.notify});save();cs=null;render();toast("Changes saved")},
 addProv(){provForm={name:"",cred:"",npi:"",email:"",phone:""};formModal("prov")},
 editProv:e=>{provForm={...myClinic().providers.find(p=>p.id===e.dataset.id)};formModal("prov")},
 saveProv(){const f=provForm;if(!f.name.trim()||!f.cred.trim()||!/^\d{10}$/.test(String(f.npi).trim())||!String(f.email).includes("@"))return toast("Add name, credentials, a 10-digit NPI and an email.");const c=myClinic();if(f.id)Object.assign(c.providers.find(p=>p.id===f.id),f);else c.providers.push({...f,id:uid("p")});save();closeModal();cs=null;render();toast("Provider saved")},
 receive:e=>{const o=S.orders.find(x=>x.id===e.dataset.id);if(clinicOf(o.clinicId).status!=="active")return toast("Approve this clinic before receiving its specimens.");advance(o,"Received");render();toast("Specimen received")},
 startTesting:e=>{advance(S.orders.find(x=>x.id===e.dataset.id),"In Process");render();toast("Testing started")},
 reject:e=>{rej={id:e.dataset.id,reason:""};formModal("reject")},
 confirmReject(){if(!rej.reason)return toast("Choose a reason.");const o=S.orders.find(x=>x.id===rej.id);o.rejectReason=rej.reason;advance(o,"Rejected",rej.reason);const p=patientOf(o.patientId);pushNote(o.clinicId,o.id,"Specimen rejected",`${o.accession} for ${p.first} ${p.last[0]}.: ${rej.reason}. Please recollect.`,"crit");save();closeModal();render();toast("Specimen rejected, clinic notified")},
 fillNormals(){const o=S.orders.find(x=>x.id===route.p.id);const tmp={...o,results:JSON.parse(JSON.stringify(resEdit))};fillDefaults(tmp,true,patientOf(o.patientId).sex);resEdit={...tmp.results,_id:o.id};render()},
 saveResults(){const o=S.orders.find(x=>x.id===route.p.id);const r={...resEdit};delete r._id;o.results=r;save();toast("Draft saved")},
 release(){const o=S.orders.find(x=>x.id===route.p.id);const r={...resEdit};delete r._id;o.results=r;const add=reflexCheck(o);if(add.length){save();resEdit=null;render();return toast(`Positive screen: ${add.length} definitive test${add.length>1?"s":""} added. Run them on the SCIEX before releasing.`)}if(!releaseOrder(o))return;resEdit=null;go("order",{id:o.id});toast(o.flags.crit?"Released. Critical call task created.":"Released. Sending provider alerts…");sendAlertsNow(false)},
 viewClinic:e=>clinicModal(e.dataset.id),
 approveClinic:e=>{const c=clinicOf(e.dataset.id);c.status="active";pushNote(c.id,null,"Your clinic is approved","First Bio Genetics approved your account. Specimens you send will now be processed.","ok");save();closeModal();render();toast(`${c.name} approved`)},
 suspendClinic:e=>{if(!confirm("Suspend this clinic? Its users can still sign in, but new specimens won't be received."))return;clinicOf(e.dataset.id).status="suspended";save();render()},
 logCall:e=>{rej={id:e.dataset.id,who:"",readback:false};formModal("call")},
 confirmCall(){if(!rej.who.trim()||!rej.readback)return toast("Record who you spoke with and confirm read-back.");const x=S.outbox.find(m=>m.id===rej.id);x.status="Completed";x.detail=`Spoke with ${rej.who}, read-back confirmed · ${me().name}`;save();closeModal();render();toast("Call documented")},
 saveLab(){S.lab={...labForm};save();labForm=null;render();toast("Changes saved")},
 scanAcc(){const q=ui.qq.trim().toUpperCase();const o=S.orders.find(x=>x.accession===q);if(o){ui.qq="";go("order",{id:o.id})}},
};

/* ---------- routing, instruments, send-outs, billing ---------- */
I.chip=ic('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>');
I.dollar=ic('<path d="M12 3v18M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.2-4.5 3.2c0 4.3 9 2.3 9 6.8 0 2-2 3.3-4.5 3.3s-4.5-1.2-4.5-3.2"/>');
const ROUTE={UDS:"c560",CONF:"sciex"};const routeOf=c=>ROUTE[c]||"ref";
const ROUTE_NAME={c560:"Yumizen C560",sciex:"SCIEX 4500",ref:"Reference lab"};
const C560_MAP=Object.fromEntries(SCREEN14.map(([c,n])=>[c,n]));
const CM=(...a)=>a.map(([name,cutoff])=>({name,cutoff}));
const FEES_DEFAULT_OLD={"80307":95,"80305":45,"G0480":165,"G0481":225,"G0482":285,"G0483":345,"87798":85,"87150":45,"87633":415,"87637":145,"87491":55,"87591":55,"87661":55,"87563":55,"81225":300,"81226":300,"81227":300,"85025":12,"80053":16,"80061":20,"83036":15,"84443":25,"82306":45,"84403":40,"84153":28};
const FEES_DEFAULT={"80307":95,"G0480":165,"G0481":225,"G0482":285,"G0483":345,"87798":85,"87150":45,"81003":8,"82043":12,"82570":10,"85025":12,"80053":16,"80061":20,"83540":15,"83550":18,"84466":20,"82248":10,"82977":15,"82239":35,"83735":12,"84100":10,"83036":15,"84550":10,"82550":12,"83615":12,"83605":20,"83090":35,"82670":40,"84144":40,"84403":40,"84270":45,"82627":40,"83001":35,"83002":35,"84146":35,"84443":25,"84481":35,"84439":20,"84480":30,"84436":15,"86376":30,"86800":35,"83525":25,"84681":40,"82607":30,"82306":45,"82533":30,"82728":25,"82746":30,"84153":28,"84154":35,"83970":55,"83690":15,"86141":25};
const LAB_DEFAULT={email:"",npi:"",taxId:"",refLab:"",billingCo:"",billRef:false};
function migrate(){S.lab={...LAB_DEFAULT,...S.lab};if(!S.fees)S.fees={...FEES_DEFAULT};if(!S.confMap||!S.confMap.Urine)S.confMap=defaultConfMap();if(!S.claims){S.claims=[];S.claimSeq=1;S.orders.filter(o=>o.status==="Released").sort((a,b)=>a.releasedAt-b.releasedAt).forEach(buildClaim)}}
Object.assign(ui,{cspec:"Urine",itab:"c560",btab:"ready",bsel:{},rsel:{},bfmt:"csv",paste_c560:"",paste_sciex:""});

const orderOf=id=>S.orders.find(o=>o.id===id);
const ymd=(t,sep="")=>{const d=new Date(t);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join(sep)};
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const fmtN=v=>v>=100?Math.round(v).toLocaleString("en-US"):String(Math.round(v*10)/10);
const money=n=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const inLab=o=>["Received","In Process"].includes(o.status);
const complete=(o,code)=>analytesFor(o,T(code)).every(a=>{if(a.type==="calc")return true;const r=(o.results[code]||{})[a.name];return r&&r.v!==""&&r.v!=null});
const pendingFor=code=>S.orders.filter(o=>o.tests.includes(code)&&inLab(o)&&!complete(o,code));
const refTests=o=>o.tests.filter(c=>routeOf(c)==="ref");
const refPending=()=>S.orders.filter(o=>inLab(o)&&refTests(o).length&&!o.sendout);
function markInProcess(o,note){if(o.status==="Received")o.status="In Process";o.history.push({s:o.status,at:Date.now(),by:me()?me().name:"",note})}

/* downloads (published page) with copy fallback */
let DL=null,fallbackCb=null;
(function tryDL(n){try{if(window.claude&&window.claude.use){window.claude.use("downloads").then(x=>{DL=x}).catch(()=>{});return}}catch(e){}if(n<20)setTimeout(()=>tryDL(n+1),300)})(0);
async function saveFile(name,data,onSaved){
 DB.log("export","files",name,{bytes:String(data).length});
 if(!window.claude){const a=document.createElement("a"),u=URL.createObjectURL(new Blob([data],{type:name.endsWith(".csv")?"text/csv":"text/plain"}));a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);onSaved&&onSaved();toast("File downloaded");return}
 if(DL){try{await DL.save({filename:name,data});onSaved&&onSaved();toast("File saved");return}catch(e){const c=e&&e.code;if(c==="declined"){toast("Save cancelled");return}if(c==="rate_limited"){toast("A save prompt is already open");return}}}
 fallbackCb=onSaved||null;
 modal(name,`<p class="small muted" style="margin-bottom:10px">Copy the contents below and save them as ${esc(name)}.</p><textarea id="fbText" class="input" style="min-height:300px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace" readonly>${esc(data)}</textarea>`,{foot:`<button class="btn" data-a="copyText">Copy to clipboard</button>${onSaved?`<button class="btn primary" data-a="fallbackDone">Mark as exported</button>`:""}`});
}

/* parsing */
function parseTable(text){const lines=String(text).replace(/\r/g,"").split("\n").filter(l=>l.trim());if(!lines.length)return{h:[],rows:[]};const d=lines[0].includes("\t")?"\t":",";
 const split=l=>{if(d==="\t")return l.split("\t").map(s=>s.trim());const out=[];let cur="",q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===","&&!q){out.push(cur.trim());cur=""}else cur+=ch}out.push(cur.trim());return out};
 return{h:split(lines[0]),rows:lines.slice(1).map(split)}}
const findOrderBySample=s=>{const v=String(s||"").trim().toUpperCase();if(!v)return null;return S.orders.find(o=>v===o.accession||v.startsWith(o.accession+"-"))};

function importC560(text){const {h,rows}=parseTable(text);const col=re=>h.findIndex(x=>re.test(x));
 const ci={id:col(/sample\s*id|^sample$|specimen/i),as:col(/assay|^test/i),r:col(/result|value/i)};
 if(ci.id<0||ci.as<0||ci.r<0)return{error:"Couldn't find SampleID, Assay and Result columns in the first row."};
 const touched=new Set(),unmatched=new Set(),unknown=new Set();let n=0;
 rows.forEach(r=>{const sid=r[ci.id];if(/^(qc|cal|ctrl|control)/i.test(sid||""))return;const o=findOrderBySample(sid);if(!o||!o.tests.includes("UDS")||!inLab(o)){if(sid)unmatched.add(sid);return}
  const an=C560_MAP[String(r[ci.as]||"").trim().toUpperCase()];if(!an){unknown.add(r[ci.as]);return}
  const a=T("UDS").analytes.find(x=>x.name===an),raw=String(r[ci.r]||"").trim();let v;
  if(/^pos/i.test(raw))v="Positive";else if(/^neg/i.test(raw))v="Negative";else{const num=parseFloat(raw);if(isNaN(num))return;v=num>=parseFloat(a.cutoff)?"Positive":"Negative"}
  o.results.UDS=o.results.UDS||{};o.results.UDS[an]={v,c:raw};touched.add(o);n++});
 touched.forEach(o=>{markInProcess(o,"Screen results imported from Yumizen C560");reflexCheck(o)});
 return{n,orders:[...touched],unmatched:[...unmatched],unknown:[...unknown]}}

function importSciex(text){const {h,rows}=parseTable(text);const col=re=>h.findIndex(x=>re.test(x));
 const ci={s:col(/^sample\s*name$/i),t:col(/^sample\s*type$/i),c:col(/^component\s*name$/i),v:col(/calculated\s*conc/i)};
 if(ci.s<0||ci.c<0||ci.v<0)return{error:"Couldn't find Sample Name, Component Name and Calculated Concentration columns."};
 const per=new Map(),unmatched=new Set();let n=0;
 rows.forEach(r=>{if(ci.t>=0&&r[ci.t]&&!/unknown/i.test(r[ci.t]))return;const name=r[ci.s];if(/^(blank|double|cal|std|standard|qc)/i.test(name||""))return;
  const o=findOrderBySample(name);if(!o||!o.tests.some(isDef)||!inLab(o)){if(name)unmatched.add(name);return}
  const m=per.get(o)||{};const k=norm(r[ci.c]);const v=parseFloat(String(r[ci.v]||"").replace(/,/g,""));m[k]=Math.max(m[k]||0,isNaN(v)?0:v);per.set(o,m);n++});
 per.forEach((m,o)=>{const dc=defCode(o),sp=specOf(o);o.results[dc]=o.results[dc]||{};o.confirm.forEach(cl=>{const comps=(S.confMap[sp]||{})[cl]||[];const seen=comps.filter(c=>norm(c.name) in m);if(!seen.length)return;
  const pos=seen.filter(c=>m[norm(c.name)]>=parseFloat(c.cutoff));o.results[dc][cl]={v:pos.length?"Positive":"Negative",c:pos.map(c=>`${c.name} ${fmtN(m[norm(c.name)])}`).join("; ")}});
  markInProcess(o,"Confirmation results imported from MultiQuant")});
 return{n,orders:[...per.keys()],unmatched:[...unmatched]}}

function exampleC560(){const pend=pendingFor("UDS");if(!pend.length)return"";const L=["SampleID,Assay,Result,Units"];
 pend.forEach((o,oi)=>Object.entries(C560_MAP).forEach(([code,an],ai)=>{const a=T("UDS").analytes.find(x=>x.name===an),cut=parseFloat(a.cutoff);let v=Math.round(cut*((ai*7+oi*3)%10)/40*10)/10;
  if(o.meds.some(m=>norm(m).startsWith(norm(an).slice(0,5))))v=cut*3;L.push(`${o.accession},${code},${v},ng/mL`)}));return L.join("\n")}
function exampleSciex(){const pend=[...pendingFor("CONF"),...pendingFor("CONFOF")];if(!pend.length)return"";const L=["Sample Name\tSample Type\tComponent Name\tCalculated Concentration"];const comps=Object.values(S.confMap.Urine).flat();
 ["Cal 3","QC Low"].forEach(n=>comps.slice(0,3).forEach(c=>L.push(`${n}\t${n.startsWith("Cal")?"Standard":"Quality Control"}\t${c.name}\t${c.cutoff*2}`)));
 pend.forEach(o=>{const sp=specOf(o);o.confirm.forEach(an=>((S.confMap[sp]||{})[an]||[]).forEach((c,i)=>{const pos=o.meds.includes(an)&&i===0;L.push(`${o.accession}\tUnknown\t${c.name}\t${pos?Math.round(c.cutoff*14*10)/10:"N/A"}`)}));L.push(`${o.accession}\tUnknown\tOxycodone-d6 (IS)\t50`)});
 return L.join("\n")}

function runImport(kind,text){if(!String(text||"").trim())return toast("Paste an export or choose a file first.");
 const res=kind==="c560"?importC560(text):importSciex(text);if(res.error)return toast(res.error);
 ui["paste_"+kind]="";resEdit=null;save();render();
 modal("Import complete",`<p>${res.n} result row${res.n===1?"":"s"} matched to ${res.orders.length} order${res.orders.length===1?"":"s"} from the ${kind==="c560"?"Yumizen C560":"SCIEX 4500"}.</p>
 ${res.orders.length?`<div class="tbl-wrap" style="margin-top:14px;border:1px solid var(--border);border-radius:var(--r-sm)"><table class="tbl"><tbody>${res.orders.map(o=>`<tr><td class="acc">${o.accession}</td><td class="small">${esc(pname(patientOf(o.patientId)))}</td><td style="text-align:right"><button class="btn sm primary" data-a="reviewOrder" data-id="${o.id}">Review and release</button></td></tr>`).join("")}</tbody></table></div>`:""}
 ${res.unmatched.length?`<div class="banner warn" style="margin-top:14px">${I.alert}<div><b>Not matched to an open order:</b> ${res.unmatched.map(esc).join(", ")}</div></div>`:""}
 ${res.unknown&&res.unknown.length?`<div class="banner warn" style="margin-top:10px">${I.alert}<div><b>Unknown assay codes:</b> ${res.unknown.map(esc).join(", ")}</div></div>`:""}`,{foot:`<button class="btn" data-a="closeModal">Close</button>`})}

/* instruments page */
function miniOrders(list,sel){if(!list.length)return `<div class="empty"><h3>Nothing waiting</h3><p>Received specimens routed here will appear in this list.</p></div>`;
 return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${sel?`<th style="width:40px"></th>`:""}<th>Accession</th><th>Patient</th><th>Clinic</th><th>Tests</th><th>Received</th><th>Status</th></tr></thead><tbody>${list.map(o=>{const p=patientOf(o.patientId);return `<tr>${sel?`<td><input type="checkbox" data-a="toggleSel" data-k="${sel}" data-id="${o.id}" ${ui[sel][o.id]?"checked":""} aria-label="Select ${o.accession}"></td>`:""}<td><button class="link acc" data-a="openOrder" data-id="${o.id}">${o.accession}</button>${o.stat?' <span class="flag C">STAT</span>':""}</td><td class="nm small">${esc(pname(p))}</td><td class="small">${esc(clinicOf(o.clinicId).name)}</td><td class="small">${(sel==="rsel"?refTests(o):o.tests).map(c=>`<span class="tag">${isDef(c)?`Def ×${o.confirm.length}`:c}</span>`).join("")}</td><td class="small">${fmtDT(o.history.find(h=>h.s==="Received")?.at)}</td><td>${badge(o.status)}</td></tr>`}).join("")}</tbody></table></div>`}
function importPanel(kind,title,help,example){return `<div class="panel"><div class="panel-h"><div><h2>${title}</h2><p class="small muted" style="max-width:70ch">${help}</p></div></div><div class="panel-b stack" style="gap:12px">
 <div class="row"><label class="btn">Choose file<input type="file" accept=".csv,.txt,.tsv" data-imp="${kind}" hidden></label><span class="small muted">or paste the export below</span></div>
 <textarea class="input" style="min-height:140px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace" data-b="ui.paste_${kind}" placeholder="${esc(example)}">${esc(ui["paste_"+kind])}</textarea>
 <div class="row"><button class="btn primary" data-a="doImport" data-k="${kind}">Import results</button><span class="xs muted">Imported results are saved as drafts. A technologist reviews each order before releasing it.</span></div></div></div>`}
function vInstruments(){const tab=ui.itab;
 const tabs=[["c560",`Yumizen C560 screens (${pendingFor("UDS").length})`],["sciex",`SCIEX 4500 definitive (${pendingFor("CONF").length+pendingFor("CONFOF").length})`],["ref",`Reference lab (${refPending().length})`],["cutoffs","Definitive cutoffs"]];
 let body="";
 if(tab==="c560"){const pend=pendingFor("UDS");
  body=`<div class="panel"><div class="panel-h"><div><h2>Screening worklist</h2><p class="small muted">${pend.length} received specimen${pend.length===1?"":"s"} waiting for immunoassay screening</p></div><button class="btn" data-a="c560Export" ${pend.length?"":"disabled"}>Export worklist (CSV)</button></div>${miniOrders(pend)}</div>
  ${importPanel("c560","Import screen results",`One row per assay with columns SampleID, Assay, Result. Assay codes: ${Object.keys(C560_MAP).join(", ")}. Numeric results at or above the panel cutoff are reported Positive; POS or NEG text also works. QC and calibrator rows are skipped.`,"SampleID,Assay,Result,Units")}`}
 if(tab==="sciex"){body=SPECS.map(sp=>{const pend=pendingFor(sp==="Urine"?"CONF":"CONFOF");return `<div class="panel"><div class="panel-h"><div><h2>${sp} batch</h2><p class="small muted">${pend.length} specimen${pend.length===1?"":"s"} waiting for definitive testing. The batch file includes a blank, six calibrators and bracketing QCs.</p></div><button class="btn" data-a="sciexBatch" data-m="${sp}" ${pend.length?"":"disabled"}>Export Analyst batch (CSV)</button></div>${miniOrders(pend)}</div>`}).join("")+`
  ${importPanel("sciex","Import MultiQuant results","Export the Results Table from MultiQuant, tab or comma separated. It needs Sample Name, Component Name and Calculated Concentration. Sample Type, when present, is used to skip standards and QCs. Components are matched to each ordered drug using the Definitive cutoffs tab, for urine or oral fluid according to the order.","Sample Name\tSample Type\tComponent Name\tCalculated Concentration")}`}
 if(tab==="ref"){const pend=refPending(),out=S.orders.filter(o=>o.sendout&&inLab(o)),nSel=pend.filter(o=>ui.rsel[o.id]).length;
  body=`<div class="panel"><div class="panel-h"><div><h2>Ready to send</h2><p class="small muted">Molecular and blood tests go to ${esc(S.lab.refLab||"your reference lab (set its name in Lab settings)")}.</p></div><button class="btn primary" data-a="makeManifest" ${nSel?"":"disabled"}>Create manifest${nSel?` (${nSel})`:""}</button></div>${miniOrders(pend,"rsel")}</div>
  <div class="panel"><div class="panel-h"><div><h2>At the reference lab</h2><p class="small muted">Enter results as reports come back.</p></div></div>${out.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Accession</th><th>Patient</th><th>Tests</th><th>Manifest</th><th>Sent</th><th></th></tr></thead><tbody>${out.map(o=>`<tr><td class="acc">${o.accession}</td><td class="small nm">${esc(pname(patientOf(o.patientId)))}</td><td class="small">${o.sendout.tests.map(c=>`<span class="tag">${c}</span>`).join("")}</td><td class="small"><button class="link" data-a="viewManifest" data-id="${o.sendout.manifest}">${o.sendout.manifest}</button></td><td class="small">${fmtDT(o.sendout.at)}</td><td style="text-align:right"><button class="btn sm" data-a="go" data-v="entry" data-id="${o.id}">Enter results</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Nothing is out at the reference lab.</div>`}</div>`}
 if(tab==="cutoffs"){const sp=ui.cspec,si=SPECS.indexOf(sp),list=defList(sp);body=`<div class="banner info" style="margin-bottom:18px">${I.info}<div>Component names must match the names in your MultiQuant method; case, spaces and punctuation are ignored. The cutoffs shown are placeholders. Replace them with your validated cutoffs for each matrix before reporting patient results.</div></div>
  <div class="radio-row" style="margin-bottom:14px">${SPECS.map(x=>`<span class="pill ${sp===x?"on":""}" data-a="setUi" data-k="cspec" data-val="${x}">${x}</span>`).join("")}</div>
  <div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Drug on the requisition</th><th>Component name in MultiQuant</th><th>Cutoff (ng/mL)</th></tr></thead><tbody>${list.map((an,ai)=>(S.confMap[sp][an]||[]).map((c,ki)=>`<tr>${ki===0?`<td class="nm small" rowspan="${S.confMap[sp][an].length}" style="vertical-align:top;border-right:1px solid var(--border)">${esc(an)}</td>`:""}<td><input class="input" style="height:32px" data-b="cmap.${si}.${ai}.${ki}.name" value="${esc(c.name)}" aria-label="Component name"></td><td><input class="input" style="height:32px;max-width:110px" inputmode="decimal" data-b="cmap.${si}.${ai}.${ki}.cutoff" value="${esc(c.cutoff)}" aria-label="Cutoff"></td></tr>`).join("")).join("")}</tbody></table></div></div>`}
 return `<div class="page-h"><div><h1>Instruments and send-outs</h1><p class="muted">Screens on the Yumizen C560, confirmations on the SCIEX 4500 with Agilent 1200 LC, everything else to the reference lab.</p></div></div>
 <div class="radio-row" style="margin-bottom:18px">${tabs.map(([v,l])=>`<span class="pill ${tab===v?"on":""}" data-a="setUi" data-k="itab" data-val="${v}">${l}</span>`).join("")}</div><div class="stack">${body}</div>`}

function showManifest(id){lastDoc={tbl:"manifests",id,what:"manifest"};const list=S.orders.filter(o=>o.sendout&&o.sendout.manifest===id);if(!list.length)return;const L=S.lab,at=list[0].sendout.at;
 modal(`Manifest ${id}`,`<div class="paper"><div class="ph"><div><img src="${LOGO}" alt="First Bio Genetics"><div style="margin-top:8px;font-size:11.5px;color:#5d687c">${esc(L.address)}${L.phone?` · ${esc(L.phone)}`:""}</div></div><div style="text-align:right"><h2 style="font-size:18px">Send-out manifest</h2><svg class="bc" data-v="${id}"></svg></div></div>
 <div class="meta"><div><span>To</span><b>${esc(L.refLab||"Reference laboratory")}</b></div><div><span>Created</span><b>${fmtDT(at)}</b></div><div><span>Specimens</span><b>${list.length}</b></div></div>
 <table><thead><tr><th>#</th><th>Accession</th><th>Patient</th><th>DOB / Sex</th><th>Tests</th><th>Specimen</th><th>Collected</th></tr></thead><tbody>${list.map((o,i)=>{const p=patientOf(o.patientId);return `<tr><td>${i+1}</td><td><b>${o.accession}</b></td><td>${esc(pname(p))}</td><td>${fmtDOB(p.dob)} · ${p.sex}</td><td>${o.sendout.tests.map(c=>esc(T(c).name)).join("<br>")}</td><td>${[...new Set(o.sendout.tests.map(c=>T(c).specimen))].map(esc).join(", ")}</td><td>${fmtDT(o.collectedAt)}</td></tr>`}).join("")}</tbody></table>
 <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px;font-size:11px">${["Packed by","Courier","Received by (reference lab)"].map(x=>`<div style="border-top:1px solid #0e1726;padding-top:4px">${x} · date and time</div>`).join("")}</div></div>`,{wide:1,print:1})}

/* billing */
function buildClaim(o){if(S.claims.some(c=>c.orderId===o.id))return;const lines=[];const abn=o.consents&&o.consents.abn;
 o.tests.forEach(code=>{const t=T(code);if(routeOf(code)==="ref"&&!S.lab.billRef)return;const cpts=isDef(code)?[gcode(classCount(o.confirm))]:t.cpt.split(/,\s*/);
  const toPt=abn&&abn.choice==="2"&&t.abn,mod=abn&&abn.choice==="1"&&t.abn?"GA":"";cpts.forEach(c=>lines.push({code,cpt:c,mod,units:1,billTo:o.billType==="Client bill"?"Client":o.billType==="Self pay"||toPt?"Patient":"Payer"}))});
 if(!lines.length)return;S.claims.push({id:"CLM-"+o.accession,orderId:o.id,patientId:o.patientId,lines,createdAt:o.releasedAt||Date.now(),status:"Created"})}
function claimIssues(cl){const L=S.lab,is=[],o=orderOf(cl.orderId),p=patientOf(cl.patientId);if(!/^\d{10}$/.test(L.npi||""))is.push("Lab NPI missing");if(!L.taxId)is.push("Lab Tax ID missing");const bt=o.billType||BILLFROM[p.ins.type];if(["Medicare","Medicaid","Commercial insurance"].includes(bt)&&!p.ins.member)is.push("Member ID missing");if(!o.icd.length)is.push("No diagnosis code");return is}
const claimStatus=cl=>cl.status==="Sent"?"Sent":claimIssues(cl).length?"On hold":"Ready";
const lineCharge=l=>parseFloat(S.fees[l.cpt])||0;
const claimTotal=cl=>cl.lines.reduce((s,l)=>s+lineCharge(l)*l.units,0);
function claimCSV(cls){const L=S.lab;const H=["ClaimID","Accession","DateOfService","PlaceOfService","BillingProviderName","BillingNPI","BillingTaxID","ReferringProviderName","ReferringNPI","PatientMRN","PatientLast","PatientFirst","PatientDOB","PatientSex","PatientAddress","PatientCity","PatientState","PatientZip","PatientPhone","PayerType","PayerName","MemberID","GroupNumber","ICD1","ICD2","ICD3","ICD4","Line","CPT","Modifier","Units","Charge","DxPointer","BillTo","ABNOption"];
 const q=v=>{v=String(v??"");return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v};const out=[H.join(",")];
 cls.forEach(cl=>{const o=orderOf(cl.orderId),p=patientOf(cl.patientId),pr=provOf(o),icd=o.icd.slice(0,4),ptr=icd.map((_,i)=>"ABCD"[i]).join("");
  cl.lines.forEach((l,i)=>out.push([cl.id,o.accession,ymd(o.collectedAt,"-"),"81",L.name,L.npi,L.taxId,`${pr.name}, ${pr.cred}`,pr.npi,p.mrn,p.last,p.first,p.dob,p.sex,p.address,p.city,p.state,p.zip,p.phone,p.ins.type,p.ins.payer,p.ins.member,p.ins.group,icd[0]||"",icd[1]||"",icd[2]||"",icd[3]||"",i+1,l.cpt,l.mod,l.units,lineCharge(l).toFixed(2),ptr,l.billTo,o.consents&&o.consents.abn?o.consents.abn.choice:""].map(q).join(",")))});
 return out.join("\r\n")}
function claimHL7(cls){const L=S.lab,now=new Date(),ts=ymd(now)+[now.getHours(),now.getMinutes(),now.getSeconds()].map(x=>String(x).padStart(2,"0")).join("");
 const e=v=>String(v??"").replace(/[|^~\\&\r\n]/g," ");
 const seg=(name,f)=>{const max=Math.max(...Object.keys(f).map(Number));const a=[name];for(let i=1;i<=max;i++)a.push(f[i]??"");return a.join("|")};
 return cls.map(cl=>{const o=orderOf(cl.orderId),p=patientOf(cl.patientId),pr=provOf(o),parts=pr.name.split(" "),last=parts.pop(),first=parts.join(" ");
  const ref=`${pr.npi}^${e(last)}^${e(first)}^^^^${e(pr.cred)}^^NPI`;
  return ["MSH|^~\\&|FBG_LIMS|"+e(L.name)+"|BILLING|"+e(L.billingCo||"BILLING")+"|"+ts+"||DFT^P03^DFT_P03|"+cl.id+ts+"|P|2.5",
   seg("EVN",{1:"P03",2:ts}),
   seg("PID",{1:"1",3:`${e(p.mrn)}^^^FBG^MR`,5:`${e(p.last)}^${e(p.first)}`,7:p.dob.replace(/-/g,""),8:p.sex==="X"?"U":p.sex,11:`${e(p.address)}^^${e(p.city)}^${e(p.state)}^${e(p.zip)}`,13:e(p.phone)}),
   seg("PV1",{1:"1",2:"O",8:ref,19:o.accession}),
   ...cl.lines.map((l,i)=>seg("FT1",{1:String(i+1),2:cl.id,4:ymd(o.collectedAt),6:"CG",7:`${l.cpt}^${e(T(l.code).name)}^CPT4`,10:String(l.units),11:lineCharge(l).toFixed(2),19:o.icd.slice(0,4).map(x=>`${e(x)}^^I10`).join("~"),21:ref,25:`${l.cpt}^^CPT4`,26:l.mod})),
   ...o.icd.map((x,i)=>seg("DG1",{1:String(i+1),2:"I10",3:`${e(x)}^^I10`,6:"F"})),
   ...(p.ins.type==="Self-pay"?[]:[seg("IN1",{1:"1",2:e(p.ins.type),4:e(p.ins.payer),8:e(p.ins.group),16:`${e(p.last)}^${e(p.first)}`,17:"SEL",18:p.dob.replace(/-/g,""),36:e(p.ins.member)})])].join("\r")}).join("\r\n")}

function vBilling(){const tab=ui.btab,all=[...S.claims].sort((a,b)=>b.createdAt-a.createdAt),by=s=>all.filter(c=>claimStatus(c)===s),ready=by("Ready"),hold=by("On hold"),sent=by("Sent");
 const L=S.lab,labMissing=!/^\d{10}$/.test(L.npi||"")||!L.taxId;
 const tabs=[["ready",`Ready (${ready.length})`],["hold",`On hold (${hold.length})`],["sent",`Exported (${sent.length})`],["all","All claims"],["fees","Charge master"]];
 let body;
 if(tab==="fees"){const codes=Object.keys(S.fees).sort();body=`<div class="panel"><div class="panel-h"><div><h2>Charge master</h2><p class="small muted">Gross charge per code, sent on every claim line. These are placeholders; enter your own.</p></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Used by</th><th>Charge ($)</th></tr></thead><tbody>${codes.map(c=>`<tr><td class="acc">${c}</td><td class="small">${esc(TESTS.filter(t=>t.cpt.split(/,\s*/).includes(c)||(t.dynamic&&c.startsWith("G048"))).map(t=>t.name).join(", "))}</td><td><input class="input" style="max-width:120px;height:32px" inputmode="decimal" data-b="fees.${c}" value="${esc(S.fees[c])}" aria-label="Charge for ${c}"></td></tr>`).join("")}</tbody></table></div></div>`}
 else{const list=tab==="ready"?ready:tab==="hold"?hold:tab==="sent"?sent:all,selC=ready.filter(c=>ui.bsel[c.id]),nSel=selC.length;
  body=`<div class="panel"><div class="panel-h" style="flex-wrap:wrap">${tab==="ready"?`<div class="row"><button class="btn sm" data-a="selectAllReady" ${ready.length?"":"disabled"}>${nSel&&nSel===ready.length?"Clear selection":"Select all"}</button><span class="small muted">${nSel} selected, ${money(selC.reduce((s,c)=>s+claimTotal(c),0))}</span></div><div class="row"><select class="input" style="width:auto" data-b="ui.bfmt" aria-label="Export format"><option value="csv" ${ui.bfmt==="csv"?"selected":""}>CSV claim file</option><option value="hl7" ${ui.bfmt==="hl7"?"selected":""}>HL7 v2.5 DFT^P03</option></select><button class="btn primary" data-a="exportClaims" ${nSel?"":"disabled"}>${I.send} Export to billing</button></div>`:`<span class="small muted">${list.length} claim${list.length===1?"":"s"}</span>`}</div>
  ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr>${tab==="ready"?"<th style=\"width:40px\"></th>":""}<th>Claim</th><th>Patient</th><th>Payer</th><th>Service date</th><th>Codes</th><th>Charges</th><th>Status</th></tr></thead><tbody>${list.map(cl=>{const o=orderOf(cl.orderId),p=patientOf(cl.patientId),st=claimStatus(cl),is=claimIssues(cl);return `<tr>${tab==="ready"?`<td><input type="checkbox" data-a="toggleSel" data-k="bsel" data-id="${cl.id}" ${ui.bsel[cl.id]?"checked":""} aria-label="Select ${cl.id}"></td>`:""}<td><button class="link acc" data-a="viewClaim" data-id="${cl.id}">${cl.id}</button><div class="xs muted">${o.accession}</div></td><td class="small nm">${esc(pname(p))}</td><td class="small">${esc(p.ins.type)}<div class="xs muted">${esc(p.ins.payer)}</div></td><td class="small">${fmtD(o.collectedAt)}</td><td class="small">${cl.lines.map(l=>`<span class="tag">${l.cpt}${l.mod?"-"+l.mod:""}</span>`).join("")}</td><td class="small">${money(claimTotal(cl))}</td><td>${st==="Sent"?`<span class="badge st-released">Exported</span><div class="xs muted">${cl.batch}</div>`:st==="Ready"?`<span class="badge st-received">Ready</span>`:`<span class="badge st-pending">On hold</span><div class="xs muted">${is.map(esc).join("; ")}</div>`}</td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty"><h3>No claims here</h3><p>${tab==="ready"?"Claims are created automatically when results are released.":"Nothing in this view."}</p></div>`}</div>`}
 return `<div class="page-h"><div><h1>Billing</h1><p class="muted">A claim is built for every released order and exported to ${esc(L.billingCo||"your billing company")}.</p></div></div>
 ${labMissing?`<div class="banner warn" style="margin-bottom:18px">${I.info}<div><b>Claims are on hold until the lab's NPI and Tax ID are set.</b> <button class="link" data-a="go" data-v="labset">Open lab settings</button></div></div>`:""}
 <div class="radio-row" style="margin-bottom:18px">${tabs.map(([v,l])=>`<span class="pill ${tab===v?"on":""}" data-a="setUi" data-k="btab" data-val="${v}">${l}</span>`).join("")}</div>${body}`}
function claimModal(id){const cl=S.claims.find(c=>c.id===id),o=orderOf(cl.orderId),p=patientOf(cl.patientId),pr=provOf(o),L=S.lab,is=claimIssues(cl);const row=(k,v)=>`<tr><td class="muted small" style="width:180px">${k}</td><td class="small">${v}</td></tr>`;
 modal(`Claim ${cl.id}`,`${is.length&&cl.status!=="Sent"?`<div class="banner warn" style="margin-bottom:14px">${I.alert}<div>${is.map(esc).join("<br>")}</div></div>`:""}<div class="tbl-wrap"><table class="tbl"><tbody>${row("Accession",o.accession)}${row("Date of service",fmtD(o.collectedAt))}${row("Place of service","81, independent laboratory")}${row("Billing provider",`${esc(L.name)}, NPI ${esc(L.npi||"not set")}, TIN ${esc(L.taxId||"not set")}`)}${row("Referring provider",`${esc(pr.name)}, ${esc(pr.cred)}, NPI ${pr.npi}`)}${row("Patient",`${esc(pname(p))}, DOB ${fmtDOB(p.dob)}, ${p.sex}`)}${row("Coverage",`${esc(p.ins.type)} ${esc(p.ins.payer)}${p.ins.member?`, ID ${esc(p.ins.member)}`:""}${p.ins.group?`, group ${esc(p.ins.group)}`:""}`)}${row("Diagnoses",o.icd.map((x,i)=>`<span class="tag">${"ABCD"[i]||"+"}: ${esc(x)}</span>`).join(""))}${o.consents&&o.consents.abn?row("ABN",`Option ${o.consents.abn.choice}, signed ${fmtD(o.consents.abn.at)}`):""}${cl.batch?row("Exported",`${cl.batch}, ${fmtDT(cl.sentAt)}`):""}</tbody></table></div>
 <h3 style="margin:18px 0 8px">Service lines</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Code</th><th>Modifier</th><th>Test</th><th>Units</th><th>Bill to</th><th>Charge</th></tr></thead><tbody>${cl.lines.map((l,i)=>`<tr><td>${i+1}</td><td class="acc">${l.cpt}</td><td>${l.mod||""}</td><td class="small">${esc(T(l.code).name)}</td><td>${l.units}</td><td class="small">${l.billTo}</td><td>${money(lineCharge(l)*l.units)}</td></tr>`).join("")}<tr><td colspan="6" style="text-align:right"><b>Total</b></td><td><b>${money(claimTotal(cl))}</b></td></tr></tbody></table></div>`,{wide:1})}

Object.assign(A,{
 copyText(){const t=$("#fbText");if(!t)return;t.select();const ok=()=>toast("Copied");(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(ok).catch(()=>{try{document.execCommand("copy");ok()}catch(e){}})},
 fallbackDone(){const cb=fallbackCb;fallbackCb=null;closeModal();cb&&cb()},
 doImport:e=>runImport(e.dataset.k,ui["paste_"+e.dataset.k]),
 exampleImport:e=>{const t=e.dataset.k==="c560"?exampleC560():exampleSciex();if(!t)return toast("No received specimens are waiting for this instrument.");ui["paste_"+e.dataset.k]=t;render()},
 reviewOrder:e=>{closeModal();resEdit=null;go("entry",{id:e.dataset.id})},
 toggleSel:e=>{const m=ui[e.dataset.k];m[e.dataset.id]=!m[e.dataset.id];render()},
 c560Export(){const pend=pendingFor("UDS");const rows=[["SampleID","PatientName","DOB","Sex","Assays","Priority"].join(",")];
  pend.forEach(o=>{const p=patientOf(o.patientId);rows.push([o.accession,`"${p.last}, ${p.first}"`,p.dob,p.sex,Object.keys(C560_MAP).join(";"),o.stat?"STAT":"R"].join(","))});
  saveFile(`C560_worklist_${ymd(Date.now())}.csv`,rows.join("\r\n"),()=>{pend.forEach(o=>markInProcess(o,"Loaded on Yumizen C560 worklist"));save();render()})},
 sciexBatch:e=>{const m=e.dataset.m,pend=pendingFor(m==="Urine"?"CONF":"CONFOF"),stamp=ymd(Date.now())+"_"+String(new Date().getHours()).padStart(2,"0")+String(new Date().getMinutes()).padStart(2,"0");
  const rows=[["Sample Name","Sample ID","Sample Type","Rack Position","Vial Position","Data File","Inj. Volume (uL)"].join(",")];let v=1;
  const tag=m==="Urine"?"URINE":"OF";const add=(n,id,type)=>rows.push([n,id,type,1,v++,`${tag}_${stamp}`,10].join(","));
  add("Blank","","Blank");for(let i=1;i<=6;i++)add(`Cal ${i}`,"","Standard");add("QC Low","","Quality Control");add("QC High","","Quality Control");
  pend.forEach(o=>add(o.accession,o.accession,"Unknown"));add("QC Low","","Quality Control");add("QC High","","Quality Control");
  saveFile(`SCIEX_${tag}_batch_${stamp}.csv`,rows.join("\r\n"),()=>{pend.forEach(o=>markInProcess(o,`Queued on SCIEX batch ${tag}_${stamp}`));save();render()})},
 makeManifest(){const pend=refPending().filter(o=>ui.rsel[o.id]);if(!pend.length)return toast("Select specimens to send.");
  const id="MAN"+ymd(Date.now()).slice(2)+"-"+rid(),at=Date.now();
  pend.forEach(o=>{o.sendout={manifest:id,at,tests:refTests(o),lab:S.lab.refLab};markInProcess(o,`Sent to ${S.lab.refLab||"reference lab"} on ${id}`)});
  ui.rsel={};save();render();showManifest(id);toast(`Manifest ${id} created`)},
 viewManifest:e=>showManifest(e.dataset.id),
 selectAllReady(){const ready=S.claims.filter(c=>claimStatus(c)==="Ready");const all=ready.length&&ready.every(c=>ui.bsel[c.id]);ui.bsel={};if(!all)ready.forEach(c=>ui.bsel[c.id]=true);render()},
 viewClaim:e=>claimModal(e.dataset.id),
 exportClaims(){const cls=S.claims.filter(c=>claimStatus(c)==="Ready"&&ui.bsel[c.id]);if(!cls.length)return toast("Select at least one ready claim.");
  const batch="BAT"+ymd(Date.now()).slice(2)+"-"+rid(),hl=ui.bfmt==="hl7";
  saveFile(`${batch}_${hl?"DFT_P03.txt":"claims.csv"}`,hl?claimHL7(cls):claimCSV(cls),()=>{cls.forEach(c=>{c.status="Sent";c.batch=batch;c.sentAt=Date.now()});ui.bsel={};save();render();toast(`${cls.length} claim${cls.length>1?"s":""} exported in ${batch}`)})},
});

/* ---------- insurance card photos ---------- */
let SAMPLE=null,SAMPLE_IMG=0,cardBusy=false;
(function trySample(n){try{if(window.claude&&window.claude.use){window.claude.use("sample").then(async x=>{SAMPLE=x;if(x){try{const l=await x.limits();SAMPLE_IMG=l&&l.images?l.images.maxCount:0}catch(e){}}if(ptForm)render()}).catch(()=>{});return}}catch(e){}if(n<20)setTimeout(()=>trySample(n+1),300)})(0);
function compressImage(file,max=1200,q=.75){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const sc=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL("image/jpeg",q))};img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("bad image"))};img.src=url})}
function dataUrlToBlob(u){const[h,b]=u.split(","),bin=atob(b),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:(h.match(/:(.*?);/)||[])[1]||"image/jpeg"})}
const CARD_PROMPT=`You are reading a photo of a US health insurance card for a clinical laboratory. The first image is the front of the card; a second image, if present, is the back.
Reply with only one JSON object, no other text:
{"coverage": "Medicare" | "Medicaid" | "Commercial" | null, "payer": string|null, "memberId": string|null, "groupNumber": string|null, "subscriberName": string|null, "planName": string|null}
Rules: use "Medicare" only for an Original Medicare card issued by CMS (red, white and blue, showing a Medicare Number). A Medicare Advantage plan card from a private insurer is "Commercial", and put "Medicare Advantage" in planName. Use "Medicaid" for state Medicaid programs such as Medi-Cal, AHCCCS or Medicaid managed-care plans. For Medicare, memberId is the 11-character Medicare Number. Copy IDs exactly as printed, including letters, prefixes and dashes. Use null for anything not clearly legible. Do not guess.`;
async function readCard(){const f=ptForm;if(!f||!f.ins.cardFront||!SAMPLE||cardBusy)return;cardBusy=true;render();
 try{const imgs=[dataUrlToBlob(f.ins.cardFront)];if(f.ins.cardBack&&SAMPLE_IMG>1)imgs.push(dataUrlToBlob(f.ins.cardBack));
  const r=await SAMPLE.json(CARD_PROMPT,{images:imgs,modelTier:"default"});
  if(!r||typeof r!=="object")throw{code:"bad"};
  if(["Medicare","Medicaid","Commercial"].includes(r.coverage))f.ins.type=r.coverage;
  if(r.payer)f.ins.payer=String(r.payer);if(r.memberId)f.ins.member=String(r.memberId).trim();if(r.groupNumber)f.ins.group=String(r.groupNumber).trim();
  const pn=`${f.first} ${f.last}`.trim().toLowerCase();if(r.subscriberName&&pn&&!String(r.subscriberName).toLowerCase().includes(f.last.toLowerCase()))f.ins.subscriber=String(r.subscriberName);
  f.cardRead={at:Date.now(),plan:r.planName||""};toast("Card read. Check each field against the card.")}
 catch(e){const c=e&&e.code;toast(c==="not_granted"?"Card reading wasn't allowed, so enter the details by hand.":c==="rate_limited"?"Too many requests. Try again in a moment.":"The card couldn't be read. Try a sharper photo or enter the details by hand.")}
 finally{cardBusy=false;render()}}

/* ---------- audit log ---------- */
let lastDoc=null;
const AU={from:ymd(Date.now()-7*DAY,"-"),to:ymd(Date.now(),"-"),actor:"",action:"",q:"",rows:null,loading:false,more:false,profiles:null,err:""};
const AUDIT_ACTIONS=[["","All activity"],["view","Viewed"],["insert","Created"],["update","Changed"],["delete","Deleted"],["print","Printed"],["export","Exported"],["send","Alert sent"],["sign_in,sign_out","Sign-ins and sign-outs"]];
const ACT_LBL={view:"Viewed",insert:"Created",update:"Changed",delete:"Deleted",print:"Printed",export:"Exported",send:"Sent alert",sign_in:"Signed in",sign_out:"Signed out"};
const TBL_LBL={orders:"Order",patients:"Patient",clinics:"Clinic",claims:"Claim",settings:"Lab settings",profiles:"User access",session:"Portal",files:"File",manifests:"Manifest",outbox:"Alert"};
const FIELD_LBL={status:"status",results:"results",history:"activity",readAt:"read receipt",flags:"flags",confirm:"definitive tests",tests:"tests",meds:"medications",ins:"insurance",first:"first name",last:"last name",dob:"date of birth",notify:"alert settings",providers:"providers",lines:"claim lines",sentAt:"export time",batch:"export batch",scans:"requisition scans",sendout:"send-out",consents:"consents",releasedAt:"release time"};
function auditRecordIds(q){q=q.trim().toLowerCase();if(!q)return null;const ids=[];
 S.orders.forEach(o=>{const p=patientOf(o.patientId);if(`${o.accession} ${p?p.first+" "+p.last+" "+p.last+", "+p.first+" "+p.mrn:""}`.toLowerCase().includes(q))ids.push(o.id)});
 S.patients.forEach(p=>{if(`${p.first} ${p.last} ${p.last}, ${p.first} ${p.mrn}`.toLowerCase().includes(q))ids.push(p.id)});
 S.clinics.forEach(c=>{if(`${c.name} ${c.acct||""}`.toLowerCase().includes(q))ids.push(c.id)});
 S.claims.forEach(c=>{if(c.id.toLowerCase().includes(q))ids.push(c.id)});
 return ids}
function auditWho(id){if(!id)return "System or administrator";const u=AU.profiles&&AU.profiles[id];return u?(u.name||u.email):"Unknown user"}
function auditRecord(r){
 if(r.tbl==="orders"){const o=orderOf(r.row_id);if(o){const p=patientOf(o.patientId);return `<button class="link" data-a="openOrder" data-id="${o.id}">${o.accession}</button> <span class="muted">${esc(pname(p))}</span>`}}
 if(r.tbl==="patients"){const p=patientOf(r.row_id);if(p)return `<button class="link" data-a="openPatient" data-id="${p.id}">${esc(pname(p))}</button> <span class="muted">${esc(p.mrn)}</span>`}
 if(r.tbl==="clinics"){const c=clinicOf(r.row_id);if(c)return esc(c.name)}
 if(r.tbl==="profiles"){const u=AU.profiles&&AU.profiles[r.row_id];return esc(u?(u.name||u.email):(r.detail&&r.detail.email)||"User")}
 if(r.tbl==="session")return "Portal";
 return esc(r.row_id||"")}
function auditDetail(r){const d=r.detail||{};const out=[];
 if(d.what)out.push(d.what);
 if(d.status)out.push(`status ${d.status[0]||"new"} → ${d.status[1]}`);
 if(d.changed){const f=d.changed.filter(k=>k!=="status"&&k!=="history").map(k=>FIELD_LBL[k]||k);if(f.length)out.push(f.slice(0,6).join(", ")+(f.length>6?` +${f.length-6} more`:""))}
 if(r.tbl==="profiles")out.push(`${d.previousRole&&d.previousRole!==d.role?`${d.previousRole} → `:""}${d.role||""}${d.clinic?` · ${esc((clinicOf(d.clinic)||{}).name||d.clinic)}`:""}`);
 if(d.channel)out.push(`${d.channel.toLowerCase()} ${d.status?d.status.toLowerCase():""}`);
 if(d.reason)out.push(d.reason);
 return esc(out.filter(Boolean).join(" · "))}
async function loadAudit(more){if(AU.loading)return;AU.loading=true;AU.err="";if(!more)AU.rows=null;render();
 try{if(!AU.profiles){const ps=await DB.profilesAll();AU.profiles=Object.fromEntries(ps.map(p=>[p.user_id,p]))}
  const ids=auditRecordIds(AU.q);
  if(ids&&!ids.length){AU.rows=[];AU.more=false}
  else{const rows=await DB.audit({from:AU.from,to:AU.to,actor:AU.actor,action:AU.action,rowIds:ids,offset:more?(AU.rows||[]).length:0});AU.rows=more?[...(AU.rows||[]),...rows]:rows;AU.more=rows.length===200}}
 catch(e){AU.err=errMsg(e);AU.rows=AU.rows||[]}
 finally{AU.loading=false;render()}}
function vAudit(){if(AU.rows===null&&!AU.loading)setTimeout(()=>loadAudit(false),0);
 const people=AU.profiles?Object.values(AU.profiles).sort((a,b)=>(a.name||a.email).localeCompare(b.name||b.email)):[];
 return `<div class="page-h"><div><h1>Audit log</h1><p class="muted">Every sign-in, view, change, print, export and alert, with who and when. Entries can't be edited or deleted.</p></div><button class="btn" data-a="auditExport" ${AU.rows&&AU.rows.length?"":"disabled"}>Export CSV</button></div>
 <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><div class="row" style="flex:1">
  <input class="input" type="date" style="width:auto" data-b="au.from" value="${AU.from}" aria-label="From"><input class="input" type="date" style="width:auto" data-b="au.to" value="${AU.to}" aria-label="To">
  <select class="input" style="width:auto" data-b="au.actor" aria-label="User"><option value="">Everyone</option>${people.map(p=>`<option value="${p.user_id}" ${AU.actor===p.user_id?"selected":""}>${esc(p.name||p.email)}${p.role==="lab"?" (lab)":""}</option>`).join("")}</select>
  <select class="input" style="width:auto" data-b="au.action" aria-label="Activity">${AUDIT_ACTIONS.map(([v,l])=>`<option value="${v}" ${AU.action===v?"selected":""}>${l}</option>`).join("")}</select>
  <div class="search" style="min-width:220px">${I.search}<input class="input" data-b="au.q" value="${esc(AU.q)}" placeholder="Accession, patient or clinic" data-enter="auditSearch"></div>
  <button class="btn primary" data-a="auditSearch">Search</button></div></div>
 ${AU.err?`<div class="banner danger" style="margin:16px">${I.alert}<div>${esc(AU.err)}</div></div>`:""}
 ${AU.rows===null||(AU.loading&&!AU.rows)?`<div class="empty">Loading…</div>`:AU.rows.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>User</th><th>Activity</th><th>Record</th><th>Details</th></tr></thead><tbody>${AU.rows.map(r=>`<tr><td class="small" style="white-space:nowrap">${fmtDT(r.at)}</td><td class="small">${esc(auditWho(r.actor))}</td><td class="small"><b>${ACT_LBL[r.action]||esc(r.action)}</b> <span class="muted">${TBL_LBL[r.tbl]||esc(r.tbl)}</span></td><td class="small">${auditRecord(r)}</td><td class="small muted">${auditDetail(r)}</td></tr>`).join("")}</tbody></table></div>${AU.more?`<div style="padding:14px;text-align:center"><button class="btn" data-a="auditMore" ${AU.loading?"disabled":""}>${AU.loading?"Loading…":"Load more"}</button></div>`:""}`:`<div class="empty"><h3>No activity found</h3><p>Widen the dates or clear a filter.</p></div>`}</div>`}

/* ---------- result alerts ---------- */
let alertBusy=false;
async function sendAlertsNow(fromButton){if(alertBusy)return;alertBusy=true;if(route.v==="outbox")render();
 try{await DB.flushNow(S,true);const r=await DB.sendAlerts();
  const fresh=await DB.loadAll(true);DB.merge(S,fresh,true);
  if(r&&r.processed){if(r.failed)toast(`${r.sent} alert${r.sent===1?"":"s"} sent, ${r.failed} failed. See the Notification log.`);else toast(`${r.sent} alert${r.sent===1?"":"s"} sent`)}
  else if(fromButton)toast("Nothing waiting to send")}
 catch(e){toast("Alerts couldn't be sent: "+errMsg(e))}
 finally{alertBusy=false;if(["outbox","order","dash"].includes(route.v))render()}}

/* ---------- production: sign-in, two-step verification, loading, sync ---------- */
let mfa=null,booting=false,submitting=false,lastActive=Date.now(),regDone=null;
const IDLE_MIN=15;
const emptyS=()=>({v:3,session:null,theme:null,users:[],clinics:[],patients:[],orders:[],notes:[],claims:[],outbox:[],lab:{},fees:undefined,confMap:undefined});
S=emptyS();
const rid=()=>crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
function authShell(inner){return `<div class="auth"><div class="auth-l"><div class="auth-card"><div class="brand"><img src="${LOGO}" alt="First Bio Genetics"></div>${inner}</div></div><div class="auth-r"><canvas id="molecule" aria-hidden="true"></canvas><div class="copy"><h2>Every specimen, from order to result.</h2><p>Sign-ins use two-step verification. Patient information is visible only to the ordering clinic and the laboratory.</p></div></div></div>`}
function vLoading(){return authShell(`<p class="muted">Loading…</p>`)}
function vMfa(){const m=mfa||{};return authShell(`<div><h1>Two-step verification</h1>${m.mode==="enroll"?`<p class="muted" style="margin-top:6px">Protecting patient information requires a code from an authenticator app each time you sign in. Scan this with Google Authenticator, Microsoft Authenticator, 1Password or Authy, then enter the 6-digit code it shows.</p>`:`<p class="muted" style="margin-top:6px">Enter the 6-digit code from your authenticator app.</p>`}</div>
 ${m.mode==="enroll"?`<div style="background:#fff;border-radius:12px;padding:12px;width:fit-content;margin:0 auto;border:1px solid var(--border)"><img src="${esc(m.qr)}" width="180" height="180" alt="QR code for your authenticator app"></div><p class="xs muted" style="text-align:center">Can't scan it? Enter this key in the app: <b style="letter-spacing:.06em;word-break:break-all">${esc(m.secret)}</b></p>`:""}
 <div class="field"><label for="mc">6-digit code</label><input id="mc" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" data-b="lf.code" value="${esc(lf.code||"")}" data-enter="mfaVerify"></div>
 <button class="btn primary block" data-a="mfaVerify">Verify</button><button class="btn ghost block" data-a="logout">Sign out</button>`)}
function vConfirm(){return authShell(`<div><h1>Check your email</h1><p class="muted" style="margin-top:6px">We sent a confirmation link to ${esc(regDone||"your email")}. Open it, then sign in here on this device to finish registering your clinic.</p></div><button class="btn primary block" data-a="toLogin">Back to sign in</button>`)}
function vNoProfile(){return authShell(`<div><h1>Account not set up yet</h1><p class="muted" style="margin-top:6px">You're signed in, but this account isn't linked to a clinic or to the laboratory. Contact First Bio Genetics at ${esc(S.lab.phone||"(480) 847-1916")} to finish setting it up.</p></div><button class="btn block" data-a="logout">Sign out</button>`)}
function vNewPw(){return authShell(`<div><h1>Set a new password</h1><p class="muted" style="margin-top:6px">Use at least 12 characters.</p></div><div class="field"><label for="np1">New password</label><input id="np1" class="input" type="password" autocomplete="new-password" data-b="lf.pw1" value="${esc(lf.pw1||"")}"></div><div class="field"><label for="np2">Confirm new password</label><input id="np2" class="input" type="password" autocomplete="new-password" data-b="lf.pw2" value="${esc(lf.pw2||"")}" data-enter="setNewPw"></div><button class="btn primary block" data-a="setNewPw">Save password</button>`)}
const AUTHV={login:()=>vLogin(),register:()=>vRegister(),loading:vLoading,mfa:vMfa,confirm:vConfirm,noprofile:vNoProfile,newpw:vNewPw};
const errMsg=e=>(e&&(e.message||e.error_description))||"Something went wrong.";

async function boot(){if(CONFIG_ERROR){S=emptyS();route={v:"login",p:{}};render();toast(CONFIG_ERROR);const b=document.createElement("div");b.className="banner danger";b.style.cssText="position:fixed;left:16px;right:16px;top:16px;z-index:300";b.textContent=CONFIG_ERROR;document.body.appendChild(b);return}if(booting)return;booting=true;
 try{
  const sess=await DB.session();
  if(!sess){S=emptyS();route={v:"login",p:{}};render();return}
  route={v:"loading",p:{}};render();
  const a=await DB.aal();
  if(a.currentLevel!=="aal2"){mfa=await DB.mfaSetup();lf.code="";route={v:"mfa",p:{}};render();setTimeout(()=>{const el=$("#mc");if(el)el.focus()},50);return}
  let {user,profile}=await DB.profile();
  if(!profile){try{if(await DB.finishRegistration(user))({profile}=await DB.profile())}catch(e){toast(errMsg(e))}}
  if(!profile){route={v:"noprofile",p:{}};render();return}
  const lab=profile.role==="lab",data=await DB.loadAll(lab);
  S={...emptyS(),...data,theme:localStorage.getItem("fbg-theme"),session:profile.user_id,
     users:[{id:profile.user_id,email:profile.email,name:profile.name||profile.email,role:profile.role,clinicId:profile.clinic_id}]};
  DB.markSynced(S,lab);migrate();applyTheme();
  if(!sessionStorage.getItem("fbg-signed-in")){DB.log("sign_in","session",profile.user_id);try{sessionStorage.setItem("fbg-signed-in","1")}catch(e){}}
  if(lab)DB.queueSave(S,true);
  lastActive=Date.now();route={v:"dash",p:{}};render();
 }catch(e){toast(errMsg(e));route={v:"login",p:{}};render()}
 finally{booting=false}}

async function refresh(){if(!me()||document.hidden)return;
 try{const lab=isLab(),fresh=await DB.loadAll(lab);DB.merge(S,fresh,lab);
  const busy=$("#modal-root").innerHTML||["order-new","entry","settings","labset"].includes(route.v)||(document.activeElement&&["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName));
  if(!busy)render()}catch(e){}}
setInterval(refresh,30000);
window.addEventListener("focus",refresh);
["click","keydown","pointerdown"].forEach(ev=>document.addEventListener(ev,()=>{lastActive=Date.now()},{passive:true}));
setInterval(async()=>{if(me()&&Date.now()-lastActive>IDLE_MIN*6e4){await DB.flushNow(S,isLab());DB.log("sign_out","session",S.session,{reason:"inactivity"});await new Promise(r=>setTimeout(r,250));try{sessionStorage.removeItem("fbg-signed-in")}catch(e){}await DB.signOut();S=emptyS();closeModal();route={v:"login",p:{}};render();toast(`Signed out after ${IDLE_MIN} minutes of inactivity`)}},30000);
window.addEventListener("beforeunload",e=>{if(me()&&DB.hasUnsaved(S,isLab())){DB.flushNow(S,isLab());e.preventDefault();e.returnValue=""}});
DB.onSaveError(e=>toast("Couldn't save: "+errMsg(e)));
DB.onAuth(ev=>{if(ev==="PASSWORD_RECOVERY"){lf.pw1="";lf.pw2="";route={v:"newpw",p:{}};render()}});

Object.assign(A,{
 sendAlerts(){sendAlertsNow(true)},
 retryAlerts(){S.outbox.forEach(x=>{if(x.status==="Failed"){x.status="Queued";x.detail=""}});save();sendAlertsNow(true)},
 async login(){const ev=$("#le"),pv=$("#lp");if(ev)lf.email=ev.value;if(pv)lf.pw=pv.value;if(!lf.email.trim()||!lf.pw)return toast("Enter your email and password.");try{await DB.signIn(lf.email.trim(),lf.pw);lf.pw="";await boot()}catch(e){toast(/invalid/i.test(errMsg(e))?"That email and password don't match an account.":/confirm/i.test(errMsg(e))?"Confirm your email first. Check your inbox for the link.":errMsg(e))}},
 async forgotPw(){const ev=$("#le");if(ev)lf.email=ev.value;const e=lf.email.trim();if(!e)return toast("Enter your email above first.");await DB.resetPassword(e);toast("If that email has an account, a reset link is on its way.")},
 async setNewPw(){if((lf.pw1||"").length<12)return toast("Use at least 12 characters.");if(lf.pw1!==lf.pw2)return toast("The passwords don't match.");try{await DB.updatePassword(lf.pw1);lf.pw1=lf.pw2="";toast("Password updated");await boot()}catch(e){toast(errMsg(e))}},
 async mfaVerify(){const code=(lf.code||"").replace(/\s/g,"");if(!/^\d{6}$/.test(code))return toast("Enter the 6-digit code.");try{await DB.mfaVerify(mfa.factorId,code);lf.code="";mfa=null;await boot()}catch(e){toast("That code didn't work. Wait for a new code and try again.")}},
 async logout(){try{if(me()){await DB.flushNow(S,isLab());DB.log("sign_out","session",S.session);await new Promise(r=>setTimeout(r,250))}}catch(e){}try{sessionStorage.removeItem("fbg-signed-in")}catch(e){}await DB.signOut();S=emptyS();draft=null;cs=null;labForm=null;closeModal();route={v:"login",p:{}};render()},
 toLogin(){route={v:"login",p:{}};render()},
 theme(){const dark=document.documentElement.getAttribute("data-theme")==="dark"||(!S.theme&&matchMedia("(prefers-color-scheme: dark)").matches);S.theme=dark?"light":"dark";try{localStorage.setItem("fbg-theme",S.theme)}catch(e){}applyTheme()},
});

/* ---------- events ---------- */
document.addEventListener("click",ev=>{const el=ev.target.closest("[data-a]");if(!el)return;if(el.dataset.a==="bgClose"){if(ev.target===el)closeModal();return}const fn=A[el.dataset.a];if(!fn)return;if(el.tagName!=="INPUT")ev.preventDefault();fn(el,ev)});
function setPath(b,val){const parts=b.split(".");const r=parts.shift();
 if(r==="cmap"){const[si,ai,ki,f]=parts;const sp=SPECS[+si];const it=((S.confMap[sp]||{})[defList(sp)[+ai]]||[])[+ki];if(it){it[f]=val;save()}return}
 if(r==="fees"){S.fees[parts[0]]=val;save();return}
 if(r==="res"){const o=S.orders.find(x=>x.id===resEdit._id);const[code,idx,field]=parts;const a=analytesFor(o,T(code))[+idx];if(!a)return;resEdit[code]=resEdit[code]||{};resEdit[code][a.name]=resEdit[code][a.name]||{};resEdit[code][a.name][field]=val;return}let o=roots[r]&&roots[r]();if(!o)return;
 // result keys may contain dots? analyte names don't; codes don't.
 for(let i=0;i<parts.length-1;i++){if(o[parts[i]]==null)o[parts[i]]={};o=o[parts[i]]}o[parts[parts.length-1]]=val}
function onInput(ev){const t=ev.target,b=t.dataset&&t.dataset.b;if(!b)return;setPath(b,t.type==="checkbox"?t.checked:t.value);
 if(b==="ui.gq"){render();return}
 if(t.dataset.live){if(ev.type==="input"&&t.tagName==="SELECT")return;render()}}
document.addEventListener("input",onInput);
document.addEventListener("change",ev=>{const t=ev.target;if(t.type==="file"&&t.dataset.reqscan){const fs=[...(t.files||[])];t.value="";if(!draft)return;Promise.all(fs.map(f=>compressImage(f,1700,.72))).then(us=>{draft.scans.push(...us);render()}).catch(()=>toast("That file couldn't be read as an image."));return}if(t.type==="file"&&t.dataset.card){const f=t.files&&t.files[0],k=t.dataset.card;t.value="";if(!f||!ptForm)return;compressImage(f).then(u=>{ptForm.ins[k]=u;render()}).catch(()=>toast("That file couldn't be read as an image."));return}if(t.type==="file"&&t.dataset.imp){const f=t.files&&t.files[0];if(f)f.text().then(txt=>runImport(t.dataset.imp,txt));t.value="";return}if(t.tagName==="SELECT"||t.type==="checkbox"||t.type==="date"){if(t.dataset.b){setPath(t.dataset.b,t.type==="checkbox"?t.checked:t.value);if(t.dataset.live)render()}}});
document.addEventListener("submit",ev=>{ev.preventDefault();if(ev.target&&ev.target.id==="loginForm")A.login()});
document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&$("#modal-root").innerHTML)closeModal();if(ev.key==="Enter"&&ev.target.dataset&&ev.target.dataset.enter){ev.preventDefault();A[ev.target.dataset.enter]()}});

function after(){initSigs();drawMolecule()}
function drawMolecule(){const cv=$("#molecule");if(!cv||!cv.getContext)return;const r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;cv.width=r.width*dpr;cv.height=r.height*dpr;const x=cv.getContext("2d");if(!x)return;x.scale(dpr,dpr);
 const cx=r.width*.62,cy=r.height*.34,R=Math.min(r.width,r.height)*.3;let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const pts=[];for(let i=0;i<34;i++){const a=i/34*Math.PI*2+rnd()*.2,rr=R*(.55+rnd()*.5);pts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,4+rnd()*11,a])}
 const col=a=>{const t=(Math.cos(a-2.4)+1)/2;const c1=[142,121,198],c2=[26,163,223];return `rgb(${c1.map((v,i)=>Math.round(v+(c2[i]-v)*(1-t))).join(",")})`};
 x.lineWidth=3;pts.forEach((p,i)=>{if(i%2===0){const q=pts[(i+1)%pts.length];x.strokeStyle=col(p[3]);x.globalAlpha=.8;x.beginPath();x.moveTo(p[0],p[1]);x.lineTo(q[0],q[1]);x.stroke()}});
 x.globalAlpha=1;pts.forEach(p=>{x.fillStyle=col(p[3]);x.beginPath();x.arc(p[0],p[1],p[2],0,7);x.fill()})}
window.addEventListener("resize",()=>{if($("#molecule"))drawMolecule()});

boot();
