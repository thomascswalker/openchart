import type { styleFn } from "styled-system";
import {
  color,
  textAlign,
  fontWeight,
  compose,
  border,
  fontSize,
  size,
  flexbox,
} from "styled-system";

const getTextSystemStyles: styleFn = compose(
  textAlign,
  fontWeight,
  color,
  border,
  fontSize,
  size,
  flexbox,
);

export { getTextSystemStyles };
