import '/studio/studio-catalog-commerce-v143.js?v=2';

const cleanCityInput=()=>{
  const input=document.querySelector('.v143-city-drawer input[name="name"]');
  if(!input)return;
  input.removeAttribute('list');
  input.setAttribute('autocomplete','off');
  input.setAttribute('autocapitalize','off');
  input.setAttribute('spellcheck','false');
  const form=input.closest('form')||input.closest('.v133-simple-form');
  if(form){
    for(const datalist of form.querySelectorAll('datalist'))datalist.remove();
  }
};

cleanCityInput();
new MutationObserver(cleanCityInput).observe(document.body,{childList:true,subtree:true});
