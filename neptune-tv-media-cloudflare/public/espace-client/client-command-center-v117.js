const RELEASE='neptune-client-command-center-legacy-disabled-20260908-v181';

// Compatibility shim only.
// The client home is owned exclusively by client-command-center-v118-1.js.
// Keeping this legacy module inert prevents the old v117 runtime from racing
// the v118 runtime, hiding/recreating the format catalogue and moving the
// user's viewport during asynchronous session/catalog refreshes.
document.documentElement.dataset.clientCommandCenterLegacy='disabled-v181';
document.documentElement.dataset.clientCommandCenterLegacyRelease=RELEASE;
