import type { CSSProperties } from 'react';

import { type ResponsiveValue, system } from 'styled-system';

export function vars(name: string) {
  return `var(--${name})`;
}

export function applyStyle(element: HTMLElement, style: CSSProperties) {
  Object.assign(element.style, style);
}

export type GapProps = {
  gap?: ResponsiveValue<CSSProperties['gap']>;
};

export const gap = system({
  gap: {
    property: 'gap',
    scale: 'space',
  },
});
