export interface ConfirmationOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly danger?: boolean;
}
export type Confirm = (options: ConfirmationOptions) => Promise<boolean>;

export interface ConfirmationRequest {
  readonly id: number;
  readonly options: ConfirmationOptions;
  readonly opener: Element | null;
  readonly resolve: (accepted: boolean) => void;
}

/** One queue for React controls and imperative workspace commands. No host means cancel. */
export function createConfirmationService(): {
  readonly confirm: Confirm;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ConfirmationRequest | null;
  readonly attach: () => () => void;
  readonly answer: (request: ConfirmationRequest, accepted: boolean) => void;
} {
  let attached = false;
  let nextId = 0;
  const queue: ConfirmationRequest[] = [];
  const listeners = new Set<() => void>();
  const publish = (): void => listeners.forEach((listener) => listener());
  return {
    confirm: (options) => {
      if (!attached) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        queue.push({
          id: nextId++,
          options,
          resolve,
          opener: queue[0]?.opener ?? document.activeElement,
        });
        publish();
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => queue[0] ?? null,
    attach: () => {
      attached = true;
      return () => {
        attached = false;
        queue.splice(0).forEach((request) => request.resolve(false));
        publish();
      };
    },
    answer: (request, accepted) => {
      if (queue[0] !== request) {
        return;
      }
      queue.shift();
      publish();
      request.resolve(accepted);
    },
  };
}

export const readerConfirmation = createConfirmationService();
export const requestConfirmation: Confirm = readerConfirmation.confirm;
