import type { ReaderLocator, ReadingSurface } from "@mdbase-reader/reading-surface";

const explicit = new WeakSet<ReadingSurface>();
const restorations = new WeakMap<ReadingSurface, Promise<boolean>>();

/** A user-requested passage beats both an in-flight and a later hydrated resume position. */
export function beginExplicitReadingNavigation(surface: ReadingSurface): Promise<unknown> {
  explicit.add(surface);
  return restorations.get(surface)?.catch(() => false) ?? Promise.resolve();
}

export function hasExplicitReadingNavigation(surface: ReadingSurface): boolean {
  return explicit.has(surface);
}

export function restoreReadingLocation(
  surface: ReadingSurface,
  locator: ReaderLocator,
): Promise<boolean> {
  const restoration = surface.goTo(locator);
  restorations.set(surface, restoration);
  return restoration;
}
