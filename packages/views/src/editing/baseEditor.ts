import { MidiNote } from "@openchart/midi";
import { BaseChartView } from "../views/baseChart.js";

/**
 * Provides basic editing functionality for a chart, including adding, removing,
 * and moving notes within the chart.
 */
export class BaseChartEditor {
  #view: BaseChartView;

  constructor(view: BaseChartView) {
    this.#view = view;
  }

  public get canEdit(): boolean {
    return !!this.#view.midiTrack;
  }

  /**
   * Adds a note at the specified pitch with the given start and end times and
   * velocity. The start and end times are measured in ticks.
   *
   * This DOES NOT validate whether the pitch is within the chart's range.
   *
   * @param pitch The pitch of the note to add.
   * @param start The start time of the note in ticks.
   * @param end The end time of the note in ticks. Defaults to 0.
   * @param velocity The velocity of the note. Defaults to 100.
   * @returns True if the note was successfully added, false otherwise.
   */
  public addNote(
    pitch: number,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): boolean {
    if (!this.#view.midiTrack) {
      return false;
    }

    // Calculate the insertion index and the delta for the start and end times.
    const insertAt = this.#view.midiTrack.getInsertionIndexAt(start);
    const previousTick = this.#view.midiTrack.getAbsoluteTickAt(insertAt);
    const startDelta = start - previousTick;
    const endDelta = Math.max(1, (end > start ? end : start + 1) - start);

    this.#view.midiTrack.addNote(
      pitch,
      startDelta,
      velocity,
      endDelta,
      insertAt,
    );
    return true;
  }

  /**
  Adds a note to the specified lane at the given start and end times with the
  specified velocity. The start and end times are measured in ticks, and the 
  lane corresponds to the vertical position in the chart.

  @param lane The lane in which to add the note.
  @param start The start time of the note in ticks.
  @param end The end time of the note in ticks. Defaults to 0.
  @param velocity The velocity of the note. Defaults to 100.
  @returns True if the note was successfully added, false otherwise.
  */
  public addNoteAtLane(
    lane: number,
    start: number,
    end: number = 0,
    velocity: number = 100,
  ): boolean {
    // Ensure the note is within the valid range of the chart lanes.
    if (lane < 0 || lane >= this.#view.laneCount) {
      return false;
    }

    // Calculate the pitch based on the lane and the chart's offset.
    const pitch = this.#view.offset + lane;
    return this.addNote(pitch, start, end, velocity);
  }

  /**
   * Removes the specified note from the chart.
   *
   * @param note The note to remove.
   * @returns True if the note was successfully removed, false otherwise.
   */
  public removeNote(note: MidiNote): boolean {
    if (!this.#view.midiTrack || !this.#view.containsNote(note)) {
      return false;
    }

    return this.#view.midiTrack.removeNote(note.noteOn, note.noteOff);
  }

  /**
   * Moves the specified note to the given pitch within the chart.
   *
   * @param note The note to move.
   * @param pitch The new pitch of the note.
   * @returns True if the note was successfully moved, false otherwise.
   */
  public moveNote(note: MidiNote, pitch: number): boolean {
    if (!this.#view.midiTrack) {
      return false;
    }

    // Ensure the pitch is within the valid range of the chart and the note is
    // not already within the chart.
    if (!this.#view.containsPitch(pitch) || !this.#view.containsNote(note)) {
      return false;
    }

    return this.#view.midiTrack.setNotePitch(note, pitch);
  }

  /**
   * Moves the specified note within the chart to the given lane and start time.
   *
   * @param note The note to move.
   * @param lane The lane to move the note to.
   * @param start The new start time of the note in ticks.
   * @returns True if the note was successfully moved, false otherwise.
   */
  public moveNoteToLane(note: MidiNote, lane: number, start: number): boolean {
    if (!this.#view.midiTrack) {
      return false;
    }

    // Ensure the lane is within the valid range of the chart and the
    // note is not already within the chart.
    const inRange = lane >= 0 && lane < this.#view.laneCount;
    if (start < 0 || !inRange || !this.#view.containsNote(note)) {
      return false;
    }

    return (
      this.#view.midiTrack.setNoteStart(note, start) &&
      this.#view.midiTrack.setNotePitch(note, this.#view.offset + lane)
    );
  }

  /**
   * Sets the end time of the specified note within the chart.
   *
   * @param note The note to update.
   * @param end The new end time of the note in ticks.
   * @returns True if the note's end time was successfully updated, false
   * otherwise.
   */
  public setNoteEnd(note: MidiNote, end: number): boolean {
    if (!this.#view.midiTrack) {
      return false;
    }

    // Ensure the end time is not before the start time and the note is
    // not already within the chart.
    if (end <= note.start || !this.#view.containsNote(note)) {
      return false;
    }

    return this.#view.midiTrack.setNoteDuration(note, end - note.start);
  }
}
