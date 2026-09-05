export const OCCT_ARTIFACT_VERSION = "0.0.23-anyfile.1";

export const OCCT_ASSET_SOURCES = [
  { name: "R2", value: `https://assets.anyfile.top/vendor/occt-import-js/${OCCT_ARTIFACT_VERSION}/occt-import-js.js` },
  { name: "local", value: `/vendor/occt-import-js/${OCCT_ARTIFACT_VERSION}/occt-import-js.js` },
] as const;
