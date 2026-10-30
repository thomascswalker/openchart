/** Branded stable identifier for an editable MIDI entity. */
declare const entityIdBrand: unique symbol;
export type EntityId = string & { readonly [entityIdBrand]: true };

/** Entity categories exposed by editing modes. */
export enum EntityType {
  Note = "note",
  Phrase = "phrase",
  Lyric = "lyric",
  Text = "text",
  Tempo = "tempo",
  TimeSignature = "time-signature",
  Unknown = "unknown",
}

export type TrackEntityType = EntityType.Note | EntityType.Text;
export type GlobalEntityType = EntityType.Tempo | EntityType.TimeSignature;

export interface Entity {
  type: EntityType;
  eventId: string;
  trackIndex?: number;
}

export interface ParsedEntityId {
  kind: EntityType;
  eventId: string;
  trackIndex: number | null;
}

/** Read-only handle of a MIDI note exposed to modes and projections. */
export interface NoteHandle {
  readonly id: EntityId;
  readonly trackIndex: number;
  readonly tick: number;
  readonly pitch: number;
  readonly duration: number;
  readonly velocity: number;
}

function formatTrackEntityId(
  type: TrackEntityType,
  trackIndex: number,
  eventId: string,
): EntityId {
  if (!Number.isSafeInteger(trackIndex) || trackIndex < 0) {
    throw new RangeError("trackIndex must be a non-negative safe integer");
  }
  if (!eventId) {
    throw new RangeError("eventId must not be empty");
  }
  return `${type}:${trackIndex}:${eventId}` as EntityId;
}

function formatGlobalEntityId(
  type: GlobalEntityType,
  eventId: string,
): EntityId {
  if (!eventId) {
    throw new RangeError("eventId must not be empty");
  }
  return `${type}:${eventId}` as EntityId;
}

/** Formats the stable note identifier without changing its existing shape. */
export function formatNoteId(trackIndex: number, eventId: string): EntityId {
  return formatTrackEntityId(EntityType.Note, trackIndex, eventId);
}

/** Formats the stable text-event identifier. */
export function formatTextId(trackIndex: number, eventId: string): EntityId {
  return formatTrackEntityId(EntityType.Text, trackIndex, eventId);
}

/** Formats the stable global tempo-event identifier. */
export function formatTempoId(eventId: string): EntityId {
  return formatGlobalEntityId(EntityType.Tempo, eventId);
}

/** Formats the stable global time-signature-event identifier. */
export function formatTimeSignatureId(eventId: string): EntityId {
  return formatGlobalEntityId(EntityType.TimeSignature, eventId);
}

/**
 * Parses a stable entity identifier.
 *
 * @param id The stable entity identifier to parse.
 * @returns The parsed entity object, or null if the ID is malformed.
 */
export function parseEntityFromId(id: string): Entity | null {
  // Determine the type of entity and the rest of the ID after the first colon.
  const separator = id.indexOf(":");

  // If there is no colon or it's the first character, the ID is malformed.
  if (separator < 1) {
    return null;
  }

  // Extract the type and the rest of the ID.
  const type = id.slice(0, separator);
  const rest = id.slice(separator + 1);

  // Handle global entities. These have no track index and only consist of the
  // type and event ID.
  switch (type) {
    case EntityType.Tempo:
    case EntityType.TimeSignature:
      return rest.length > 0 ? { type: type, eventId: rest } : null;
    case EntityType.Note:
    case EntityType.Text:
      break;
    default:
      return null;
  }

  // Handle track-based entities. These have a track index followed by the
  // event ID.
  const trackSeparator = rest.indexOf(":");

  // If there is no colon or it's the first character, the track-based ID is
  // malformed.
  if (trackSeparator < 1) {
    return null;
  }

  // Extract the track index and event ID from the rest of the ID.
  const trackText = rest.slice(0, trackSeparator);

  // Extract the event ID from the rest of the ID.
  const eventId = rest.slice(trackSeparator + 1);

  // Validate the track index and event ID. The track index must be a
  // non-negative integer and the event ID must be non-empty.
  if (!/^(0|[1-9]\d*)$/.test(trackText) || eventId.length === 0) {
    return null;
  }

  // Convert the track index to a number and ensure it is a safe integer.
  const trackIndex = Number(trackText);
  if (!Number.isSafeInteger(trackIndex)) {
    return null;
  }

  // Return the parsed track-based entity object.
  return { type: type, eventId, trackIndex };
}

/** Parses an entity ID into the legacy kind/nullable-track shape. */
export function parseEntityId(id: string): ParsedEntityId | null {
  const entity = parseEntityFromId(id);
  return entity
    ? {
        kind: entity.type,
        eventId: entity.eventId,
        trackIndex: entity.trackIndex ?? null,
      }
    : null;
}
