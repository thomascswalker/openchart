import type { MidiViewDefinition } from './MidiViewRenderer';

import { PianoRollRenderer } from './pixi/PianoRollRenderer';

export const MidiViews: readonly MidiViewDefinition[] = [
    {
        id: 'piano-roll',
        name: 'Piano Roll',

        createRenderer: () => {
            return new PianoRollRenderer();
        },
    },
];