import type { CSSProperties } from "react";

export type Size = "large" | "med" | "small" | "none";
export type Direction = "row" | "column";

export interface StyleProps {
  maxWidth?: CSSProperties["maxWidth"];
  minWidth?: CSSProperties["minWidth"];
  maxHeight?: CSSProperties["maxHeight"];
  minHeight?: CSSProperties["minHeight"];
  flexDirection?: CSSProperties["flexDirection"];

  alignItems?: CSSProperties["alignItems"];
  justifyContent?: CSSProperties["justifyContent"];
  alignSelf?: CSSProperties["alignSelf"];
  justifyItems?: CSSProperties["justifyItems"];
  textAlign?: CSSProperties["textAlign"];
  gap?: CSSProperties["gap"];

  borderRadius?: CSSProperties["borderRadius"];
}
