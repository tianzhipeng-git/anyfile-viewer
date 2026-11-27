/** pdf.js ships no types for its worker entry; `./extract` only preloads it for the main-thread fake worker. */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
