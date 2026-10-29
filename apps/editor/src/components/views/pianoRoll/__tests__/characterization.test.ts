import { MetaType, Midi, type MidiNote } from "@openchart/midi";
import {
  DomainCommandType,
  EditCommandType,
  EntityType,
  createStandaloneEditing,
  Difficulty,
  formatNoteId,
  parseEntityFromId,
  SongView,
  VocalNoteKind,
  VocalPhraseKind,
} from "@openchart/views";
import { describe, expect, it } from "vitest";
import characterization from "../../../../../../../packages/views/tests/fixtures/characterization/editing.json" with { type: "json" };

describe("editing characterization: Piano Roll vocals", () => {
  it("preserves vocal move, lane, phrase, delete, and paste behavior through a session", () => {
    const midi = new Midi();
    midi.addTrack();
    const song = new SongView(midi);
    const descriptor = song
      .getTrackDescriptors()
      .find((item) => item.name === "VOCALS")!;
    const standalone = createStandaloneEditing(midi);
    const track = song.ensureMidiTrack("vocals")!;
    const vocalView = song.getVocalTrackView("VOCALS")!;
    const session = standalone.createSession(
      {
        trackKey: descriptor.key,
        trackIndex: midi.tracks.indexOf(track),
        difficulty: Difficulty.Expert,
      },
      "piano-roll",
    );
    const pitched = vocalView.addNote(VocalNoteKind.Pitched, 0, 120, {
      pitch: characterization.vocal.pitchedMove.fromPitch,
      lyric: characterization.vocal.pasteRestoresLyric,
    })!.note;
    const laneNote = vocalView.addNote(
      VocalNoteKind.Percussion,
      240,
      360,
    )!.note;
    const trackIndex = midi.tracks.indexOf(track);
    const idOf = (note: MidiNote) =>
      formatNoteId(trackIndex, track.getEventId(note.noteOn));
    const pitchedId = idOf(pitched);
    const laneNoteId = idOf(laneNote);
    const resolveNote = (id: string) => {
      const parsed = parseEntityFromId(id);
      if (!parsed || parsed.type !== EntityType.Note) return null;
      return track.getNoteByEventId(parsed.eventId) ?? null;
    };

    const moved = session.execute({
      type: DomainCommandType.MoveVocalEntities,
      targetIds: [pitchedId],
      tickDelta: characterization.vocal.pitchedMove.toTick,
      pitchDelta:
        characterization.vocal.pitchedMove.toPitch -
        characterization.vocal.pitchedMove.fromPitch,
    });
    expect(moved.rejections).toEqual([]);
    expect(moved.changed).toBe(true);
    expect([
      resolveNote(pitchedId)?.start,
      resolveNote(pitchedId)?.pitch,
    ]).toEqual([
      characterization.vocal.pitchedMove.toTick,
      characterization.vocal.pitchedMove.clampedPitch,
    ]);
    expect(vocalView.getLyrics().map((lyric) => lyric.tick)).toEqual(
      characterization.vocal.lyricTicksAfterMove,
    );

    session.execute({
      type: DomainCommandType.MoveVocalEntities,
      targetIds: [laneNoteId],
      tickDelta: 0,
      pitchDelta:
        characterization.vocal.nonPitchedMove.requestedPitch -
        characterization.vocal.nonPitchedMove.pitch,
    });
    expect(resolveNote(laneNoteId)?.pitch).toBe(
      characterization.vocal.nonPitchedMove.resultPitch,
    );

    const firstPhrase = vocalView.addPhrase(
      VocalPhraseKind.StagePower,
      0,
      100,
    )!;
    vocalView.addPhrase(VocalPhraseKind.StagePower, 200, 300);
    const phraseId = idOf(firstPhrase.note);
    const gesture = session.beginGesture();
    gesture.preview({
      type: DomainCommandType.MoveVocalEntities,
      targetIds: [phraseId],
      tickDelta: characterization.vocal.phraseMove.firstStart,
      pitchDelta: 0,
      previousValidTickDelta: 0,
    });
    gesture.preview({
      type: DomainCommandType.MoveVocalEntities,
      targetIds: [phraseId],
      tickDelta:
        characterization.vocal.phraseMove.firstStart +
        characterization.vocal.phraseMove.blockedDelta,
      pitchDelta: 0,
      previousValidTickDelta: characterization.vocal.phraseMove.firstStart,
    });
    gesture.commit();
    expect(resolveNote(phraseId)?.start).toBe(
      characterization.vocal.phraseMove.resultStart,
    );
    const rejectedResize = session.execute({
      type: DomainCommandType.ResizeVocalEntities,
      targetIds: [phraseId],
      durationDelta: 150,
    });
    expect(rejectedResize.changed).toBe(
      !characterization.vocal.phraseResizeRejected,
    );

    const currentPitched = resolveNote(pitchedId)!;
    session.selection.setSelectedIds([pitchedId]);
    const snapshot = {
      id: pitchedId,
      trackIndex,
      tick: currentPitched.start,
      pitch: currentPitched.pitch,
      duration: currentPitched.end - currentPitched.start,
      velocity: currentPitched.velocity,
    };
    session.clipboard.setData({
      sourceModeId: session.mode.id,
      entities: [
        {
          relativeTick: 0,
          duration: snapshot.duration,
          velocity: snapshot.velocity,
          pitch: snapshot.pitch,
          row: session.getProjection().rowForNote(snapshot)?.id,
          classification: session.classifyNote(snapshot),
          lyric: vocalView
            .getLyrics()
            .find((lyric) => lyric.tick === currentPitched.start)?.text,
        },
      ],
    });
    const copiedNote = session.clipboard.getData()!.entities[0]!;
    session.execute({
      type: EditCommandType.DeleteEntities,
      targetIds: [pitchedId],
    });
    expect(
      vocalView
        .getLyrics()
        .some((lyric) => lyric.tick === currentPitched.start),
    ).toBe(false);
    session.execute({
      type: DomainCommandType.AddVocalNote,
      kind: VocalNoteKind.Pitched,
      tick: 960,
      endTick: 960 + copiedNote.duration,
      pitch: copiedNote.pitch,
      ...(copiedNote.lyric ? { lyric: copiedNote.lyric } : {}),
    });
    expect(
      vocalView.getLyrics().find((lyric) => lyric.tick === 960)?.text,
    ).toBe(characterization.vocal.pasteRestoresLyric);
    expect(
      vocalView.getLyrics().every((lyric) => lyric.type === MetaType.Lyric),
    ).toBe(true);
  });
});
