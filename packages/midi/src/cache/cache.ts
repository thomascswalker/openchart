export abstract class IEventCache<T, E> {
  protected _data!: T;
  protected _revision = 0;
  protected _isBuilt = false;
  protected _onChange?: () => void;

  constructor(onChange?: () => void) {
    this._onChange = onChange;
  }

  public get data(): T {
    return this._data;
  }

  public get revision(): number {
    return this._revision;
  }

  public get isBuilt(): boolean {
    return this._isBuilt;
  }

  public abstract build(events: E[]): void;
  public abstract invalidate(): void;
  public abstract clone(): IEventCache<T, E>;

  public rebuild(events: E[]): void {
    if (!this._isBuilt) {
      this.build(events);
    }
  }
  public bind(onChange?: () => void): void {
    this._onChange = onChange;
  }
}

export class IEventCacheList<T, E> extends IEventCache<T[], E> {
  protected _data: T[] = [];

  public build(events: E[]): void {
    this.invalidate();
    this._data = events.map((event) => event as unknown as T);
    this._isBuilt = true;
    this._onChange?.();
  }

  public invalidate(): void {
    this._data = [];
    this._revision++;
    this._isBuilt = false;
  }

  public clone(): IEventCacheList<T, E> {
    const copy = new IEventCacheList<T, E>();
    copy._data = [...this._data];
    copy._revision = this._revision;
    return copy;
  }
}

export class IEventCacheMap<K, V, E> extends IEventCache<Map<K, V>, E> {
  protected _data: Map<K, V> = new Map();

  public build(events: E[]): void {
    this.invalidate();
    this._data = new Map(events.map((event) => event as unknown as [K, V]));
    this._isBuilt = true;
    this._onChange?.();
  }

  public invalidate(): void {
    this._data = new Map();
    this._revision++;
    this._isBuilt = false;
  }

  public clone(): IEventCacheMap<K, V, E> {
    const copy = new IEventCacheMap<K, V, E>();
    copy._data = new Map(this._data);
    copy._revision = this._revision;
    return copy;
  }
}
