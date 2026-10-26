import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// Ownership decisions keep their stable diagnostic values. Translate only where
// they are presented, never in the routine-reason lookup or save decisions.
const reasons: Readonly<Partial<Record<string, MessageDescriptor>>> = {
  "Saved to this source.": msg`Saved to this source.`,
  "A note about this source as a whole.": msg`A note about this source as a whole.`,
  "Created in this chapter.": msg`Created in this chapter.`,
  "Book unavailable; keeping the current source.": msg`Book unavailable; keeping the current source.`,
  "Your annotation setting keeps new annotations on the book.": msg`Your annotation setting keeps new annotations on the book.`,
  "Inside this chapter’s verified range on the exact file revision.": msg`Inside this chapter’s verified range on the exact file revision.`,
  "Chapter ranges overlap; choose a source.": msg`Chapter ranges overlap; choose a source.`,
  "No verified chapter contains the whole selection; keeping this on the book.": msg`No verified chapter contains the whole selection; keeping this on the book.`,
  "Chapter parents are ambiguous; keeping this on the book.": msg`Chapter parents are ambiguous; keeping this on the book.`,
  "Chapter range revision differs from the opened file; keeping this on the book.": msg`Chapter range revision differs from the opened file; keeping this on the book.`,
  "Chapter boundaries or selection containment are unverified; keeping this on the book.": msg`Chapter boundaries or selection containment are unverified; keeping this on the book.`,
  "Chapter boundaries could not be verified; keeping the current source.": msg`Chapter boundaries could not be verified; keeping the current source.`,
  "Source chosen. Existing note embeds will not move.": msg`Source chosen. Existing note embeds will not move.`,
  "Checking chapter boundaries…": msg`Checking chapter boundaries…`,
};

export function annotationOwnerReasonText(reason: string): string {
  const message = reasons[reason];
  return message ? i18n._(message) : reason;
}
