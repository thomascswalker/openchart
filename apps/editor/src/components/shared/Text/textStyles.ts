import type { styleFn } from 'styled-system';
import {
  border,
  color,
  compose,
  flexbox,
  fontSize,
  fontWeight,
  size,
  textAlign,
} from 'styled-system';

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
