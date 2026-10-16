import { expect, test, vi } from "vitest";
import { AudioEngine, createSoftClipCurve, softClip } from "../engine.js";

test("softClip is transparent below the knee", () => {
  for (const x of [-0.88, -0.5, -0.1, 0, 0.1, 0.5, 0.88]) {
    expect(softClip(x)).toBe(x);
  }
});

test("softClip saturates smoothly and never exceeds full scale", () => {
  let previous = softClip(0);
  for (let x = 0.01; x <= 4; x += 0.01) {
    const y = softClip(x);
    expect(y).toBeGreaterThanOrEqual(previous);
    expect(y).toBeLessThanOrEqual(1);
    previous = y;
  }
  expect(softClip(-3)).toBe(-softClip(3));
  // No step at the knee.
  expect(Math.abs(softClip(0.8901) - softClip(0.8899))).toBeLessThan(1e-3);
});

test("the soft-clip curve covers 2x input and has unity gain in the clean range", () => {
  const curve = createSoftClipCurve(4096);
  const last = curve.length - 1;
  for (let i = 0; i <= last; i++) {
    const net = ((i / last) * 2 - 1) * 2;
    if (Math.abs(net) <= 0.88) {
      expect(curve[i] * 2).toBeCloseTo(net, 5);
    }
    expect(Math.abs(curve[i] * 2)).toBeLessThanOrEqual(1);
  }
});

test("AudioEngine.smooth schedules a ramp instead of assigning the value", () => {
  const engine = new AudioEngine();
  void engine.context;
  const param = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  } as unknown as AudioParam;

  engine.smooth(param, 0.25);

  expect(param.setTargetAtTime).toHaveBeenCalledWith(
    0.25,
    expect.any(Number),
    expect.any(Number),
  );
  expect(param.value).toBe(1);
  engine.dispose();
});

test("AudioEngine does not create a context until it is used", () => {
  const engine = new AudioEngine();
  expect(engine.state).toBe("closed");
  expect(engine.outputLatency).toBe(0);
  engine.dispose();
  expect(engine.disposed).toBe(true);
  expect(() => engine.context).toThrow();
});
