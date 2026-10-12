import type { styleFn } from "styled-system";
import {
  color,
  textAlign,
  fontWeight,
  compose,
  border,
  flexWrap,
  fontSize,
  size,
} from "styled-system";

const getTextSystemStyles: styleFn = compose(
  textAlign,
  fontWeight,
  color,
  border,
  flexWrap,
  fontSize,
  size,
);

export { getTextSystemStyles };
