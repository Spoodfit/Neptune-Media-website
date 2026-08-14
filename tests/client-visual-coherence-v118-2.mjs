import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl=process.env.DASHBOARD_BASE_URL||'http://127.0.0.1:4173';
const outputDir=path.resolve('test-results/client-visual-coherence-v118-2');
const client={id:'client-visual',fullName:'Client Neptune',email:'client@example.com'};
const catalog={ok:true,dataGuardRelease:'neptune-sales-tunnel-data-guard-20260814-v118',cities:[
  {id:'toulouse',slug:'toulouse',name:'Toulouse',formats:[
    {id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Interview incarnée',description:'Une conversation éditoriale premium.',durationLabel:'1 h 30',image:'/media/catalog-v98/hors-norme-toulouse.webp',imagePublicUrl:'/media/catalog-v98/hors-norme-toulouse.webp',offers:[{id:'offer-hn-tls',clientPriceCents:79000,currency:'eur'}]},
    {id:'connexio',slug:'connexio',name:'Connexio',concept:'Conversation',description:'Un format vivant.',durationLabel:'2 h',image:'/assets/catalog-v98/connexio.svg',imagePublicUrl:'/assets/catalog-v98/connexio.svg',offers:[{id:'offer-co-tls',clientPriceCents:99000,currency:'eur'}]},
  ]},
  {id:'paris',slug:'paris',name:'Paris',formats:[
    {id:'hn',slug:'hors-norme',name:'Hors Norme',concept:'Interview incarnée',description:'Le même format disponible dans une autre ville.',durationLabel:'1 h 30',image:'/media/catalog-v98/hors-norme-paris.webp',imagePublicUrl:'/media/catalog-v98/hors-norme-paris.webp',offers:[{id:'offer-hn-par',clientPriceCents:89000,currency:'eur'}]},
    {id:'libre',slug:'libre',name:'Libre',concept:'Plateau libre',description:'Un plateau flexible.',durationLabel:'2 h',image:'/assets/catalog-v98/libre.svg',imagePublicUrl:'/assets/catalog-v98/libre.svg',offers:[{id:'offer-li-par',clientPriceCents:109000,currency:'eur'}]},
  ]},
]};

const contentState={authenticated:true,client,orders:[{
  id:'editing-visual-1',title:'Hors Norme',format:'Hors Norme',status:'editing',paymentStatus:'paid',
  appointmentAt:'2026-08-01T08:00:00Z',filmingAt:'2026-08-05T09:00:00Z',
  workflow:{preparationStatus:'completed',supplierStatus:'confirmed',sourceReceivedAt:'2026-08-06T09:00:00Z',editingStartedAt:'2026-08-07T09:00:00Z'},
  files:[
    {id:'f1',name:'Emission finale.mp4',fileType:'final',createdAt:'2026-08-10T09:00:00Z'},
    {id:'f2',name:'Short 01.mp4',fileType:'short',createdAt:'2026-08-10T10:00:00Z'},
  ],
}]};

const scenarios=[
  {name:'desktop-coherence',viewport:{width:1440,height:1000},state:contentState,async assert(page){
    await page.waitForSelector('#clientCityFilterV1182');
    await page.waitForTimeout(250);
    let d=await diagnostics(page);
    expect(d.selectedLabel.length>0,'le libellé de l’étape sélectionnée ne doit pas disparaître');
    expect(!d.selectedIsWhite,`le libellé sélectionné reste blanc sur fond clair (${d.selectedColor})`);
    expect(d.supportHeight<220,`Besoin d’aide reste trop haut sur desktop (${d.supportHeight}px)`);
    expect(d.supportAlign==='start'||d.supportAlign==='self-start',`Besoin d’aide reste étiré (${d.supportAlign})`);
    expect(d.utilityAlign==='start',`la grille utilitaire continue d’étirer ses cartes (${d.utilityAlign})`);
    expect(d.utilityGap>=20,`catalogue et utilitaires sont trop collés (${d.utilityGap}px)`);
    expect(!d.snapshotVisible,'l’ancien résumé vidéo ne doit plus concurrencer les dossiers par passage');
    expect(d.footerMinTarget>=32,`les liens du footer restent trop petits (${d.footerMinTarget}px)`);
    expect(d.cityButtons===2,'les deux villes du catalogue doivent être sélectionnables');
    expect(d.visibleCities.length===1&&d.visibleCities[0]==='toulouse','une seule ville doit alimenter le rail à la fois');
    expect(d.overflow<=3,`débordement horizontal desktop de ${d.overflow}px`);
    await page.locator('[data-v1182-city="paris"]').click();
    await page.waitForTimeout(80);
    d=await diagnostics(page);
    expect(d.activeCity==='paris','Paris doit devenir la ville active');
    expect(d.visibleCities.length===1&&d.visibleCities[0]==='paris','le rail doit être filtré sur Paris');
    expect(d.visibleFormatNames.includes('Hors Norme')&&d.visibleFormatNames.includes('Libre'),'les formats parisiens doivent rester complets, y compris le format dupliqué entre villes');
  }},
  {name:'mobile-390-coherence',viewport:{width:390,height:844},state:contentState,async assert(page){
    await page.waitForSelector('#clientCityFilterV1182');
    await page.waitForTimeout(250);
    const d=await diagnostics(page);
    expect(!d.snapshotVisible,'le vieux résumé contenus ne doit pas rallonger la page mobile');
    expect(d.supportHeight<230,`Besoin d’aide reste trop haut sur mobile (${d.supportHeight}px)`);
    expect(d.utilityGap>=16,`marge catalogue/utilitaires insuffisante sur mobile (${d.utilityGap}px)`);
    expect(d.overflow<=3,`débordement mobile 390 de ${d.overflow}px`);
    expect(d.detailCloseInside,'le bouton de fermeture du détail doit rester dans le viewport');
    expect(d.cityFilterScrollable||d.cityFilterFits,'le sélecteur de ville doit rester exploitable sur mobile');
    expect(d.headerContainsNav,`la navigation sort encore du header mobile (${d.navBottom}px > ${d.headerBottom}px)`);
    expect(!d.headerContentOverlap,`le header recouvre encore le contenu mobile (écart ${d.headerContentGap}px)`);
  }},
  {name:'narrow-320-coherence',viewport:{width:320,height:700},state:{authenticated:true,client,orders:[{id:'prep-narrow',title:'Hors Norme',format:'Hors Norme',status:'preparation',paymentStatus:'paid',workflow:{supplierStatus:'confirmed'},files:[]}]},async assert(page){
    await page.waitForSelector('#clientCityFilterV1182');
    await page.waitForTimeout(200);
    const d=await diagnostics(page);
    expect(d.overflow<=3,`débordement à 320px de ${d.overflow}px`);
    expect(d.detailCloseInside,'le contrôle de détail déborde à 320px');
    expect(d.selectedLabel.length>0,'le libellé d’étape doit rester visible à 320px');
    expect(!d.selectedIsWhite,'le libellé sélectionné ne doit pas devenir invisible à 320px');
    expect(!d.snapshotVisible,'aucun résumé historique ne doit réapparaître à 320px');
    expect(d.headerContainsNav,`la navigation sort du header à 320px (${d.navBottom}px > ${d.headerBottom}px)`);
    expect(!d.headerContentOverlap,`le header recouvre le contenu à 320px (écart ${d.headerContentGap}px)`);
  }},
];

await fs.rm(outputDir,{recursive:true,force:true});
await fs.mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
const errors=[];

for(const scenario of scenarios){
  const context=await browser.newContext({viewport:scenario.viewport,reducedMotion:'reduce'});
  const page=await context.newPage();
  const browserErrors=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/compute-pressure/iu.test(message.text()))browserErrors.push(message.text());});
  await page.route('**/api/client/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname==='/api/client/session'?scenario.state:{})}));
  await page.route('**/api/reservation/catalog-v96',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
  await page.route('**/api/public/connexio-availability',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false,"event":null}'}));
  const visualSvg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#151b48"/><text x="80" y="48" text-anchor="middle" fill="white" font-size="10">NEPTUNE</text></svg>';
  await page.route('**/media/catalog-v98/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:visualSvg}));
  await page.route('**/assets/catalog-v98/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:visualSvg}));

  const response=await page.goto(`${baseUrl}/espace-client/?v1182_test=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  if(!response||response.status()>=400)throw new Error(`${scenario.name}: HTTP ${response?.status()||0}`);
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:20000});
  await page.evaluate(async()=>{
    await import('/espace-client/client-experience-v117.js?v=1');
    for(const href of [
      '/espace-client/client-command-center-v118.css?v=1',
      '/espace-client/client-catalog-rail-v118.css?v=1',
      '/espace-client/content-snapshot-v48.css?v=1',
      '/espace-client/client-visual-coherence-v118-2.css?v=1',
    ]){
      const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
    }
    await import('/espace-client/client-command-center-v118-1.js?v=1');
    await import('/espace-client/client-preparation-context-v118.js?v=1');
    await import('/espace-client/client-visual-coherence-v118-2.js?v=1');
    // Reproduce the historical asynchronous snapshot arriving after the new command center.
    await import('/espace-client/content-snapshot-v48.js?v=1');
  });
  await page.waitForSelector('.client-command-center #ccContent:not([hidden])',{timeout:20000});
  await page.waitForSelector('.formats-panel:not([hidden])',{timeout:10000});
  await page.waitForTimeout(450);

  try{
    await scenario.assert(page);
    if(browserErrors.length)throw new Error(`erreurs navigateur: ${browserErrors.join(' | ')}`);
  }catch(error){
    errors.push(`${scenario.name}: ${error.message}`);
  }
  await page.screenshot({path:path.join(outputDir,`${scenario.name}.png`),fullPage:true});
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify({errors},null,2));
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Cohérence visuelle client v118.2 validée sur ${scenarios.length} scénarios.`);

async function diagnostics(page){
  return page.evaluate(()=>{
    const doc=document.documentElement;
    const selected=document.querySelector('.cc-stage.is-selected-v118 .cc-stage-copy strong');
    const selectedColor=selected?getComputedStyle(selected).color:'';
    const support=document.querySelector('.support-card');
    const referral=document.querySelector('.referral-panel');
    const utility=document.querySelector('.cc-utility-grid>.utility-column');
    const formats=document.querySelector('.formats-panel');
    const snapshot=document.querySelector('#clientContentSnapshot');
    const footerLinks=[...document.querySelectorAll('.client-footer nav a')];
    const cityFilter=document.querySelector('#clientCityFilterV1182');
    const cityButtons=[...document.querySelectorAll('[data-v1182-city]')];
    const cards=[...document.querySelectorAll('[data-v1182-city-card]')];
    const close=document.querySelector('.cc-v118-detail-head>button');
    const header=document.querySelector('.media-header');
    const primaryNav=document.querySelector('.media-header .client-primary-nav-v117');
    const firstContent=document.querySelector('.dashboard-heading');
    const closeRect=close?.getBoundingClientRect();
    const filterRect=cityFilter?.getBoundingClientRect();
    const formatRect=formats?.getBoundingClientRect();
    const utilityRect=utility?.getBoundingClientRect();
    const headerRect=header?.getBoundingClientRect();
    const navRect=primaryNav?.getBoundingClientRect();
    const contentRect=firstContent?.getBoundingClientRect();
    const white=/rgb\(255,\s*255,\s*255\)|rgba\(255,\s*255,\s*255/iu.test(selectedColor);
    return {
      selectedLabel:selected?.textContent?.trim()||'',
      selectedColor,
      selectedIsWhite:white,
      supportHeight:support?.getBoundingClientRect().height||0,
      referralHeight:referral?.getBoundingClientRect().height||0,
      supportAlign:support?getComputedStyle(support).alignSelf:'',
      utilityAlign:utility?getComputedStyle(utility).alignItems:'',
      utilityGap:formatRect&&utilityRect?Math.round(utilityRect.top-formatRect.bottom):0,
      snapshotVisible:Boolean(snapshot&&!snapshot.hidden&&getComputedStyle(snapshot).display!=='none'),
      footerMinTarget:footerLinks.length?Math.min(...footerLinks.map(link=>link.getBoundingClientRect().height)):0,
      cityButtons:cityButtons.length,
      activeCity:cityButtons.find(button=>button.getAttribute('aria-pressed')==='true')?.dataset.v1182City||'',
      visibleCities:[...new Set(cards.map(card=>card.dataset.v1182CityCard))],
      visibleFormatNames:cards.map(card=>card.querySelector('.cc-v118-catalog-copy>strong')?.textContent?.trim()||''),
      cityFilterFits:Boolean(filterRect&&filterRect.width<=innerWidth+1),
      cityFilterScrollable:Boolean(cityFilter&&cityFilter.scrollWidth>cityFilter.clientWidth+1),
      detailCloseInside:Boolean(!closeRect||(closeRect.left>=-1&&closeRect.right<=innerWidth+1)),
      headerBottom:Math.round(headerRect?.bottom||0),
      navBottom:Math.round(navRect?.bottom||0),
      headerContainsNav:Boolean(!headerRect||!navRect||(navRect.top>=headerRect.top-1&&navRect.bottom<=headerRect.bottom+1)),
      headerContentGap:headerRect&&contentRect?Math.round(contentRect.top-headerRect.bottom):0,
      headerContentOverlap:Boolean(headerRect&&contentRect&&contentRect.top<headerRect.bottom-1),
      overflow:Math.max(doc.scrollWidth,document.body.scrollWidth)-innerWidth,
    };
  });
}

function expect(value,message){if(!value)throw new Error(message);}
