import { importRuntime } from "@anyfile/runtime-assets";
import { AgentError, type BinarySource, type ExtractContext } from "@anyfile/viewer-protocol";
import { Hdf5Engine, type H5FileLike } from "./hdf5-engine";
import { H5WASM_RUNTIME_BASE, type ContainerFormat, type ScientificDataSource } from "./types";

const PLUGIN_ID = "scientific-data";
/** Vendor path of the same h5wasm build the Web worker loads from `/vendor/`. */
const VENDOR_DIR = H5WASM_RUNTIME_BASE.replace(/^\/vendor\//, "");
const MOUNT_DIR = "/agent";
const S_IFREG_READONLY = 0o100444;
const EINVAL = 28;

type EmFsNode = { id: number; mode: number; node_ops: unknown; stream_ops: unknown };
type EmFs = {
  mkdir(path: string): void;
  lookupPath(path: string): { node: EmFsNode };
  createNode(parent: EmFsNode, name: string, mode: number, rdev: number): EmFsNode;
  unlink(path: string): void;
  ErrnoError: new (errno: number) => Error;
};
type H5Wasm = { readonly ready: Promise<{ readonly FS: EmFs }>; readonly File: new (path: string, mode: "r") => H5FileLike };

let runtime: Promise<{ readonly h5: H5Wasm; readonly fs: EmFs }> | undefined;
let nextFileId = 1;

function loadRuntime(context: ExtractContext) {
  runtime ??= (async () => {
    await context.vendor.url(`${VENDOR_DIR}hdf5_util.js`);
    const mod = await importRuntime<{ default?: H5Wasm } & H5Wasm>(await context.vendor.url(`${VENDOR_DIR}hdf5_hl.js`));
    const h5 = mod.default ?? mod;
    const { FS } = await h5.ready;
    try {
      FS.mkdir(MOUNT_DIR);
    } catch {
      // Already created by an earlier call in this worker.
    }
    return { h5, fs: FS };
  })().catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `h5wasm runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  });
  return runtime;
}

/**
 * Exposes `source` as a read-only Emscripten file whose reads go straight to `source.readSync`,
 * the Node counterpart of the Web worker's WORKERFS mount: libhdf5 only reads the ranges it needs.
 */
function createSourceFile(fs: EmFs, source: BinarySource): { readonly path: string; remove(): void } {
  const name = `file_${nextFileId++}.h5`;
  const node = fs.createNode(fs.lookupPath(MOUNT_DIR).node, name, S_IFREG_READONLY, 0);
  const size = source.size;
  node.node_ops = {
    getattr: (n: EmFsNode) => ({
      dev: 1, ino: n.id, mode: n.mode, nlink: 1, uid: 0, gid: 0, rdev: 0, size,
      atime: new Date(0), mtime: new Date(0), ctime: new Date(0), blksize: 4096, blocks: Math.ceil(size / 4096),
    }),
    setattr() {},
  };
  node.stream_ops = {
    read(_stream: unknown, buffer: Int8Array, offset: number, length: number, position: number) {
      if (position >= size) return 0;
      return source.readSync(position, new Uint8Array(buffer.buffer, buffer.byteOffset + offset, Math.min(length, size - position)));
    },
    llseek(stream: { position: number }, offset: number, whence: number) {
      const position = offset + (whence === 1 ? stream.position : whence === 2 ? size : 0);
      if (position < 0) throw new fs.ErrnoError(EINVAL);
      return position;
    },
  };
  const path = `${MOUNT_DIR}/${name}`;
  return {
    path,
    remove() {
      try {
        fs.unlink(path);
      } catch {
        // Ignore cleanup errors.
      }
    },
  };
}

/** Opens an HDF5-based container (HDF5, NetCDF-4, MATLAB v7.3) in Node through the shared `Hdf5Engine`. */
export async function openHdf5NodeSource(context: ExtractContext, format: ContainerFormat): Promise<ScientificDataSource> {
  const { h5, fs } = await loadRuntime(context);
  const mounted = createSourceFile(fs, context.source);
  let engine: Hdf5Engine;
  try {
    engine = new Hdf5Engine(new h5.File(mounted.path, "r"), format, context.source.size);
  } catch (error) {
    mounted.remove();
    throw new AgentError("invalid-file", `HDF5 open failed: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  }
  try {
    const summary = engine.summary();
    return {
      summary,
      listGroup: async (path) => engine.listGroup(path),
      inspectDataset: async (path) => engine.inspectDataset(path),
      readSlice: async (request) => engine.readSlice(request),
      readHeatmap: async (request) => engine.readHeatmap(request),
      dispose() {
        engine.close();
        mounted.remove();
      },
    };
  } catch (error) {
    engine.close();
    mounted.remove();
    throw error;
  }
}
