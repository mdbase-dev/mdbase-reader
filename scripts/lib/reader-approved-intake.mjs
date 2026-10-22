// ONLY data/local qualification expectations from the actual eaa4 owner handoff.
// Co072350 resumes ONE target consumer build; no SDK producer/reauth/admission.
// Old c0bc/8c2 originals remain immutable historical custody, not new qualification.
// NEVER a live publisher fallback: live guard requires four protected env values.
export const approvedHashes = Object.freeze({
  NATIVE_SDK_SHA256: "15eb64b50fc7c2809ff3dba9cce5104fe48d8592208b3af8acb529862a1af18c",
  NATIVE_UI_SHA256: "8f785294454321c40596bdaad976dc4c5374c3f23dfa828f47e3e7b3139b77e5",
  NATIVE_PROTOCOL_SHA256: "cd1e15236ab7e25c511a4ba13af6a9df23f4b41715161479bba97b0445e1c138",
  NATIVE_TRUST_ASSET_SHA256: "67e117646c9c26927f0d5a44cbd26f057c318975032e9cd24f24b020150cdbc7",
});
