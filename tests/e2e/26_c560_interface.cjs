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
 // U1-U6: the host-query message builders used by the edge function, checked against the manual's examples
 const esb=require('esbuild');const code=esb.buildSync({entryPoints:[ROOT('supabase/functions/instrument-upload/c560.ts')],format:'cjs',write:false,platform:'node'}).outputFiles[0].text;
 const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);const C=mod.exports;
 const q0=C.parseQuery('\x0bMSH|^~\\&|||||20120508104700||QRY^Q02|4|P|2.3.1||||||ASCII|||\rQRD|20120508104700|R|D|1|||RD|0019|OTH|||T|\rQRF||||||RCT|COR|ALL||\r\x1c\r');
 console.log('U1 parse barcode query:',JSON.stringify(q0));
 console.log('U2 batch query:',JSON.stringify(C.parseQuery('MSH|^~\\&|||||20120508150259||QRY^Q02|7|P|2.3.1||||||ASCII|||\rQRD|20120508150259|R|D|4|||RD||OTH|||T|\rQRF||20120508100000|20120508150000|||RCT|COR|ALL||\r')));
 console.log('U3 QCK:',JSON.stringify(C.qckQ02('4',true,'20120508104700')),'| NF',C.qckQ02('4',false,'20120508104700').includes('QAK|SR|NF|'));
 console.log('U4 ACK^R01 matches manual:',C.ackR01('1','0','20120508094823')==='MSH|^~\\&|||||20120508094823||ACK^R01|1|P|2.3.1||||0||ASCII|||\rMSA|AA|1|Message accepted|||0|\r');
 const set={tests:[{code:'AMPH',channel:'1',analyte:'Amphetamines'},{code:'OXY',channel:'2',analyte:'Oxycodone'},{code:'THC',channel:'5',analyte:'Cannabinoids (THC)'},{code:'PCP',channel:'',analyte:'PCP'}],sampleType:'urine'};
 const ord={accession:'FBG261008-1009',tests:['UDS'],status:'Received',stat:false,collectedAt:Date.UTC(2026,9,8,16,30),history:[{s:'Received',at:Date.UTC(2026,9,8,18,0)}],results:{UDS:{Oxycodone:{v:'Negative'}}}};
 const smp=C.sampleFromOrder(ord,{first:'Tommy',last:'Ray',dob:'1962-08-24',sex:'M',mrn:'1212'},set);
 console.log('U5 sample:',JSON.stringify(smp));
 const d=C.dsrQ03(smp,'4',1,1,'20261008110131').split('\r');
 console.log('U6 DSR:',d.length,'segments |',d.slice(0,6).join(' / '),'|',d.filter(x=>/^DSP\|(1|3|4|5|12|21|22|23|24|26|29|30|31)\|/.test(x)).join(' '),'|',d.filter(x=>x.startsWith('DSC')).join(''));
 console.log('U7 group DSC and controls:',C.answer('5',[smp,smp,smp],'x').map(m=>m.split('\r')[0].split('|')[9]+':'+m.split('\r').find(x=>x.startsWith('DSC'))).join(' '));
 console.log('U8 not sent: wrong status / nothing pending:',C.sampleFromOrder({...ord,status:'Released'},{},set),C.sampleFromOrder({...ord,results:{UDS:{Amphetamines:{v:'Positive'},Oxycodone:{v:'Negative'},'Cannabinoids (THC)':{v:'Negative'}}}},{},set),'| barcode keys',JSON.stringify(C.barcodeKeys(' 50018191u1 ')),'| delimiters cleaned',C.clean('A|B^C~D\\E&F'));
 console.log('U9 compact tube codes:',['FBG261005-1009','FBG261008-12345','50018191','60000011'].map(C.tubeBase).join(' '),'| back to sequence',C.seqFromTube('70001009'),C.seqFromTube('60000011'),'| sample ID',C.sampleIdFor('FBG261005-1009'),'| no hyphen, 10 chars',/^[0-9A-Z]{10}$/.test(C.tubeBase('FBG261005-1009')+'U1'));
 // P1-P6: portal settings and the HL7 results import
 const st=acc=>M().store.orders.find(o=>o.data.accession===acc).data;
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const upload=async(kind,path,name)=>{const buf=fs.readFileSync(path);const fi=q(`input[data-imp="${kind}"]`);if(!fi){errs.push('no input '+kind);return}const file=new w.File([buf],name);file.arrayBuffer=async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);file.text=async()=>buf.toString('latin1');Object.defineProperty(fi,'files',{value:[file],configurable:true});fi.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(1500)};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 await login('lab@fbg.com','labpassword12');
 click('[data-a="go"][data-v="labset"]');await sleep(40);
 console.log('P1 C560 panel:',txt().includes('Yumizen C560 interface'),q('[data-b="labf.c560.channels.AMPH"]')?'channel inputs':'none',[...w.document.querySelectorAll('[data-b^="labf.c560.channels."]')].length);
 type('[data-b="labf.c560.channels.AMPH"]','1');type('[data-b="labf.c560.channels.OXY"]','1');click('[data-a="saveLab"]');await sleep(50);console.log('P2 duplicate channel:',toasts().slice(-50));
 type('[data-b="labf.c560.channels.OXY"]','2');type('[data-b="labf.c560.channels.THC"]','3');type('[data-b="labf.c560.channels.CREAT-U"]','20');type('[data-b="labf.c560.port"]','5100');click('[data-a="saveLab"]');await sleep(800);
 const lab=M().store.settings?M().store.settings.find(x=>x.key==='lab'):null;const c5=lab&&lab.data.c560;
 console.log('P3 saved for the edge function:',JSON.stringify(c5&&{channels:c5.channels,tests:c5.tests,port:c5.port,sampleType:c5.sampleType}));
 click('[data-a="go"][data-v="qc"]');await sleep(300);await upload('qctargets',FIX('QC_targets.xlsx'),'QC.xlsx');q('#modal-root').innerHTML='';
 click('[data-a="go"][data-v="instruments"]');await sleep(30);click('[data-a="setUi"][data-k="itab"][data-val="c560"]');await sleep(20);
 console.log('P4 file picker accepts .hl7:',(q('input[data-imp="c560"]')||{}).accept);
 await upload('c560',FIX('c560_hl7_batch.hl7'),'C560-HL7_20261008-190553_2.hl7');
 console.log('P5 HL7 import:',mtxt().slice(0,300));
 await sleep(600);const u=st('50018191').results.UDS||{};
 console.log('P6 results: AMPH',JSON.stringify(u.Amphetamines),'| THC (rerun wins)',JSON.stringify(u['Cannabinoids (THC)']),'| void creatinine skipped',!u['Urine creatinine (validity)'],'| run',JSON.stringify((st('50018191').runs||[]).map(r=>[r.inst,r.day])));
 console.log('errors',errs,M().errors);process.exit(0)
})();
