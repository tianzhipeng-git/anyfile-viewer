import {
  AGENT_ERROR_CODES,
  AgentError,
  DEFAULT_READ_MAX_BYTES,
  HARD_READ_MAX_BYTES,
  isViewerAbortError,
  type BinarySource,
  type ExtractContext,
  type InspectPayload,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";

export interface ExtractorComplianceFixture {
  readonly name: string;
  /** Real file path on disk (preferred in Node tests) or in-memory bytes. */
  readonly filePath?: string;
  readonly bytes?: Uint8Array;
  /** Optional invalid/corrupted sample to verify standard AgentErrorCode mapping. */
  readonly invalidBytes?: Uint8Array;
  /** Optional read-only SQL query for extractors that implement `query`. */
  readonly sampleQuery?: string;
  /** Optional write SQL query that must be rejected by `query`. */
  readonly writeQuery?: string;
  /** Optional target id expected to exist; if omitted, uses the first target returned by inspect(). */
  readonly targetId?: string;
  /** Optional maxBytes for testing truncation / pagination (defaults to 256). */
  readonly smallMaxBytes?: number;
  /** Optional keyword for a filtered pagination walk over the target. */
  readonly filter?: string;
}

const MAX_WALK_PAGES = 500;
const VALID_ERROR_CODES = new Set<string>(AGENT_ERROR_CODES);
const VALID_CONTENT_TYPES = new Set(["markdown", "json", "text"]);
const utf8Length = (value: string) => new TextEncoder().encode(value).byteLength;

export function createBufferBinarySource(
  bytes: Uint8Array,
  name: string,
  filePath?: string,
): BinarySource {
  const copy = new Uint8Array(bytes);
  return {
    name,
    size: copy.byteLength,
    ...(filePath ? { filePath } : {}),
    async read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const start = Math.max(0, Math.min(offset, copy.byteLength));
      const end = Math.max(start, Math.min(start + Math.max(0, length), copy.byteLength));
      return copy.slice(start, end);
    },
    readSync(offset: number, target: Uint8Array): number {
      if (offset >= copy.byteLength || offset < 0 || target.byteLength === 0) return 0;
      const count = Math.min(target.byteLength, copy.byteLength - offset);
      target.set(copy.subarray(offset, offset + count), 0);
      return count;
    },
  };
}

async function createContextFromFixture(
  fixture: { readonly name: string; readonly filePath?: string; readonly bytes?: Uint8Array },
  signal: AbortSignal,
): Promise<ExtractContext> {
  let bytes: Uint8Array;
  let filePath: string | undefined;
  if (fixture.filePath) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    filePath = path.resolve(fixture.filePath);
    bytes = new Uint8Array(await fs.readFile(filePath));
  } else if (fixture.bytes) {
    bytes = fixture.bytes;
  } else {
    throw new Error(`Compliance fixture "${fixture.name}" must provide either filePath or bytes.`);
  }
  const source = createBufferBinarySource(bytes, fixture.name, filePath);
  const file = new File([new Uint8Array(bytes)], fixture.name);
  const { createNodeVendorAssets } = await import("@anyfile/runtime-assets/node");
  return { source, file, signal, vendor: createNodeVendorAssets() };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertInspectPayload(payload: InspectPayload, fixtureName: string): void {
  assert(payload && typeof payload === "object", `[${fixtureName}] inspect() must return an object.`);
  assert(
    payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata),
    `[${fixtureName}] inspect().metadata must be a plain object.`,
  );
  // Ensure metadata is JSON-serializable.
  JSON.stringify(payload.metadata);
  assert(Array.isArray(payload.targets), `[${fixtureName}] inspect().targets must be an array.`);
  const seenIds = new Set<string>();
  for (const target of payload.targets) {
    assert(typeof target.id === "string" && target.id.length > 0, `[${fixtureName}] target.id must be a non-empty string.`);
    assert(typeof target.title === "string" && target.title.length > 0, `[${fixtureName}] target.title must be a non-empty string.`);
    assert(!seenIds.has(target.id), `[${fixtureName}] duplicate target.id "${target.id}".`);
    seenIds.add(target.id);
    if (target.size !== undefined) {
      assert(typeof target.size === "number" && target.size >= 0, `[${fixtureName}] target.size must be a non-negative number.`);
    }
  }
}

