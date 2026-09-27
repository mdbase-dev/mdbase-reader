import { Icon } from "@mdbase-reader/ui";

import type { JSX, SVGProps } from "react";

export { ChevronDownIcon, CitationIcon, HighlightIcon, NoteIcon } from "@mdbase-reader/ui";

type IconProps = SVGProps<SVGSVGElement>;

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
/** A pane's arrangement: split, merge, maximize. */
export const LayoutIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="17" height="16" rx="1" />
    <path d="M12 4v16M12 12h8.5" />
  </Icon>
);
export const LeftPaneIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="17" height="16" rx="1" />
    <path d="M9.5 4v16" />
  </Icon>
);
export const RightPaneIcon = (props: IconProps): JSX.Element => (
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
export const DownloadIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14" />
  </Icon>
);
export const CloseIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
export const PinIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m9 4 6 2-1.5 4 3 3-4.5 1-3.5 6-.2-6.5-3.3-2.5 3.8-1.2z" />
  </Icon>
);
export const TabsIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M5 7.5h14v11H5z" />
    <path d="M8 4.5h8M3 10.5v6" />
  </Icon>
);
export const MergeIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4 5v14M20 5v14M8 12h8M13 9l3 3-3 3" />
  </Icon>
);
export const LinkIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M9.5 14.5 14.5 9" />
    <path d="M7.2 16.8 5.6 18.4a3.4 3.4 0 0 1-4.8-4.8l3.4-3.4A3.4 3.4 0 0 1 9 10" />
    <path d="m14.9 14 4.9-4.2a3.4 3.4 0 1 0-4.8-4.8l-1.6 1.6" />
  </Icon>
);
export const FileIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M6 3.5h8l4 4V21H6z" />
    <path d="M14 3.5V8h4" />
  </Icon>
);
export const AreaIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
    <rect x="8" y="8" width="8" height="8" rx="0.5" strokeDasharray="2 2" />
  </Icon>
);
export const CheckIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const FilterIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4 6.5h16M7 12h10M10 17.5h4" />
  </Icon>
);
export const ImportIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
  </Icon>
);
export const QuoteIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M9.5 7H6.5A1.5 1.5 0 0 0 5 8.5v3A1.5 1.5 0 0 0 6.5 13H9v1a3 3 0 0 1-3 3M19 7h-3a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 16 13h2.5v1a3 3 0 0 1-3 3" />
  </Icon>
);
export const ListIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
    <circle cx="5" cy="6.5" r="1" fill="currentColor" />
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="5" cy="17.5" r="1" fill="currentColor" />
  </Icon>
);
export const CodeIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5" />
  </Icon>
);
export const CollectionIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="4" y="3.5" width="16" height="5" rx="1" />
    <rect x="4" y="10" width="16" height="5" rx="1" />
    <rect x="4" y="16.5" width="16" height="4" rx="1" />
  </Icon>
);
export const ReadingModeIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
    <path d="M12 6.5v13" />
  </Icon>
);
export const BookmarkIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M7 3.5h10V20.5l-5-3.8-5 3.8z" />
  </Icon>
);
export const CommentIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4.5 5h15v10.5H11l-4.5 3.5v-3.5h-2z" />
  </Icon>
);
export const CopyIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Icon>
);
export const TrashIcon = (props: IconProps): JSX.Element => (
  <Icon {...props}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10.5 11v5M13.5 11v5" />
  </Icon>
);
