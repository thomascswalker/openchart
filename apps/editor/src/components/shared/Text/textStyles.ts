import type { styleFn } from "styled-system";
import {
  color,
  textAlign,
  fontWeight,
  compose,
  border,
  flexWrap,
} from "styled-system";

const getTextSystemStyles: styleFn = compose(
  textAlign,
  fontWeight,
  color,
  border,
  flexWrap,
);

export { getTextSystemStyles };
