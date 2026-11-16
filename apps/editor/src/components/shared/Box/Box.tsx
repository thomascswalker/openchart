import { type ReactNode, forwardRef } from 'react';

import classNames from 'classnames';
import {
  border,
  color,
  compose,
  flex,
  flexbox,
  layout,
  margin,
  padding,
  space,
} from 'styled-system';
import type {
  BorderProps,
  ColorProps,
  FlexProps,
  FlexboxProps,
  LayoutProps,
  MarginProps,
  PaddingProps,
  SpaceProps,
  styleFn,
} from 'styled-system';

import { type GapProps, gap } from '../../../util/css';
import styles from './Box.module.css';

type Styles = FlexProps &
  ColorProps &
  BorderProps &
  LayoutProps &
  PaddingProps &
  MarginProps &
  FlexboxProps &
  SpaceProps &
  GapProps;

type ItemAlignment = 'start' | 'equal' | 'end';

interface BoxProps extends Styles {
  ref?: HTMLDivElement;
  alignItems?: ItemAlignment;
  children?: ReactNode;
  className?: string;
}

const getSystemStyle: styleFn = compose(
  flex,
  color,
  border,
  layout,
  padding,
  margin,
  space,
  flexbox,
  gap,
);

const Box = forwardRef<HTMLDivElement, BoxProps>(
  ({ alignItems = 'equal', children, className, ...props }, ref) => {
    const boxStyle = getSystemStyle(props);
    const boxClassName = classNames(
      className,
      styles['ui-box'],
      styles[`ui-box-align-items-${alignItems}`],
    );

    return (
      <div ref={ref} className={boxClassName} style={boxStyle}>
        {children}
      </div>
    );
  },
);

export { Box };
