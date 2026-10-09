import { PianoRollView } from "./pianoRoll";
import { HighwayView } from "./highway";
import { ResourceRegistry } from "../../rendering/registry";
import type { EngineOptions } from "../../rendering/engine";

export type ChartView = PianoRollView | HighwayView;
export type ChartViewFactory = (engineOptions?: EngineOptions) => ChartView;

export interface ChartViewDefinition {
  id: string;
  name: string;

  createRenderer: ChartViewFactory;
}

// The registry belongs to the editor application, not a single chart view.
// Starting preload here lets switching views reuse the same immutable assets.
export const applicationRenderAssets = new ResourceRegistry();
void applicationRenderAssets.loadResources().catch((error) => {
  console.error("Circular highway assets failed to preload", error);
});

export const CHART_VIEWS: ChartViewDefinition[] = [
  {
    id: "piano-roll",
    name: "Piano Roll",

    createRenderer: (engineOptions) => {
      return new PianoRollView(engineOptions);
    },
  },
  {
    id: "highway",
    name: "Highway",

    createRenderer: (engineOptions) => {
      return new HighwayView(applicationRenderAssets, engineOptions);
    },
  },
];
