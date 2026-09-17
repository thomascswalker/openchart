/**
 * Minimal browser ZIP adapter used for .midproject files.
 *
 * We intentionally create uncompressed ("stored") ZIP entries. This keeps
 * the archive deterministic and lets the editor work without Node buffers,
 * filesystem APIs, or a heavyweight bundle dependency. The reader rejects
 * unsupported compression methods instead of silently accepting bad data.
 */
const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 0x0800;

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function write32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function read16(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.length) throw new Error("ZIP archive is truncated.");
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function read32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error("ZIP archive is truncated.");
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function join(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (
      !entry.name ||
      entry.name.includes("\\") ||
      entry.name.startsWith("/")
    ) {
      throw new Error(`Invalid ZIP entry name: ${entry.name}`);
    }
    if (seen.has(entry.name))
      throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    seen.add(entry.name);

    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    write32(local, 0, LOCAL_FILE_HEADER);
    write16(local, 4, 20);
    write16(local, 6, UTF8_FLAG);
    write16(local, 8, 0); // stored; deterministic and universally readable
    write16(local, 10, 0);
    write16(local, 12, 0);
    write32(local, 14, checksum);
    write32(local, 18, entry.bytes.length);
    write32(local, 22, entry.bytes.length);
    write16(local, 26, name.length);
    write16(local, 28, 0);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    locals.push(local);

    const directory = new Uint8Array(46 + name.length);
    write32(directory, 0, CENTRAL_DIRECTORY_HEADER);
    write16(directory, 4, 20);
    write16(directory, 6, 20);
    write16(directory, 8, UTF8_FLAG);
    write16(directory, 10, 0);
    write16(directory, 12, 0);
    write16(directory, 14, 0);
    write32(directory, 16, checksum);
    write32(directory, 20, entry.bytes.length);
    write32(directory, 24, entry.bytes.length);
    write16(directory, 28, name.length);
    write16(directory, 30, 0);
    write16(directory, 32, 0);
    write16(directory, 34, 0);
    write16(directory, 36, 0);
    write32(directory, 38, 0);
    write32(directory, 42, offset);
    directory.set(name, 46);
    central.push(directory);
    offset += local.length;
  }

  const centralBytes = join(central);
  const end = new Uint8Array(22);
  write32(end, 0, END_OF_CENTRAL_DIRECTORY);
  write16(end, 4, 0);
  write16(end, 6, 0);
  write16(end, 8, entries.length);
  write16(end, 10, entries.length);
  write32(end, 12, centralBytes.length);
  write32(end, 16, offset);
  write16(end, 20, 0);
  return join([...locals, centralBytes, end]);
}

function findEndOfDirectory(bytes: Uint8Array): number {
  const firstOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= firstOffset; offset -= 1) {
    if (read32(bytes, offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("Invalid ZIP archive: end-of-directory record is missing.");
}

/** Read the subset emitted by createZip, with structural and CRC validation. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const decoder = new TextDecoder();
  const endOffset = findEndOfDirectory(bytes);
  if (
    read16(bytes, endOffset + 4) !== 0 ||
    read16(bytes, endOffset + 6) !== 0
  ) {
    throw new Error("Multi-disk ZIP archives are not supported.");
  }
  const entryCount = read16(bytes, endOffset + 10);
  const directorySize = read32(bytes, endOffset + 12);
  let offset = read32(bytes, endOffset + 16);
  if (offset + directorySize > endOffset) {
    throw new Error(
      "Invalid ZIP archive: central directory is outside the archive.",
    );
  }

  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (read32(bytes, offset) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error(
        "Invalid ZIP archive: malformed central directory entry.",
      );
    }
    const compression = read16(bytes, offset + 10);
    const checksum = read32(bytes, offset + 16);
    const compressedSize = read32(bytes, offset + 20);
    const uncompressedSize = read32(bytes, offset + 24);
    const nameLength = read16(bytes, offset + 28);
    const extraLength = read16(bytes, offset + 30);
    const commentLength = read16(bytes, offset + 32);
    const localOffset = read32(bytes, offset + 42);
    const name = decoder.decode(
      bytes.slice(offset + 46, offset + 46 + nameLength),
    );
    offset += 46 + nameLength + extraLength + commentLength;

    if (compression !== 0) {
      throw new Error(`ZIP entry '${name}' uses unsupported compression.`);
    }
    if (read32(bytes, localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`ZIP entry '${name}' has an invalid local header.`);
    }
    const localNameLength = read16(bytes, localOffset + 26);
    const localExtraLength = read16(bytes, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataOffset, dataOffset + compressedSize);
    if (data.length !== compressedSize || compressedSize !== uncompressedSize) {
      throw new Error(`ZIP entry '${name}' is truncated or has invalid sizes.`);
    }
    if (crc32(data) !== checksum)
      throw new Error(`ZIP entry '${name}' failed CRC validation.`);
    if (entries.has(name))
      throw new Error(`ZIP archive contains duplicate entry '${name}'.`);
    entries.set(name, data);
  }
  if (offset !== read32(bytes, endOffset + 16) + directorySize) {
    throw new Error(
      "Invalid ZIP archive: central directory size does not match entries.",
    );
  }
  return entries;
}
