import type { JSX, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Line icons shared by Reader and the extension; decorative, so hidden from assistive tech. */
export function Icon({ children, ...props }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      {...props}
    >
      {children}
    </svg>
  );
}

export const NoteIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M6 3.5h9l3 3V21H6z" />
    <path d="M15 3.5V7h3M9 11h6M9 15h6" />
  </Icon>
);
export const CitationIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M6 5.5h11.5v13H6z" />
    <path d="M9 9h5.5M9 12h5.5M9 15h3.5" />
    <path d="M4 8v12.5h11" />
  </Icon>
);
export const HighlightIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m7 16 8.8-8.8 2 2L9 18H7zM5 21h14" />
  </Icon>
);
