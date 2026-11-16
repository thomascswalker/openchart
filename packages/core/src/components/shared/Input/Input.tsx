import { type InputHTMLAttributes } from 'react';

import classNames from 'classnames';
import {
  type BorderProps,
  type ColorProps,
  type LayoutProps,
  type SpaceProps,
  border,
  color,
  compose,
  layout,
  space,
  type styleFn,
} from 'styled-system';

import styles from './input.module.css';

const getSystemStyles: styleFn = compose(space, color, layout, border);
const systemPropNames = new Set(getSystemStyles.propNames ?? []);

type StyleProps = SpaceProps & ColorProps & LayoutProps & BorderProps;
type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  keyof StyleProps
> &
  StyleProps;

const defaultInputProps: Pick<InputProps, 'type' | 'placeholder'> = {
  type: 'text',
  placeholder: 'Enter text...',
};

const Input = ({ className, ...props }: InputProps) => {
  const inputProps = { ...defaultInputProps, ...props };
  const style = getSystemStyles(inputProps);
  const htmlProps = Object.fromEntries(
    Object.entries(inputProps).filter(
      ([propName]) => !systemPropNames.has(propName),
    ),
  );
  const inputClassName = classNames(styles['ui-input'], className);
  return <input {...htmlProps} className={inputClassName} style={style} />;
};

export { Input };
