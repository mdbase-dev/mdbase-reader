export type Unsubscribe = () => void;

export interface EventSource<Value> {
  subscribe(listener: (value: Value) => void): Unsubscribe;
}

export interface EventEmitter<Value> extends EventSource<Value> {
  emit(value: Value): void;
  clear(): void;
}

export function createEventEmitter<Value>(): EventEmitter<Value> {
  const listeners = new Set<(value: Value) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(value) {
      for (const listener of listeners) {
        listener(value);
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
