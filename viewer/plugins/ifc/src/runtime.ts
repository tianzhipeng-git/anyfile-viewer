export const IFC_VERSION = "0.0.78";
export const IFC_ASSET_SOURCES = [
  { name: "jsDelivr", value: `https://cdn.jsdelivr.net/npm/web-ifc@${IFC_VERSION}/web-ifc-api.js` },
  { name: "R2", value: `https://assets.anyfile.top/vendor/web-ifc/${IFC_VERSION}/web-ifc-api.js` },
  { name: "local", value: `/vendor/web-ifc/${IFC_VERSION}/web-ifc-api.js` },
] as const;
