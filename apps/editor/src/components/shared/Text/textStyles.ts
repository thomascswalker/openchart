import type { styleFn } from "styled-system";
import { textAlign, fontWeight, textColor, compose } from "styled-system";

const getTextSystemStyles: styleFn = compose(textAlign, fontWeight, textColor);

export { getTextSystemStyles };
