export class ContextStore {
  private contexts = new Map<string, any>();

  public set(key: string, value: any): void {
    this.contexts.set(key, value);
  }

  public get(key: string): any {
    return this.contexts.get(key);
  }

  public update(obj: Record<string, any>): void {
    for (const [key, value] of Object.entries(obj)) {
      this.contexts.set(key, value);
    }
  }

  public evaluate(expression: Record<string, any> | undefined): boolean {
    if (!expression) {
      return true;
    }

    for (const [key, expectedValue] of Object.entries(expression)) {
      if (this.contexts.get(key) !== expectedValue) {
        return false;
      }
    }
    return true;
  }
}
