import { Midi } from "@midiedit/core";
import { createZip, readZip } from "./zipArchive";
import {
  PROJECT_FORMAT_VERSION,
  ProjectValidationError,
  type ProjectMetadata,
  validateProjectMetadata,
} from "./projectMetadata";

export const PROJECT_ARCHIVE_MIDI_ENTRY = "song.mid";
export const PROJECT_ARCHIVE_METADATA_ENTRY = "project.json";

export interface ProjectSource {
  fileName: string | null;
  fileHandle: FileSystemFileHandle | null;
}

export interface ProjectDocument {
  midi: Midi;
  metadata: ProjectMetadata;
  /** Data migration version stored in project.json's Version field. */
  archiveVersion: number;
  source: ProjectSource;
  dirty: boolean;
}

type ProjectMigration = (
  legacy: Record<string, unknown>,
) => Record<string, unknown>;

/** Add a migration from Version n to n + 1 here when format n + 1 ships. */
const PROJECT_MIGRATIONS: Readonly<Record<number, ProjectMigration>> = {};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function migrateMetadata(value: unknown): ProjectMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectValidationError([
      { path: "$", message: "must be an object" },
    ]);
  }
  let migrated = { ...(value as Record<string, unknown>) };
  const version: number = migrated.Version as number;
  if (!Number.isInteger(version)) {
    throw new ProjectValidationError([
      { path: "$.Version", message: "must be an integer" },
    ]);
  }
  if (version > PROJECT_FORMAT_VERSION) {
    throw new Error(
      `Project Version ${version} is newer than this editor supports (${PROJECT_FORMAT_VERSION}).`,
    );
  }
  while (migrated.Version !== PROJECT_FORMAT_VERSION) {
    const migration = PROJECT_MIGRATIONS[migrated.Version as number];
    if (!migration)
      throw new Error(`Project Version ${migrated.Version} is not supported.`);
    migrated = migration(migrated);
  }
  return validateProjectMetadata(migrated);
}

function requireEntry(
  entries: Map<string, Uint8Array>,
  name: string,
): Uint8Array {
  const entry = entries.get(name);
  if (!entry)
    throw new Error(`Project archive is missing required entry '${name}'.`);
  return entry;
}

export function createProjectDocument(
  midi: Midi,
  metadata: ProjectMetadata,
  source: ProjectSource = { fileName: null, fileHandle: null },
  dirty = false,
): ProjectDocument {
  const validated = validateProjectMetadata(metadata);
  return {
    midi,
    metadata: validated,
    archiveVersion: validated.Version,
    source,
    dirty,
  };
}

/** Serializes the canonical two-entry .midproject archive. */
export async function serializeProject(
  document: ProjectDocument,
): Promise<Uint8Array> {
  const metadata = validateProjectMetadata(document.metadata);
  if (
    metadata.Version !== PROJECT_FORMAT_VERSION ||
    document.archiveVersion !== metadata.Version
  ) {
    throw new Error(`Project Version must be ${PROJECT_FORMAT_VERSION}.`);
  }
  const midiBytes = document.midi.toBuffer();
  return createZip([
    {
      name: PROJECT_ARCHIVE_METADATA_ENTRY,
      bytes: new TextEncoder().encode(stableJson(metadata)),
    },
    { name: PROJECT_ARCHIVE_MIDI_ENTRY, bytes: midiBytes },
  ]);
}

/** Parses, migrates, and validates a .midproject archive. */
export async function deserializeProject(
  bytes: Uint8Array,
  source: ProjectSource = { fileName: null, fileHandle: null },
): Promise<ProjectDocument> {
  const entries = readZip(bytes);
  const metadataBytes = requireEntry(entries, PROJECT_ARCHIVE_METADATA_ENTRY);
  const midiBytes = requireEntry(entries, PROJECT_ARCHIVE_MIDI_ENTRY);
  let rawMetadata: any;
  try {
    rawMetadata = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes),
    );
  } catch (error) {
    throw new Error(
      `project.json is not valid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const metadata = migrateMetadata(rawMetadata);
  try {
    return createProjectDocument(
      new Midi(new Uint8Array(midiBytes)),
      metadata,
      source,
      false,
    );
  } catch (error) {
    throw new Error(
      `song.mid could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

export function exportMidi(document: ProjectDocument): {
  bytes: Uint8Array;
  suggestedName: string;
} {
  const originalName =
    document.source.fileName ?? document.metadata.Song.Name ?? "untitled";
  const baseName =
    originalName.replace(/\.(midproject|midi?|zip)$/i, "") || "untitled";
  return { bytes: document.midi.toBuffer(), suggestedName: `${baseName}.mid` };
}
