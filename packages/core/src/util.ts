import { MAX_VARIABLE_LENGTH_VALUE } from "./constants.js";
import { MidiEvent, MidiMetaPayload, DefaultMetaPayload, MetaType, MidiSysExEvent } from "./types.js";

export function isTwoByteMessage(status: number): boolean {
    const type = status & 0xf0;
    return type !== 0xc0 && type !== 0xd0;
}

export function formatTrackEvents(rawEvents: any[]): MidiEvent[] {
    return rawEvents.map((record) => {
        const result: any = {
            deltaTime: record.deltaTime,
            status: record.status,
        };

        if (record.channel !== undefined) {
            result.channel = record.channel;
        }

        if (record.messageType !== undefined) {
            result.messageType = record.messageType;
        }

        if (record.statusByte < 0x80) {
            result.data1 = record.statusByte;

            if (
                record.event &&
                record.event.data2 !== undefined
            ) {
                result.data2 = record.event.data2;
            }
        } else if (
            record.status >= 0x80 &&
            record.status < 0xf0
        ) {
            if (record.event) {
                if (record.event.data1 !== undefined) {
                    result.data1 = record.event.data1;
                }

                if (record.event.data2 !== undefined) {
                    result.data2 = record.event.data2;
                }
            }
        } else {
            if (record.event) {
                if (record.event.type !== undefined) {
                    result.type = record.event.type;
                }

                if (record.event.length !== undefined) {
                    result.length = record.event.length;
                }

                if (record.event.data !== undefined) {
                    result.data = record.event.data;
                } else {
                    result.data = record.event;
                }
            }
        }

        return result as MidiEvent;
    });
}

export function encodeVariableLengthValue(value: number): Buffer {
    if (
        !Number.isInteger(value) ||
        value < 0 ||
        value > MAX_VARIABLE_LENGTH_VALUE
    ) {
        throw new RangeError(
            "MIDI variable-length values must be between 0 and 0x0fffffff",
        );
    }

    const bytes = [value & 0x7f];
    value >>>= 7;

    while (value > 0) {
        bytes.unshift((value & 0x7f) | 0x80);
        value >>>= 7;
    }

    return Buffer.from(bytes);
}

export function requireByte(value: number, field: string): number {
    if (
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xff
    ) {
        throw new RangeError(`${field} must be an unsigned byte`);
    }

    return value;
}

export function requireSignedByte(value: number, field: string): number {
    if (
        !Number.isInteger(value) ||
        value < -0x80 ||
        value > 0x7f
    ) {
        throw new RangeError(`${field} must fit in a signed byte`);
    }

    return value < 0 ? value + 0x100 : value;
}

export function encodeMetaPayload(
    type: number,
    data: MidiMetaPayload,
): Buffer {
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
        return Buffer.from(data);
    }

    if (
        data &&
        typeof data === "object" &&
        "bytes" in data
    ) {
        return Buffer.from(
            (data as DefaultMetaPayload).bytes,
        );
    }

    const payload = (data ?? {}) as Record<string, any>;

    switch (type) {
        case MetaType.SequenceNumber: {
            const result = Buffer.alloc(2);
            result.writeUInt16BE(payload.sequenceNumber, 0);
            return result;
        }

        case MetaType.TextEvent:
        case MetaType.Copyright:
        case MetaType.TrackName:
        case MetaType.InstrumentName:
        case MetaType.Lyric:
        case MetaType.Marker:
        case MetaType.CuePoint:
            return Buffer.from(payload.text ?? "", "ascii");

        case 0x20:
            return Buffer.from([
                requireByte(
                    payload.channel,
                    "MIDI channel prefix",
                ),
            ]);

        case 0x21:
            return Buffer.from([
                requireByte(payload.port, "MIDI port"),
            ]);

        case MetaType.EndOfTrack:
            return Buffer.alloc(0);

        case MetaType.Tempo: {
            const result = Buffer.alloc(3);
            result.writeUIntBE(
                payload.microsecondsPerQuarterNote,
                0,
                3,
            );
            return result;
        }

        case MetaType.SMPTEOffset:
            return Buffer.from([
                requireByte(payload.hr, "SMPTE hour"),
                requireByte(payload.mn, "SMPTE minute"),
                requireByte(payload.se, "SMPTE second"),
                requireByte(payload.fr, "SMPTE frame"),
                requireByte(
                    payload.ff,
                    "SMPTE fractional frame",
                ),
            ]);

        case MetaType.TimeSignature:
            return Buffer.from([
                requireByte(
                    payload.numerator,
                    "time-signature numerator",
                ),
                requireByte(
                    payload.denominator,
                    "time-signature denominator",
                ),
                requireByte(
                    payload.clocksPerClick,
                    "time-signature clocks-per-click",
                ),
                requireByte(
                    payload.thirtySecondNotesPerQuarter,
                    "time-signature thirty-second notes",
                ),
            ]);

        case 0x59:
            return Buffer.from([
                requireSignedByte(
                    payload.key,
                    "key signature key",
                ),
                requireByte(
                    payload.scale,
                    "key-signature scale",
                ),
            ]);

        default:
            throw new Error(
                `Cannot serialize unsupported MIDI meta-event type 0x${type.toString(16)}`,
            );
    }
}

export function encodeMidiEvent(event: MidiEvent): Buffer {
    const deltaTime = encodeVariableLengthValue(
        event.deltaTime,
    );

    if (event.status === 0xff && "type" in event) {
        const payload = encodeMetaPayload(
            event.type,
            event.data,
        );

        return Buffer.concat([
            deltaTime,
            Buffer.from([0xff, event.type]),
            encodeVariableLengthValue(payload.length),
            payload,
        ]);
    }

    if (
        event.status === 0xf0 ||
        event.status === 0xf7
    ) {
        const payload = Buffer.from((event as MidiSysExEvent).data);

        return Buffer.concat([
            deltaTime,
            Buffer.from([event.status]),
            encodeVariableLengthValue(payload.length),
            payload,
        ]);
    }

    if (!("messageType" in event)) {
        throw new Error(
            "Cannot serialize an unsupported MIDI event",
        );
    }

    const status =
        event.status >= 0x80 && event.status < 0xf0
            ? event.status
            : event.messageType | (event.channel & 0x0f);

    const messageType = status & 0xf0;
    const data1 = requireByte(
        event.data1,
        "MIDI event data1",
    ) & 0x7f;

    const bytes = [status, data1];

    if (isTwoByteMessage(messageType)) {
        bytes.push(
            requireByte(
                event.data2 ?? 0,
                "MIDI event data2",
            ) & 0x7f,
        );
    }

    return Buffer.concat([
        deltaTime,
        Buffer.from(bytes),
    ]);
}
