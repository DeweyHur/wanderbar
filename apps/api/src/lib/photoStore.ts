import { del, get, put } from "@vercel/blob";

/**
 * Where photo files live: the private Vercel Blob store in production (BLOB_READ_WRITE_TOKEN), an
 * in-memory map for tests and local runs without a token. Files are only ever served through our API.
 */
export type PhotoStore = {
  put(path: string, body: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; contentType: string } | null>;
  delete(paths: string[]): Promise<void>;
};

const memory = new Map<string, { body: Uint8Array; contentType: string }>();
export const memoryStore: PhotoStore = {
  async put(path, body, contentType) {
    memory.set(path, { body, contentType });
  },
  async get(path) {
    return memory.get(path) ?? null;
  },
  async delete(paths) {
    for (const p of paths) memory.delete(p);
  },
};

const blobStore: PhotoStore = {
  async put(path, body, contentType) {
    await put(path, Buffer.from(body), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  },
  async get(path) {
    const r = await get(path, { access: "private" });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return { body: r.stream, contentType: r.blob.contentType };
  },
  async delete(paths) {
    if (paths.length) await del(paths);
  },
};

export const photoStore = (): PhotoStore => (process.env.BLOB_READ_WRITE_TOKEN ? blobStore : memoryStore);
