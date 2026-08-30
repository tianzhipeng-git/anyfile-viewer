export interface AudioFileInspection {
  readonly container: string;
  readonly codec: string;
  readonly mimeType: string;
  readonly channels?: number;
  readonly sampleRate?: number;
  readonly bitsPerSample?: number;
}
