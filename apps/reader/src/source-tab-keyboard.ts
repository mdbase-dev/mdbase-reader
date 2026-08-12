export function tabDestination(key: string, current: number, count: number): number | null {
  if (count < 1 || current < 0) {
    return null;
  }
  if (key === "ArrowRight") {
    return (current + 1) % count;
  }
  if (key === "ArrowLeft") {
    return (current - 1 + count) % count;
  }
  if (key === "Home") {
    return 0;
  }
  return key === "End" ? count - 1 : null;
}
