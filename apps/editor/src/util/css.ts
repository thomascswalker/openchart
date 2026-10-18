import type { CSSProperties } from "react";

export function applyStyle(element: HTMLElement, style: CSSProperties) {
  Object.assign(element.style, style);
}
