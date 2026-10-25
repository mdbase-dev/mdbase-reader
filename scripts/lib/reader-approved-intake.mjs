// ONLY data/local qualification expectations from the actual eaa4 owner handoff.
// Local consumer builds only; no SDK producer/reauth/admission.
// Old c0bc/8c2 originals remain immutable historical custody, not new qualification.
// NEVER a live publisher fallback: live guard requires four protected env values.
export const approvedHashes = Object.freeze({
  NATIVE_SDK_SHA256: "15eb64b50fc7c2809ff3dba9cce5104fe48d8592208b3af8acb529862a1af18c",
  NATIVE_UI_SHA256: "8f785294454321c40596bdaad976dc4c5374c3f23dfa828f47e3e7b3139b77e5",
  NATIVE_PROTOCOL_SHA256: "cd1e15236ab7e25c511a4ba13af6a9df23f4b41715161479bba97b0445e1c138",
  NATIVE_TRUST_ASSET_SHA256: "67e117646c9c26927f0d5a44cbd26f057c318975032e9cd24f24b020150cdbc7",
});
// Production beta141 packet with the #964 runtime; staging remains a historical fixture.
export const approvedProductionHashes = Object.freeze({
  ...approvedHashes,
  NATIVE_SDK_SHA256: "f05837e4571a7e528d289dea6a9d2ee2e5c2e3a1e4f8f70fe772a8138e32f970",
  NATIVE_TRUST_ASSET_SHA256: "7912e40838213e60b65848350d319a48019021317b112e3326429b250f0133d7",
});
