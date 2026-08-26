import type { Midi } from '@midiedit/core';

export interface MidiViewState {
    midi: Midi | null;
    selectedTrackIndex: number | null;
}

export interface MidiViewRenderer {
    /**
     * Mount whatever rendering surface this view requires into the host.
     *
     * A Pixi view might append a canvas.
     * A Three.js view might append its WebGL canvas.
     * An SVG view could append an SVG element.
     */
    mount(host: HTMLElement): Promise<void>;

    /**
     * Update the renderer with the current MIDI/editor state.
     */
    update(state: MidiViewState): void;

    /**
     * Resize the rendering surface.
     */
    resize(width: number, height: number): void;

    /**
     * Release GPU/DOM resources.
     */
    destroy(): void;
}

export type MidiViewRendererFactory = () => MidiViewRenderer;

export interface MidiViewDefinition {
    id: string;
    name: string;

    createRenderer: MidiViewRendererFactory;
}