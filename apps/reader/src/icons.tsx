import type { JSX, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps): JSX.Element {
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

export const SearchIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icon>
);
export const LibraryIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4 5.5h16M4 12h16M4 18.5h16" />
    <path d="M7 3v5M12 9.5v5M17 16v5" />
  </Icon>
);
export const NoteIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M6 3.5h9l3 3V21H6z" />
    <path d="M15 3.5V7h3M9 11h6M9 15h6" />
  </Icon>
);
export const HighlightIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m7 16 8.8-8.8 2 2L9 18H7zM5 21h14" />
  </Icon>
);
export const MoreIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </Icon>
);
export const ThemeIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </Icon>
);
export const BackIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
);
export const FocusIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </Icon>
);
export const PanelIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="17" height="16" rx="1" />
    <path d="M14.5 4v16" />
  </Icon>
);
export const PlusIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const AreaIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
    <rect x="8" y="8" width="8" height="8" rx="0.5" strokeDasharray="2 2" />
  </Icon>
);
