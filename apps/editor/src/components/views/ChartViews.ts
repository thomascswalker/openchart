import { PianoRollView } from "./pianoRoll";
import { HighwayView } from "./highway";

export type ChartView = PianoRollView | HighwayView;
export type ChartViewFactory = () => ChartView;

export interface ChartViewDefinition {
  id: string;
  name: string;

  createRenderer: ChartViewFactory;
}

export const CHART_VIEWS = [
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
      return new HighwayView();
    },
  },
];
