// Phosphor icons, as Editor and Writer use them, under Reader's names.
import { ArrowLeftIcon as PhArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowsMergeIcon as PhArrowsMerge } from "@phosphor-icons/react/ArrowsMerge";
import { ArrowSquareOutIcon as PhArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BookmarkSimpleIcon as PhBookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { BookOpenIcon as PhBookOpen } from "@phosphor-icons/react/BookOpen";
import { BooksIcon as PhBooks } from "@phosphor-icons/react/Books";
import { ChatCircleIcon as PhChatCircle } from "@phosphor-icons/react/ChatCircle";
import { CheckIcon as PhCheck } from "@phosphor-icons/react/Check";
import { CircleHalfIcon as PhCircleHalf } from "@phosphor-icons/react/CircleHalf";
import { CodeIcon as PhCode } from "@phosphor-icons/react/Code";
import { CopyIcon as PhCopy } from "@phosphor-icons/react/Copy";
import { CrosshairIcon as PhCrosshair } from "@phosphor-icons/react/Crosshair";
import { DotsThreeIcon as PhDotsThree } from "@phosphor-icons/react/DotsThree";
import { DownloadSimpleIcon as PhDownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileIcon as PhFile } from "@phosphor-icons/react/File";
import { FunnelIcon as PhFunnel } from "@phosphor-icons/react/Funnel";
import { LayoutIcon as PhLayout } from "@phosphor-icons/react/Layout";
import { LinkIcon as PhLink } from "@phosphor-icons/react/Link";
import { ListBulletsIcon as PhListBullets } from "@phosphor-icons/react/ListBullets";
import { MagnifyingGlassIcon as PhMagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { NotebookIcon as PhNotebook } from "@phosphor-icons/react/Notebook";
import { PlusIcon as PhPlus } from "@phosphor-icons/react/Plus";
import { PushPinIcon as PhPushPin } from "@phosphor-icons/react/PushPin";
import { QuotesIcon as PhQuotes } from "@phosphor-icons/react/Quotes";
import { SelectionIcon as PhSelection } from "@phosphor-icons/react/Selection";
import { SidebarSimpleIcon as PhSidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { TabsIcon as PhTabs } from "@phosphor-icons/react/Tabs";
import { TrashIcon as PhTrash } from "@phosphor-icons/react/Trash";
import { TrayArrowDownIcon as PhTrayArrowDown } from "@phosphor-icons/react/TrayArrowDown";
import { XIcon as PhX } from "@phosphor-icons/react/X";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { JSX, SVGProps } from "react";

export { ChevronDownIcon, CitationIcon, HighlightIcon, NoteIcon } from "@mdbase-reader/ui";

type IconProps = SVGProps<SVGSVGElement>;

/** Decorative by default, as a control's label names what it does. */
function icon(Glyph: PhosphorIcon): (props: IconProps) => JSX.Element {
  return (props) => <Glyph aria-hidden="true" {...(props as object)} />;
}

export const SearchIcon = icon(PhMagnifyingGlass);
export const LibraryIcon = icon(PhBooks);
export const MoreIcon = icon(PhDotsThree);
export const ThemeIcon = icon(PhCircleHalf);
export const BackIcon = icon(PhArrowLeft);
export const FocusIcon = icon(PhCrosshair);
export const PanelIcon = icon(PhSidebarSimple);
export const LayoutIcon = icon(PhLayout);
export const LeftPaneIcon = icon(PhSidebarSimple);
export const PlusIcon = icon(PhPlus);
export const DownloadIcon = icon(PhDownloadSimple);
export const CloseIcon = icon(PhX);
export const PinIcon = icon(PhPushPin);
export const TabsIcon = icon(PhTabs);
export const MergeIcon = icon(PhArrowsMerge);
export const LinkIcon = icon(PhLink);
export const FileIcon = icon(PhFile);
export const AreaIcon = icon(PhSelection);
export const OpenExternalIcon = icon(PhArrowSquareOut);
export const CheckIcon = icon(PhCheck);
export const FilterIcon = icon(PhFunnel);
export const ImportIcon = icon(PhTrayArrowDown);
export const QuoteIcon = icon(PhQuotes);
export const ListIcon = icon(PhListBullets);
export const CodeIcon = icon(PhCode);
export const CollectionIcon = icon(PhNotebook);
export const ReadingModeIcon = icon(PhBookOpen);
export const BookmarkIcon = icon(PhBookmarkSimple);
export const CommentIcon = icon(PhChatCircle);
export const CopyIcon = icon(PhCopy);
export const TrashIcon = icon(PhTrash);

/** The sidebar glyph, mirrored: Phosphor draws only the left-hand pane. */
export const RightPaneIcon = ({ style, ...props }: IconProps): JSX.Element => (
  <PhSidebarSimple
    aria-hidden="true"
    {...(props as object)}
    style={{ ...style, transform: "scaleX(-1)" }}
  />
);
