import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const scientificDataManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "scientific-data",
  name: { en: "Scientific data container viewer", "zh-CN": "科学多维数据容器查看器" },
  formats: [
    {
      name: { en: "HDF5 data container", "zh-CN": "HDF5 科学数据容器" },
      extensions: [".h5", ".hdf5"],
      mimeTypes: ["application/x-hdf", "application/x-hdf5"],
    },
    {
      name: { en: "NetCDF data file", "zh-CN": "NetCDF 科学数据文件" },
      extensions: [".nc", ".nc4"],
      mimeTypes: ["application/x-netcdf"],
    },
    {
      name: { en: "MATLAB MAT-file", "zh-CN": "MATLAB MAT 数据文件" },
      extensions: [".mat"],
      mimeTypes: ["application/x-matlab-data"],
    },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
