export interface TextInsertionRequest {
  readonly requestId: number;
  readonly text: string;
  readonly wordBounded?: boolean;
}

export interface TextInsertion {
  readonly from: number;
  readonly insert: string;
  readonly cursor: number;
}

export function textInsertionAtCursor(
  document: string,
  cursor: number,
  request: TextInsertionRequest,
): TextInsertion {
  const position = Math.max(0, Math.min(cursor, document.length));
  const prefix = request.wordBounded && needsLeadingSpace(document, position) ? " " : "";
  const suffix = request.wordBounded && needsTrailingSpace(document, position) ? " " : "";
  const insert = `${prefix}${request.text}${suffix}`;
  return { from: position, insert, cursor: position + insert.length };
}

function needsLeadingSpace(document: string, cursor: number): boolean {
  const previous = document[cursor - 1];
  return previous !== undefined && !/[\s([{"'“‘—–-]/u.test(previous);
}

function needsTrailingSpace(document: string, cursor: number): boolean {
  const next = document[cursor];
  return next !== undefined && !/[\s.,;:!?)}\]"'”’—–-]/u.test(next);
}
