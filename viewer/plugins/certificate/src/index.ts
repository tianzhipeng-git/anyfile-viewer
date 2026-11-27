import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";

import { MAX_CERTIFICATE_FILE_BYTES as MAX_FILE_BYTES, decodeCertificates, fingerprints } from "./certificate";
import { certificateManifest } from "./manifest";
import { inspectCertificate } from "./probe";
import { createCertificateView, type ViewCertificate } from "./ui";

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openCertificate(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, reportPreview, signal } = context;
  const copy = selectMessages(locale, {
    en: {
      reading: "Reading certificate file…",
      parsing: "Parsing X.509 certificate…",
      ready: "Certificate opened",
      invalid: "The file is damaged or does not contain an X.509 certificate.",
      tooLarge: "This file is larger than the 8 MiB certificate limit.",
    },
    "zh-CN": {
      reading: "正在读取证书文件…",
      parsing: "正在解析 X.509 证书…",
      ready: "证书已打开",
      invalid: "文件已损坏，或不包含可读取的 X.509 证书。",
      tooLarge: "该文件超过 8 MiB 的证书查看上限。",
    },
  });
  let view: ReturnType<typeof createCertificateView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    if (file.size > MAX_FILE_BYTES) throw new ViewerError("resource-limit", copy.tooLarge);
    if (!await inspectCertificate(context)) throw new ViewerError("invalid-file", copy.invalid);

    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "parsing", message: copy.parsing });
    const reports = decodeCertificates(bytes);
    const certificates: ViewCertificate[] = [];
    for (const report of reports) {
      certificates.push({ report, fingerprints: await fingerprints(report.der, signal) });
    }
    if (signal.aborted) throw abortError();

    view = createCertificateView({ certificates, fileName: file.name, fileSize: file.size, locale });
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const certificateViewer: FileViewerPlugin = { manifest: certificateManifest, open: openCertificate };
export { certificateManifest } from "./manifest";
