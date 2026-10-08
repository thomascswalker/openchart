import type { styleFn } from "styled-system";
import { color, textAlign, fontWeight, compose } from "styled-system";

const textColor: styleFn = ({ textColor: value, ...props }) =>
  color({ ...props, color: value });
const getTextSystemStyles: styleFn = compose(textAlign, fontWeight, textColor);

export { getTextSystemStyles };
