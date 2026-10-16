import type { InputHTMLAttributes } from "react";
import classNames from "classnames";
import { border, color, compose, layout, size, space } from "styled-system";
import type {
  BorderProps,
  ColorProps,
  LayoutProps,
  SpaceProps,
  SizeProps,
  styleFn,
} from "styled-system";
import styles from "./slider.module.css";

const getSystemStyles: styleFn = compose(space, color, layout, border, size);

type HTMLInputRangeProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "className"
  | "disabled"
  | "min"
  | "max"
  | "step"
  | "value"
  | "aria-valuetext"
  | "onInput"
  | "onChange"
>;

export interface SliderProps
  extends
    HTMLInputRangeProps,
    SpaceProps,
    ColorProps,
    LayoutProps,
    BorderProps,
    SizeProps {}

const Slider = ({
  disabled = false,
  min = 0.1,
  max = 2.0,
  step = 0.1,
  value = 1.0,
  "aria-valuetext": ariaValueText,
  className,
  onInput = () => {},
  onChange = () => {},
  ...systemProps
}: SliderProps) => (
  <input
    type="range"
    disabled={disabled}
    min={min}
    max={max}
    step={step}
    value={value}
    aria-valuetext={ariaValueText}
    onInput={onInput}
    onChange={onChange}
    className={classNames(styles.slider, className)}
    style={getSystemStyles(systemProps)}
  />
);

export { Slider };
