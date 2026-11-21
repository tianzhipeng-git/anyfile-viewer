import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const bittorrentManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "bittorrent-metadata",
  name: { en: "BitTorrent metadata viewer", "zh-CN": "BitTorrent 种子查看器" },
  formats: [{
    name: { en: "BitTorrent metainfo", "zh-CN": "BitTorrent 种子" },
    extensions: [".torrent"],
    mimeTypes: ["application/x-bittorrent"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
