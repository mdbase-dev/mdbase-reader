import type { MdbaseAppId } from "./apps.js";
import type { ButtonHTMLAttributes, JSX, SVGProps } from "react";

export const mdbaseMarkViewBox = "18 18 84 84";
const inkRects = [
  { x: 22, y: 22, width: 20, height: 10 },
  { x: 50, y: 22, width: 20, height: 10 },
  { x: 78, y: 22, width: 20, height: 10 },
  { x: 22, y: 44, width: 12, height: 10 },
  { x: 22, y: 66, width: 28, height: 10 },
  { x: 58, y: 66, width: 40, height: 10 },
  { x: 22, y: 88, width: 20, height: 10 },
  { x: 50, y: 88, width: 20, height: 10 },
  { x: 78, y: 88, width: 20, height: 10 },
] as const;

export function MdbaseMark(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox={mdbaseMarkViewBox} aria-hidden="true" {...props}>
      <g className="mdbase-mark-ink">
        {inkRects.map((rect) => (
          <rect key={`${String(rect.x)}-${String(rect.y)}`} {...rect} rx="2" />
        ))}
      </g>
      <rect className="mdbase-mark-accent" x="42" y="44" width="56" height="10" rx="2" />
    </svg>
  );
}

/**
 * An app's mark: the mdbase mark inverted, so the bars take the app's colour and the
 * highlighted line stays ink. The plain mark stays the platform's own.
 */
export function MdbaseAppMark({
  app,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { readonly app: MdbaseAppId }): JSX.Element {
  return (
    <svg
      viewBox={mdbaseMarkViewBox}
      aria-hidden="true"
      className={["mdbase-app-mark", `is-${app}`, className].filter(Boolean).join(" ")}
      {...props}
    >
      <g className="mdbase-app-mark-bars">
        {inkRects.map((rect) => (
          <rect key={`${String(rect.x)}-${String(rect.y)}`} {...rect} rx="2" />
        ))}
      </g>
      <rect className="mdbase-app-mark-line" x="42" y="44" width="56" height="10" rx="2" />
    </svg>
  );
}

export function ProductBrand(): JSX.Element {
  return (
    <span className="mdbase-product-brand">
      <MdbaseAppMark app="reader" className="mdbase-product-mark" />
      <strong>mdbase</strong>
      <span>reader</span>
    </span>
  );
}

export function ReaderButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return <button className={["mdbase-button", className].filter(Boolean).join(" ")} {...props} />;
}
