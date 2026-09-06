import { PianoRollView } from "./pianoRoll";

export type ChartView = PianoRollView;
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
];
