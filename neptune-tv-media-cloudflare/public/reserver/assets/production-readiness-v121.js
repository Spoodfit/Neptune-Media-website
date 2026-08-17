const RELEASE='neptune-prospect-production-readiness-20260817-v121';
const COMPANY_STORAGE='neptune_media_company_v121';
document.documentElement.dataset.prospectProductionReadinessV121='1';
document.documentElement.dataset.prospectProductionReadinessRelease=RELEASE;

const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
  const url=resolveUrl(input);
  if(url?.pathname==='/api/reservation/prospect/start'&&String(init.method||'GET').toUpperCase()==='POST'){
    const payload=parseJson(init.body);
    const company=String(document.querySelector('#contactForm [name="company"]')?.value||localStorage.getItem(COMPANY_STORAGE)||'').trim();
    if(company){payload.company=company;localStorage.setItem(COMPANY_STORAGE,company);}
    init={...init,body:JSON.stringify(payload)};
  }
  return nativeFetch(input,init);
};

start();

function start(){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}
function boot(){
  const host=document.getElementById('app-content');
  if(!host)return;
  normalizeContact();
  new MutationObserver(normalizeContact).observe(host,{childList:true,subtree:true});
  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    normalizeContact();
    if(document.querySelector('#contactForm [name="company"]')||attempts>=100)clearInterval(timer);
  },50);
}
function normalizeContact(){
  const form=document.getElementById('contactForm');
  if(!form)return false;
  const grid=form.querySelector('.form-grid');
  if(!grid)return false;
  const lead=form.previousElementSibling;
  if(lead?.classList.contains('lead'))lead.textContent='Renseignez vos coordonnées professionnelles pour accéder aux formats réellement disponibles dans votre ville.';

  const first=form.querySelector('[name="firstName"]');
  const last=form.querySelector('[name="lastName"]');
  const email=form.querySelector('[name="email"]');
  const phone=form.querySelector('[name="phone"]');
  if(first)first.placeholder='Votre prénom';
  if(last)last.placeholder='Votre nom';
  if(email)email.placeholder='vous@entreprise.fr';
  if(phone){
    phone.placeholder='06 00 00 00 00';
    phone.autocomplete='tel';
    phone.removeAttribute('required');
    const phoneLabel=phone.closest('label')?.querySelector('span');
    if(phoneLabel)phoneLabel.textContent='Téléphone (facultatif)';
  }

  if(!form.querySelector('[name="company"]')){
    const label=document.createElement('label');
    label.className='field';
    label.innerHTML=`<span>Entreprise</span><input name="company" type="text" value="${escapeAttr(localStorage.getItem(COMPANY_STORAGE)||'')}" placeholder="Nom de votre entreprise" required autocomplete="organization">`;
    const emailLabel=email?.closest('label');
    if(emailLabel)emailLabel.after(label);else grid.append(label);
  }
  const legal=form.querySelector('.legal-note');
  if(legal)legal.textContent='En continuant, vous acceptez que Neptune Media utilise ces coordonnées uniquement pour gérer votre demande de passage et votre suivi client.';
  return true;
}
function resolveUrl(input){try{return new URL(typeof input==='string'?input:input?.url||'',location.origin);}catch{return null;}}
function parseJson(value){try{return JSON.parse(String(value||'{}'));}catch{return{};}}
function escapeAttr(value){return String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
