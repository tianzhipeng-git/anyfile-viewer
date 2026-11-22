export type TorrentFile = {
  readonly path: string;
  readonly length: number;
};

export type TorrentTracker = {
  readonly url: string;
  /** Present for multi-tracker BEP-12 tiers: index of the tier this URL belongs to. */
  readonly tier?: number;
};

export type TorrentDocument = {
  readonly name: string;
  readonly comment?: string;
  readonly createdBy?: string;
  readonly creationDate?: Date;
  readonly announce?: string;
  readonly trackers: readonly TorrentTracker[];
  readonly webSeeds: readonly string[];
  readonly pieceLength?: number;
  readonly pieceCount?: number;
  readonly isPrivate: boolean;
  readonly files: readonly TorrentFile[];
  readonly totalSize: number;
  /** Hex-encoded SHA-1 infohash of the raw `info` dictionary, when computable. */
  readonly infoHash?: string;
};
