import '/studio/studio-catalog-commerce-v143.js?v=4';

const RELEASE='neptune-studio-city-drawer-v143-4';

function cleanCityDrawer(){
  document.body.dataset.cityDrawerV1434=RELEASE;
  const drawer=document.querySelector('.v143-city-drawer');
  if(!drawer)return;
  drawer.dataset.cityDrawerV1434='1';
  const input=drawer.querySelector('input[name="name"]');
  if(input){
    input.removeAttribute('list');
    input.setAttribute('autocomplete','off');
    input.setAttribute('autocapitalize','off');
    input.setAttribute('spellcheck','false');
    input.setAttribute('data-city-autocomplete','neptune');
  }
  for(const datalist of drawer.querySelectorAll('datalist'))datalist.remove();
  const field=input?.closest('label');
  if(field){
    const helps=[...field.querySelectorAll('small')];
    for(const help of helps){
      if(!help.classList.contains('v143-city-help'))help.hidden=true;
    }
  }
}

cleanCityDrawer();
new MutationObserver(cleanCityDrawer).observe(document.body,{childList:true,subtree:true});
