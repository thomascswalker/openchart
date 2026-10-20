import type { CSSProperties } from "react";

export function vars(name: string) {
  return `var(--${name})`;
}

export function applyStyle(element: HTMLElement, style: CSSProperties) {
  Object.assign(element.style, style);
}