function assertReadResult(result: ReadResult, maxBytes: number, label: string): void {
  assert(result && typeof result === "object", `${label}: read() must return an object.`);
  assert(typeof result.content === "string", `${label}: content must be a string.`);
  assert(VALID_CONTENT_TYPES.has(result.contentType), `${label}: invalid contentType "${result.contentType}".`);
  assert(typeof result.truncated === "boolean", `${label}: truncated must be a boolean.`);
  const actualBytes = utf8Length(result.content);
  const hardBound = Math.min(maxBytes, HARD_READ_MAX_BYTES);
  assert(
    actualBytes <= hardBound,
    `${label}: content byte length (${actualBytes}) exceeded maxBytes (${hardBound}).`,
  );
  if (result.nextCursor !== undefined) {
    assert(typeof result.nextCursor === "string" && result.nextCursor.length > 0, `${label}: nextCursor must be a non-empty string.`);
  }
}

function assertStandardAgentError(error: unknown, expectedCodes: readonly string[], label: string): void {
  assert(
    error instanceof AgentError || (typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"),
    `${label}: expected AgentError with standard AgentErrorCode, received ${String(error)}`,
  );
  const code = (error as { code: string }).code;
  assert(
    VALID_ERROR_CODES.has(code),
    `${label}: error code "${code}" is not a valid AgentErrorCode.`,
  );
  if (expectedCodes.length > 0) {
    assert(
      expectedCodes.includes(code),
      `${label}: expected error code in [${expectedCodes.join(", ")}], received "${code}".`,
    );
  }
}

/**
 * Shared compliance suite for plugin `./extract` implementations.
 * Verifies inspect/targets, read/cursor/maxBytes, optional query read-only guard,
 * optional renderImage bounds, AbortSignal cancellation, AgentErrorCode mapping,
 * and zero network access during execution.
 */
export async function assertExtractorCompliance(
  extractor: StructuredExtractor,
  fixtures: readonly ExtractorComplianceFixture[],
): Promise<void> {
  assert(fixtures.length > 0, "assertExtractorCompliance requires at least one fixture.");

  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = (async () => {
    networkCalls += 1;
    throw new Error("Network requests are forbidden during ./extract execution.");
  }) as typeof fetch;

  try {
    for (const fixture of fixtures) {
      const controller = new AbortController();
      const context = await createContextFromFixture(fixture, controller.signal);

      // 1. inspect()
      const inspected = await extractor.inspect(context);
      assertInspectPayload(inspected, fixture.name);

      // 2. read() default target with default budget (48 KiB)
      const defaultRead = await extractor.read(context, { maxBytes: DEFAULT_READ_MAX_BYTES });
      assertReadResult(defaultRead, DEFAULT_READ_MAX_BYTES, `[${fixture.name}] default read`);

      // 3. read() explicit target
      const targetId = fixture.targetId ?? inspected.targets[0]?.id;
      if (targetId) {
        const targeted = await extractor.read(context, {
          target: targetId,
          maxBytes: DEFAULT_READ_MAX_BYTES,
        });
        assertReadResult(targeted, DEFAULT_READ_MAX_BYTES, `[${fixture.name}] target read (${targetId})`);

        // 4. maxBytes trimming + full cursor walk (with and without filter) must terminate without repeats
        const smallBudget = fixture.smallMaxBytes ?? 256;
        for (const filter of fixture.filter ? [undefined, fixture.filter] : [undefined]) {
          const seenCursors = new Set<string>();
          let cursor: string | undefined;
          for (let page = 0; ; page += 1) {
            assert(page < MAX_WALK_PAGES, `[${fixture.name}] pagination of ${targetId} did not finish in ${MAX_WALK_PAGES} pages.`);
            const result = await extractor.read(context, { target: targetId, cursor, filter, maxBytes: smallBudget });
            assertReadResult(result, smallBudget, `[${fixture.name}] ${filter ? `filter "${filter}" ` : ""}page ${page + 1}`);
            if (filter) assert(result.filterApplied === true, `[${fixture.name}] filtered read must set filterApplied.`);
            if (!result.nextCursor) break;
            assert(!seenCursors.has(result.nextCursor), `[${fixture.name}] cursor "${result.nextCursor}" repeated.`);
            seenCursors.add(result.nextCursor);
            cursor = result.nextCursor;
          }
        }
      }

      // 5. Unknown target must fail with target-not-found
      let missingTargetErr: unknown;
      try {
        await extractor.read(context, {
          target: "__anyfile_nonexistent_target_id__",
          maxBytes: DEFAULT_READ_MAX_BYTES,
        });
      } catch (error) {
        missingTargetErr = error;
      }
      assertStandardAgentError(missingTargetErr, ["target-not-found"], `[${fixture.name}] unknown target`);

      // 6. Optional query() read-only protection
      if (extractor.query) {
        if (fixture.sampleQuery) {
          const queryRes = await extractor.query(context, {
            sql: fixture.sampleQuery,
            maxBytes: DEFAULT_READ_MAX_BYTES,
          });
          assertReadResult(queryRes, DEFAULT_READ_MAX_BYTES, `[${fixture.name}] sample query`);
        }
        const writeSql = fixture.writeQuery ?? "CREATE TABLE __anyfile_forbidden_write (id INTEGER)";
        let writeErr: unknown;
        try {
          await extractor.query(context, {
            sql: writeSql,
            maxBytes: DEFAULT_READ_MAX_BYTES,
          });
        } catch (error) {
          writeErr = error;
        }
        assert(writeErr !== undefined, `[${fixture.name}] query() must reject write statement: ${writeSql}`);
        assertStandardAgentError(
          writeErr,
          ["unsupported-capability", "access-denied", "invalid-file"],
          `[${fixture.name}] write query rejection`,
        );
      }

      // 7. Optional renderImage() dimension bounds
      if (extractor.renderImage) {
        const maxDimension = 128;
        const image = await extractor.renderImage(context, {
          target: targetId,
          maxDimension,
        });
        assert(image.width > 0 && image.width <= maxDimension, `[${fixture.name}] renderImage width out of bounds: ${image.width}`);
        assert(image.height > 0 && image.height <= maxDimension, `[${fixture.name}] renderImage height out of bounds: ${image.height}`);
        assert(
          image.data instanceof Uint8ClampedArray && image.data.byteLength === image.width * image.height * 4,
          `[${fixture.name}] renderImage data length must equal width * height * 4`,
        );
      }

      // 8. AbortSignal cancellation
      const aborted = new AbortController();
      aborted.abort();
      const abortedContext = await createContextFromFixture(fixture, aborted.signal);
      let abortErr: unknown;
      try {
        await extractor.inspect(abortedContext);
      } catch (error) {
        abortErr = error;
      }
      assert(
        isViewerAbortError(abortErr),
        `[${fixture.name}] pre-aborted inspect() must reject with AbortError, received ${String(abortErr)}`,
      );

      // 9. Invalid bytes error code check
      if (fixture.invalidBytes) {
        const invalidContext = await createContextFromFixture(
          { name: fixture.name, bytes: fixture.invalidBytes },
          new AbortController().signal,
        );
        let invalidErr: unknown;
        try {
          await extractor.inspect(invalidContext);
        } catch (error) {
          invalidErr = error;
        }
        assertStandardAgentError(
          invalidErr,
          ["invalid-file", "encrypted-file", "resource-limit"],
          `[${fixture.name}] invalid fixture`,
        );
      }
    }

    assert(networkCalls === 0, `Expected zero network requests during compliance suite, observed ${networkCalls}.`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
