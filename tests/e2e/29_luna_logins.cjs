const __path=require('path');const FIX=n=>__path.join(__dirname,'..','fixtures',n),ROOT=n=>__path.join(__dirname,'..','..',n),OUT=n=>{const d=__path.join(__dirname,'..','.out');require('fs').mkdirSync(d,{recursive:true});return __path.join(d,n)},BUNDLE=__path.join(__dirname,'..','.bundle.js'),REL=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10),MID_LAST_MONTH=(()=>{const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-1);d.setHours(10,0,0,0);return d.getTime()})();
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const vc=new VirtualConsole();vc.on("jsdomError",e=>{if(!/getContext|Not implemented/.test(e.message))console.log("JSDOMERR",e.message)});
const dom=new JSDOM('<!doctype html><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://portal.test/',virtualConsole:vc});
const w=dom.window;w.confirm=()=>true;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>require('crypto').randomUUID();
const errs=[];w.addEventListener('error',e=>errs.push(e.message));w.addEventListener('unhandledrejection',e=>errs.push('UNHANDLED '+(e.reason&&e.reason.message)));
const ctxStub=new Proxy({},{get:(t,k)=>typeof k==='string'?(()=>{}):undefined,set:()=>true});
w.CSS={escape:s=>String(s).replace(/["\\]/g,'\\$&')};w.HTMLCanvasElement.prototype.getContext=function(){return ctxStub};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,iVBORw0KGgo=';w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
w.eval(fs.readFileSync(BUNDLE,'utf8'));
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
 const login=async(e,p)=>{await signIn(e,p);if(q('[data-b="lf.code"]')){type('[data-b="lf.code"]','123456');click('[data-a="mfaVerify"]')};await sleep(300)};
 const nav=(a,v,id)=>{const b=w.document.createElement('button');b.dataset.a=a;if(v)b.dataset.v=v;if(id)b.dataset.id=id;w.document.body.append(b);b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));b.remove()};
 const mtxt=()=>q('#modal-root').textContent.replace(/\s+/g,' ');
 await login('lab@fbg.com','labpassword12');
 // E1-E2: Edit clinic has a login section; its button opens Add user with Username preselected
 click('[data-a="go"][data-v="clinics"]');await sleep(20);click('[data-a="editClinic"][data-id="c1001"]');await sleep(30);
 console.log('E1 edit form: Clinic logins section',mtxt().includes('Clinic logins'),'| button',!!q('#modal-root [data-a="clinicLogin"]'));
 click('#modal-root [data-a="clinicLogin"]');await sleep(30);
 console.log('E2 Add user opened:',mtxt().includes('Add user'),'| Username pill on',!!q('#modal-root .pill.on[data-val="username"]'),'| username',q('#modal-root [data-b="uf.username"]')&&q('#modal-root [data-b="uf.username"]').value);
 q('#modal-root').innerHTML='';
 // D1: details modal still has the button
 click('[data-a="viewClinic"][data-id="c1001"]');await sleep(30);console.log('D1 details: Create a login',!!q('#modal-root [data-a="clinicLogin"]'));q('#modal-root').innerHTML='';
 // O1-O3: an older manage-users function on Supabase (no username support): warn, translate the error, save nothing
 M().oldUserFn=true;
 click('[data-a="go"][data-v="users"]');await sleep(300);
 console.log('O1 Users banner:',/Username logins are switched off on the server/.test(txt()));
 nav('clinicLogin',null,'c1001');await sleep(30);
 const before=M().store.profiles.length;
 click('#modal-root [data-a="saveUser"]');await sleep(300);
 console.log('O2 toast:',toasts().replace(/\s+/g,' ').slice(0,90),'| saved',M().store.profiles.length-before,'| hint in form',/need the current manage-users/.test(mtxt()));
 q('#modal-root').innerHTML='';
 // N1-N2: current function: username login saved as a username
 M().oldUserFn=false;click('[data-a="go"][data-v="dash"]');await sleep(20);click('[data-a="go"][data-v="users"]');await sleep(300);
 nav('clinicLogin',null,'c1001');await sleep(30);type('#modal-root [data-b="uf.username"]','CURANA_HEALTHAZ');click('#modal-root [data-a="saveUser"]');await sleep(300);
 const np=M().store.profiles.slice(-1)[0];console.log('N2 saved:',np.email,np.role,np.clinic_id,'| modal:',/username curana_healthaz/.test(mtxt()));
 q('#modal-root').innerHTML='';click('[data-a="go"][data-v="dash"]');await sleep(20);click('[data-a="go"][data-v="users"]');await sleep(300);
 console.log('N3 banner gone after a username login works:',!/Username logins are switched off/.test(txt()));
 console.log('errors',errs,M().errors);process.exit(0)
})();
