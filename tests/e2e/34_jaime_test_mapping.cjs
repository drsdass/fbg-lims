const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.__TOXSEED=true;w.eval(fs.readFileSync(BUNDLE,'utf8'));
const sign=k=>{const c=w.document.querySelector(`canvas.sigc[data-k="${k}"]`);if(!c)return false;for(const t of ['pointerdown','pointermove','pointerup'])c.dispatchEvent(new w.MouseEvent(t,{bubbles:true,clientX:10,clientY:10}));return true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>w.document.querySelector(s),txt=()=>w.document.querySelector('#app').textContent;
const click=s=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
const type=(s,v)=>{const el=q(s);if(!el){errs.push('missing '+s);return}el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const M=()=>w.__mock;
const toasts=()=>[...w.document.querySelectorAll('#toast .toast')].map(t=>t.textContent).join(' | ');
async function signIn(email,pw){type('[data-b="lf.email"]',email);type('[data-b="lf.pw"]',pw);click('[data-a="login"]');await sleep(80)}
(async()=>{
 await sleep(80);
 const st=acc=>M().store.orders.find(o=>o.data.accession===acc).data;
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('utf8');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1500)};
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const n=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
 // Jaime's sheet, with her spelling slips and the requisition's names for her test names.
 const FIX_AN={alprazoam:'alprazolam',paroxeine:'paroxetine',carisprodol:'carisoprodol','6am':'6am','6acetylmorphine':'6am'};
 const FIX_T={cyclobenazaprine:'cyclobenzaprine',hydrmorphone:'hydromorphone',mdmaecstasy:'mdmaecstasy',cocainebenzoylecgonine:'cocainebenzoylecgonine',thccannabinoids:'thccannabinoids',pcpphencylcidine:'pcpphencyclidine',etgets:'etgets',heroin:'heroin6am',cocaine:'cocainebenzoylecgonine',ecstasy:'mdamdmaecstasy',phencyclidine:'pcpphencyclidine',thc:'thccannabinoids',mitragynine:'mitragyninekratom',ketamine:'ketamine',methylphenidate:'methylphenidate'};
 const sheet={};let sec='',cur='';
 for(const line of fs.readFileSync(FIX('Toxicology_Parameters_Test_Mapping.csv'),'utf8').split(/\r?\n/)){const [a,b]=line.split(',');
  if(/^URINE Drug/.test(a)){sec='reflex';continue}if(/^Definitive Test Urine/.test(a)){sec='Urine';continue}if(/^Definitive Test Oral/.test(a)){sec='Oral fluid';continue}if(!sec||/^Screening Test/.test(a)||(!a&&!b))continue;
  if(a)cur=a;(sheet[sec]=sheet[sec]||{})[cur]=sheet[sec][cur]||[];if(b&&!/No Confirmation/.test(b))sheet[sec][cur].push(FIX_AN[n(b)]||n(b))}
 await login('lab@fbg.com','labpassword12');
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="cutoffs"]');await sleep(30);
 const readMap=()=>{const m={};let c='';[...w.document.querySelectorAll('tbody tr')].forEach(tr=>{const t=tr.querySelector('td.nm');if(t)c=t.textContent.trim();const i=tr.querySelector('input[data-b$=".name"]');if(i&&c)(m[c]=m[c]||[]).push(n(i.value))});return m};
 const section=t=>[...w.document.querySelectorAll('tbody td[colspan]')].map(td=>td.textContent.replace(/\s+/g,' ').trim().split(' (')[0]);
 const compare=(label,want,have,alias)=>{const keys=Object.keys(have),miss=[];const ws=Object.entries(want).filter(([t,ans])=>ans.length);ws.forEach(([t,ans])=>{const k=keys.find(x=>n(x)===(alias(n(t))))||keys.find(x=>n(x).startsWith(alias(n(t))))||keys.find(x=>n(x).includes(n(t)));if(!k){miss.push(t+': no test');return}const h=have[k].map(a=>FIX_AN[a]||a);if(JSON.stringify([...h].sort())!==JSON.stringify([...ans].sort()))miss.push(`${t}: portal ${h.join('+')} sheet ${ans.join('+')}`)});console.log(label,ws.length,'tests compared | differences:',miss.length?miss.join('; '):'none')};
 const um=readMap();console.log('K1 urine sections:',section().join(' | '));
 const RFX={amphetamine:'amphetamines',ecstasy:'ecstasymdma',heroin:'heroin6am',opiates:'opiates',cocaine:'cocaine',thc:'thc',pcp:'pcp'};
 compare('K2 urine screen reflex vs sheet:',sheet.reflex,um,t=>RFX[t]||t);
 compare('K3 urine definitive vs sheet:',sheet.Urine,um,t=>FIX_T[t]||t);
 click('[data-a="setUi"][data-k="cspec"][data-val="Oral fluid"]');await sleep(30);
 compare('K4 oral fluid definitive vs sheet:',sheet['Oral fluid'],readMap(),t=>FIX_T[t]||t);
 // K5: one cutoff per analyte
 click('[data-a="setUi"][data-k="cspec"][data-val="Urine"]');await sleep(30);
 const cutIn=(test,an)=>{let c='',el=null;[...w.document.querySelectorAll('tbody tr')].forEach(tr=>{const t=tr.querySelector('td.nm');if(t)c=t.textContent.trim();const i=tr.querySelector('input[data-b$=".name"]');if(c===test&&i&&n(i.value)===n(an))el=tr.querySelector('input[data-b$=".cutoff"]')});return el};
 const ci=cutIn('Alprazolam','Hydroxyalprazolam');ci.value='45';ci.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(30);
 click('[data-a="setUi"][data-k="cspec"][data-val="Urine"]');await sleep(30);
 console.log('K5 Hydroxyalprazolam cutoff under Benzodiazepines after editing it under Alprazolam:',cutIn('Benzodiazepines','Hydroxyalprazolam').value);
 ci.value='40';ci.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(30);
 // E1-E3: a new-style urine order in manual entry shows the sheet's analytes
 Object.assign(st('60000004'),{confirm:['Alprazolam','Diazepam','Codeine','Benzodiazepines'],confirmReq:['Alprazolam','Diazepam','Codeine'],confV:4,reflexTests:['Benzodiazepines'],results:{}});
 nav('openOrder',null,'ox60000004');await sleep(40);click('[data-a="manualEntry"]');await sleep(40);
 const blk=name=>{const tr=[...w.document.querySelectorAll('.re-test tr')].find(tr=>{const x=tr.querySelector('.nm');return x&&x.textContent.trim().startsWith(name)});return tr?[...tr.querySelectorAll('.conc-grid label > span')].map(s=>s.firstChild.textContent.trim()):null};
 console.log('E1 manual entry analytes: Alprazolam =',(blk('Alprazolam')||[]).join(', '),'| Diazepam =',(blk('Diazepam')||[]).join(', '),'| Codeine =',(blk('Codeine')||[]).join(', '),'| Benzodiazepines =',(blk('Benzodiazepines')||[]).length);
 const inp=[...w.document.querySelectorAll('.re-test tr')].find(tr=>{const x=tr.querySelector('.nm');return x&&x.textContent.trim().startsWith('Alprazolam')}).querySelector('.conc-grid input');
 inp.value='500';inp.dispatchEvent(new w.Event('input',{bubbles:true}));await sleep(40);
 const benzo=[...w.document.querySelectorAll('.re-test tr')].find(tr=>{const x=tr.querySelector('.nm');return x&&x.textContent.trim().startsWith('Benzodiazepines')});
 const hx=[...benzo.querySelectorAll('.conc-grid label')].find(l=>/Hydroxyalprazolam/.test(l.textContent));
 console.log('E2 typed once under Alprazolam, also filled under Benzodiazepines:',hx&&hx.querySelector('input').value,'| result',benzo.querySelector('select').value);
 // R1: reflex on a new-style order adds the screen's reflex test
 Object.assign(st('50018185'),{reflex:true,confV:4,confirm:[],confirmReq:[],tests:['UDS']});
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(20);
 await upload('c560',FIX('CSV_Screening_Tox_Patient_Samples_1.xlsx'),'CSV_Screening_Tox_Patient_Samples_3.xlsx');q('#modal-root').innerHTML='';
 const r85=st('50018185');console.log('R1 reflex tests:',JSON.stringify(r85.confirm),'| reflexTests',JSON.stringify(r85.reflexTests),'| requisition drugs recorded:',(r85.confirmReq||[]).length);
 console.log('errors',errs,M().errors);process.exit(0)
})();
