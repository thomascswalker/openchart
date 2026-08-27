import type { ChartViewDefinition } from "./AbstractChartView";

import { PianoRollView } from "./pianoRoll";

export const ChartViews: readonly ChartViewDefinition[] = [
  {
    id: "piano-roll",
    name: "Piano Roll",

    createRenderer: () => {
      return new PianoRollView();
    },
  },
];
