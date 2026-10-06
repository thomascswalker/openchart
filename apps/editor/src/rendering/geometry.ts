export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function point(x = 0, y = 0): CanvasPoint {
  return { x, y };
}

export function normalizeRect(value: CanvasRect): CanvasRect {
  const x = value.width < 0 ? value.x + value.width : value.x;
  const y = value.height < 0 ? value.y + value.height : value.y;
  return {
    x,
    y,
    width: Math.abs(value.width),
    height: Math.abs(value.height),
  };
}
