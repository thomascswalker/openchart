import { Application } from 'pixi.js';

import type {
    MidiViewRenderer,
    MidiViewState,
} from '../MidiViewRenderer';

export abstract class PixiMidiViewRenderer
    implements MidiViewRenderer {
    private app: Application | null = null;

    private state: MidiViewState = {
        midi: null,
        selectedTrackIndex: null,
    };

    private width = 1;
    private height = 1;

    private destroyed = false;

    public async mount(host: HTMLElement): Promise<void> {
        const app = new Application();

        await app.init({
            width: this.width,
            height: this.height,

            background: '#151515',

            /*
             * Explicitly prefer WebGL for the time being.
             *
             * This could eventually become configurable or changed
             * to "webgpu".
             */
            preference: 'webgl',

            antialias: true,

            /*
             * We render on demand rather than treating every MIDI view
             * like a continuously-running game.
             */
            autoStart: false,

            /*
             * Make the canvas sharp on high-DPI displays without allowing
             * an extremely high devicePixelRatio to explode GPU usage.
             */
            resolution: Math.min(
                window.devicePixelRatio || 1,
                2,
            ),

            autoDensity: true,
        });

        /*
         * React StrictMode can mount/unmount effects while async init()
         * is still running.
         */
        if (this.destroyed) {
            app.destroy(
                { removeView: true },
                { children: true },
            );

            return;
        }

        this.app = app;

        host.replaceChildren(app.canvas);

        this.onMounted(app);

        this.render();
    }

    public update(state: MidiViewState): void {
        this.state = state;

        this.render();
    }

    public resize(width: number, height: number): void {
        this.width = width;
        this.height = height;

        if (!this.app) {
            return;
        }

        this.app.renderer.resize(width, height);

        this.render();
    }

    public destroy(): void {
        this.destroyed = true;

        if (!this.app) {
            return;
        }

        this.app.destroy(
            { removeView: true },
            { children: true },
        );

        this.app = null;
    }

    /**
     * Allows subclasses to construct their scene graph once.
     */
    protected onMounted(_app: Application): void {
        // Optional.
    }

    /**
     * Called whenever state or dimensions change.
     */
    protected abstract draw(
        app: Application,
        state: MidiViewState,
    ): void;

    protected render(): void {
        if (!this.app) {
            return;
        }

        this.draw(
            this.app,
            this.state,
        );

        this.app.render();
    }
}