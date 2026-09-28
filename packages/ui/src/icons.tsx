// Phosphor icons, as Editor and Writer use them, under Reader's names.
import { AtIcon as PhAt } from "@phosphor-icons/react/At";
import { CaretDownIcon as PhCaretDown } from "@phosphor-icons/react/CaretDown";
import { GearSixIcon as PhGearSix } from "@phosphor-icons/react/GearSix";
import { HighlighterCircleIcon as PhHighlighterCircle } from "@phosphor-icons/react/HighlighterCircle";
import { NoteIcon as PhNote } from "@phosphor-icons/react/Note";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { JSX, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Decorative by default, as a control's label names what it does. */
function icon(Glyph: PhosphorIcon): (props: IconProps) => JSX.Element {
  return (props) => <Glyph aria-hidden="true" {...(props as object)} />;
}

export const NoteIcon = icon(PhNote);
export const CitationIcon = icon(PhAt);
export const HighlightIcon = icon(PhHighlighterCircle);
export const ChevronDownIcon = icon(PhCaretDown);
export const SettingsIcon = icon(PhGearSix);
