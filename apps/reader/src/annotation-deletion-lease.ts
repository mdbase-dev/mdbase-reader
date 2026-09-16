import type { AnnotationEditSession } from "./annotation-edit-session.js";

/** Only the view that owns a deletion check can release the shared writer's lock. */
export class AnnotationDeletionLease {
  private mounted = false;
  private deleting = false;
  constructor(private readonly session: AnnotationEditSession) {}
  isMounted(): boolean {
    return this.mounted;
  }
  attach(): () => void {
    this.mounted = true;
    return () => {
      this.mounted = false;
      if (!this.deleting) {
        this.session.unlock(this);
      }
    };
  }
  acquire(): Promise<boolean> {
    return this.session.lock(this);
  }
  commit(): void {
    this.deleting = true;
  }
  release(): void {
    this.deleting = false;
    this.session.unlock(this);
  }
}
