import { Midi } from '@openchart/midi';
import { describe, expect, it } from 'vitest';

import { mockLoggerService } from '../../platform/services/__mock__/logger.mock';
import { ProjectService } from '../../platform/services/project/project.js';
import { createTestRulesetService } from '../../platform/services/ruleset/__tests__/testUtils.js';
import { mockWorkspaceService } from '../../platform/services/workspace/__tests__/utils.js';
import { History } from '../History.js';

function createMidi(): Midi {
  const midi = new Midi();
  midi.addTrack();
  return midi;
}

describe('history transaction rollback', () => {
  it('restores the pre-transaction project without adding history', () => {
    const midi = createMidi();
    const history = new History();
    history.reset(midi);
    midi.tracks[0].addNote(60, 0, 100, 240);
    history.recordEdit(midi);

    history.beginTransaction();
    midi.tracks[0].addNote(62, 480, 100, 240);
    midi.addTrack();
    history.recordEdit(midi);
    const restored = history.rollbackTransaction()!;

    expect(restored.tracks).toHaveLength(1);
    expect(restored.tracks[0].getNotes().map((note) => note.pitch)).toEqual([
      60,
    ]);
    expect(history.isInTransaction).toBe(false);
    // Only the committed edit is undoable; the rolled-back one left nothing.
    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(0);
    expect(history.canUndo).toBe(false);
  });

  it('returns null when no transaction is open', () => {
    const history = new History();
    history.reset(createMidi());
    expect(history.rollbackTransaction()).toBeNull();
  });

  it("replaces the project's MIDI and publishes on rollback", () => {
    const logger = mockLoggerService();
    const project = new ProjectService(
      logger as never,
      createTestRulesetService(),
      mockWorkspaceService(),
    );
    project.init();
    let published = 0;
    project.subscribe(() => published++);
    const before = project.data!;

    project.beginEdit();
    before.addTrack();
    project.recordEdit();
    expect(project.rollbackEdit()).toBe(true);

    expect(project.data).not.toBe(before);
    expect(project.data!.tracks).toHaveLength(0);
    expect(project.getSnapshot().canUndo).toBe(false);
    expect(published).toBeGreaterThan(0);
    expect(project.rollbackEdit()).toBe(false);
  });
});
