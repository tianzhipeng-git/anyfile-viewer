export const DWG_ARTIFACT_VERSION = "0.14-anyfile.1";
export const DWG_ASSET_SOURCES = [
  { name: "R2", value: `https://assets.anyfile.top/vendor/libredwg/${DWG_ARTIFACT_VERSION}/dist/libredwg-web.js` },
  { name: "local", value: `/vendor/libredwg/${DWG_ARTIFACT_VERSION}/dist/libredwg-web.js` },
] as const;
