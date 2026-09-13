const RELEASE='neptune-client-catalog-interaction-20260913-v118.10-native-anchor-shim';
const ROOT=document.documentElement;

if(!window.__neptuneClientCatalogInteractionV1187){
  window.__neptuneClientCatalogInteractionV1187=true;
  ROOT.dataset.clientCatalogInteractionV1187='native-anchor';
  ROOT.dataset.clientCatalogInteractionRelease=RELEASE;
  ROOT.dataset.clientCatalogNavigationOwner='native-anchor';
}

// Compatibility shim only.
// Catalogue cards are real same-origin <a href> elements rendered by
// client-visual-coherence-v118-2.js. Do not intercept pointerdown, pointerup,
// click, focus, or mutate/replace cards: native browser navigation is the
// single interaction owner and preserves keyboard/mouse/touch semantics.
