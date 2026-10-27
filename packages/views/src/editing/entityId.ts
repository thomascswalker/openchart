/** Branded stable identifier for an editable MIDI entity. */
export type EntityId = string & { readonly __entityId: unique symbol };

/** Entity categories exposed by editing modes. */
export type EntityKind =
  "note" | "phrase" | "lyric" | "text" | "tempo" | "time-signature";

/** Parsed stable identifier used by the editing kernel. */
export interface ParsedEntityId {
  kind: "note" | "text" | "tempo" | "time-signature";
  trackIndex: number | null;
  eventId: string;
}

/** Formats the stable note identifier without changing its existing shape. */
export function formatNoteId(trackIndex: number, eventId: string): EntityId {
  return formatTrackEntityId("note", trackIndex, eventId);
}

/** Formats the stable text-event identifier. */
export function formatTextId(trackIndex: number, eventId: string): EntityId {
  return formatTrackEntityId("text", trackIndex, eventId);
}

/** Formats the stable global tempo-event identifier. */
export function formatTempoId(eventId: string): EntityId {
  return formatGlobalEntityId("tempo", eventId);
}

/** Formats the stable global time-signature-event identifier. */
export function formatTimeSignatureId(eventId: string): EntityId {
  return formatGlobalEntityId("time-signature", eventId);
}

/** Parses a stable entity identifier, returning null for malformed IDs. */
export function parseEntityId(id: string): ParsedEntityId | null {
  const separator = id.indexOf(":");
  if (separator < 1) return null;
  const kind = id.slice(0, separator);
  const rest = id.slice(separator + 1);

  if (kind === "tempo" || kind === "time-signature") {
    return rest.length > 0 ? { kind, trackIndex: null, eventId: rest } : null;
  }
  if (kind !== "note" && kind !== "text") return null;

  const trackSeparator = rest.indexOf(":");
  if (trackSeparator < 1) return null;
  const trackText = rest.slice(0, trackSeparator);
  const eventId = rest.slice(trackSeparator + 1);
  if (!/^(0|[1-9]\d*)$/.test(trackText) || eventId.length === 0) return null;
  const trackIndex = Number(trackText);
  if (!Number.isSafeInteger(trackIndex)) return null;
  return { kind, trackIndex, eventId };
}

function formatTrackEntityId(
  kind: "note" | "text",
  trackIndex: number,
  eventId: string,
): EntityId {
  if (!Number.isSafeInteger(trackIndex) || trackIndex < 0) {
    throw new RangeError("trackIndex must be a non-negative safe integer");
  }
  if (!eventId) throw new RangeError("eventId must not be empty");
  return `${kind}:${trackIndex}:${eventId}` as EntityId;
}

function formatGlobalEntityId(
  kind: "tempo" | "time-signature",
  eventId: string,
): EntityId {
  if (!eventId) throw new RangeError("eventId must not be empty");
  return `${kind}:${eventId}` as EntityId;
}
