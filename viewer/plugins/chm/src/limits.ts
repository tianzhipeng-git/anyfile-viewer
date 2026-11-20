export const CHM_LIMITS = {
  maxFileBytes: 128 * 1024 * 1024,
  maxHeaderBytes: 512,
  maxDirChunks: 4096,
  maxEntries: 20_000,
  maxSectionBytes: 128 * 1024 * 1024,
  maxSystemBytes: 4 * 1024 * 1024,
  maxTopicBytes: 2 * 1024 * 1024,
  maxTopics: 2000,
  maxTocItems: 10_000,
  maxResetEntries: 65_536,
  maxResetIntervalBytes: 16 * 1024 * 1024,
  maxCachedIntervals: 8,
} as const;
