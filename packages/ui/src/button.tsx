import type { ButtonHTMLAttributes, JSX } from "react";

export function ReaderButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return <button className={["mdbase-button", className].filter(Boolean).join(" ")} {...props} />;
}
