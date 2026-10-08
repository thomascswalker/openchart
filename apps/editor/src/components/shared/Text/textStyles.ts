import type { styleFn } from "styled-system";
import { color, textAlign, fontWeight, compose, border } from "styled-system";

const getTextSystemStyles: styleFn = compose(
  textAlign,
  fontWeight,
  color,
  border,
);

export { getTextSystemStyles };
