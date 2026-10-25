/**
 * A failure's own message, which may name codes and internals, behind a disclosure for
 * anyone who needs it. The panel says what happened in plain words beside it.
 */
export function TechnicalDetails({
  detail,
  children,
}: {
  readonly detail: string | null;
  readonly children?: React.ReactNode;
}): React.JSX.Element | null {
  return detail || children ? (
    <details className="technical">
      <summary>Technical details</summary>
      {detail ? <p>{detail}</p> : null}
      {children}
    </details>
  ) : null;
}
