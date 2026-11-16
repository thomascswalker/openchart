export type Listener = () => void;

export class Subscriber {
  protected listeners: Listener[] = [];

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  unsubscribe(listener: Listener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.listeners = [];
  }
}
