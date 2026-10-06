import { PianoRollView } from "./pianoRoll";
import { HighwayView } from "./highway";
import { ResourceRegistry } from "../../rendering/registry";

export type ChartView = PianoRollView | HighwayView;
export type ChartViewFactory = () => ChartView;

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

    createRenderer: () => {
      return new PianoRollView();
    },
  },
  {
    id: "highway",
    name: "Highway",

    createRenderer: () => {
      return new HighwayView(applicationRenderAssets);
    },
  },
];
