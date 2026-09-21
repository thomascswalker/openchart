export interface GeometryPoolOptions<T> {
  create(): T;
  reset?(item: T): void;
  destroy?(item: T): void;
  cap?: number;
}

export class GeometryPool<T> {
  private readonly active = new Map<string, { item: T; frameId: number }>();
  private readonly free: T[] = [];
  private readonly options: {
    create(): T;
    reset(item: T): void;
    destroy(item: T): void;
    cap: number;
  };
  private createdCount = 0;
  private destroyed = false;
  private _highWaterMark = 0;

  public constructor(options: GeometryPoolOptions<T>) {
    this.options = {
      create: options.create,
      reset: options.reset ?? (() => undefined),
      destroy: options.destroy ?? (() => undefined),
      cap: options.cap ?? Number.POSITIVE_INFINITY,
    };
  }

  public get highWaterMark(): number {
    return this._highWaterMark;
  }

  public get activeCount(): number {
    return this.active.size;
  }

  public get created(): number {
    return this.createdCount;
  }

  public prewarm(count: number): void {
    for (let index = this.free.length; index < count; index += 1) {
      if (this.createdCount >= this.options.cap) {
        break;
      }
      this.free.push(this.createItem());
    }
  }

  public acquire(logicalKey: string, frameId = 0): T | null {
    if (this.destroyed) {
      return null;
    }
    const current = this.active.get(logicalKey);
    if (current) {
      current.frameId = frameId;
      return current.item;
    }
    const item = this.free.pop() ?? this.tryCreate();
    if (item === null) {
      return null;
    }
    this.active.set(logicalKey, { item, frameId });
    this._highWaterMark = Math.max(this._highWaterMark, this.active.size);
    return item;
  }

  public release(logicalKey: string): boolean {
    const entry = this.active.get(logicalKey);
    if (!entry) {
      return false;
    }
    this.active.delete(logicalKey);
    this.resetItem(entry.item);
    this.free.push(entry.item);
    return true;
  }

  public releaseUnused(frameId: number): void {
    for (const [key, entry] of this.active) {
      if (entry.frameId !== frameId) {
        this.release(key);
      }
    }
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const entry of this.active.values()) {
      this.destroyItem(entry.item);
    }
    for (const item of this.free) {
      this.destroyItem(item);
    }
    this.active.clear();
    this.free.length = 0;
  }

  private createItem(): T {
    this.createdCount += 1;
    return this.options.create();
  }

  private tryCreate(): T | null {
    if (this.createdCount >= this.options.cap) {
      return null;
    }
    return this.createItem();
  }

  private resetItem(item: T): void {
    this.options.reset(item);
  }

  private destroyItem(item: T): void {
    this.options.destroy(item);
  }
}
