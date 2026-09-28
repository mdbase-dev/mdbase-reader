import { history } from "@codemirror/commands";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, tooltips, type Rect } from "@codemirror/view";
import { mdbasePopupTheme } from "@mdbase-dev/ui/codemirror";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import { annotationEditorExtensions } from "./annotation-widgets.js";
import { dispatchPreservingFocus, editorConfiguration } from "./editor-configuration.js";
import { scheduleInitialEditorFocus } from "./editor-initial-focus.js";
import { readerSearchTheme } from "./editor-search-theme.js";
import { readerEditorTheme } from "./editor-theme.js";
import { readerTooltipTheme } from "./editor-tooltip-theme.js";
import { minimalTextChange } from "./external-change.js";
import { markdownCommand } from "./markdown-commands.js";
import { textInsertionAtCursor } from "./text-insertion.js";

import type { CodeEditorProps } from "./markdown-editor.js";

// Lifecycle wiring is centralized so the exported React adapter stays small.
// eslint-disable-next-line max-lines-per-function
export function useCodeEditor(props: CodeEditorProps): RefObject<HTMLDivElement | null> {
  const {
    value,
    sharedDocument,
    ariaLabel,
    language = "plain",
    profile,
    placeholder,
    focusOnMount = false,
    readOnly = false,
    onChange,
    onBlur,
    onSave,
    insertion,
    formatting,
    wikiLinks = [],
    citations = [],
    onOpenWikiLink,
    onEditWikiLink,
    onOpenCitation,
    onEditCitation,
  } = props;
  const resolvedProfile = profile ?? (language === "json" ? "code" : "compact");
  const canSave = onSave !== undefined;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const changeRef = useRef(onChange);
  const blurRef = useRef(onBlur);
  const saveRef = useRef(onSave);
  const openWikiLinkRef = useRef(onOpenWikiLink);
  const editWikiLinkRef = useRef(onEditWikiLink);
  const openCitationRef = useRef(onOpenCitation);
  const editCitationRef = useRef(onEditCitation);
  const saveCommand = useCallback(() => saveRef.current?.(), []);
  const initialConfigurationRef = useRef({
    ariaLabel,
    language,
    profile: resolvedProfile,
    placeholder,
    readOnly,
    onSave: canSave ? saveCommand : undefined,
  });
  const configurationCompartmentRef = useRef(new Compartment());
  const annotationCompartmentRef = useRef(new Compartment());
  const insertedRequestRef = useRef<number | null>(null);
  const formattingRequestRef = useRef<number | null>(null);

  useEffect(() => {
    changeRef.current = onChange;
    blurRef.current = onBlur;
    saveRef.current = onSave;
    openWikiLinkRef.current = onOpenWikiLink;
    editWikiLinkRef.current = onEditWikiLink;
    openCitationRef.current = onOpenCitation;
    editCitationRef.current = onEditCitation;
  }, [onBlur, onChange, onEditCitation, onEditWikiLink, onOpenCitation, onOpenWikiLink, onSave]);

  useEditorLifecycle(
    hostRef,
    viewRef,
    initialValueRef,
    initialConfigurationRef,
    configurationCompartmentRef,
    annotationCompartmentRef,
    changeRef,
    blurRef,
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    dispatchPreservingFocus(view, {
      effects: configurationCompartmentRef.current.reconfigure(
        editorConfiguration({
          ariaLabel,
          language,
          profile: resolvedProfile,
          placeholder,
          readOnly,
          onSave: canSave ? saveCommand : undefined,
        }),
      ),
    });
  }, [ariaLabel, canSave, language, placeholder, readOnly, resolvedProfile, saveCommand]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    dispatchPreservingFocus(view, {
      effects: annotationCompartmentRef.current.reconfigure(
        wikiLinks.length > 0 || citations.length > 0
          ? annotationEditorExtensions(
              wikiLinks,
              citations,
              (path) => openWikiLinkRef.current?.(path),
              (path) => editWikiLinkRef.current?.(path),
              (id) => openCitationRef.current?.(id),
              (id) => editCitationRef.current?.(id),
            )
          : [],
      ),
    });
  }, [citations, wikiLinks]);

  useEffect(() => {
    if (focusOnMount && viewRef.current) {
      return scheduleInitialEditorFocus(viewRef.current);
    }
    return undefined;
  }, [focusOnMount]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const change = minimalTextChange(view.state.doc.toString(), sharedDocument?.getText() ?? value);
    if (!change) {
      return;
    }
    view.dispatch({
      changes: change,
      annotations: [Transaction.addToHistory.of(false), Transaction.remote.of(true)],
    });
  }, [sharedDocument, value]);

  // Receive edits synchronously, before another view can type against stale React props.
  // Remote transactions map each view's selection and undo history without stealing focus.
  useEffect(() => {
    if (!sharedDocument) {
      return undefined;
    }
    const sync = (): void => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const change = minimalTextChange(view.state.doc.toString(), sharedDocument.getText());
      if (change) {
        view.dispatch({
          changes: change,
          annotations: [Transaction.addToHistory.of(false), Transaction.remote.of(true)],
        });
      }
    };
    const unsubscribe = sharedDocument.subscribe(sync);
    sync();
    return unsubscribe;
  }, [sharedDocument]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !insertion || insertedRequestRef.current === insertion.requestId) {
      return;
    }
    const change = textInsertionAtCursor(
      view.state.doc.toString(),
      view.state.selection.main.to,
      insertion,
    );
    insertedRequestRef.current = insertion.requestId;
    view.dispatch({
      changes: { from: change.from, insert: change.insert },
      selection: { anchor: change.cursor },
    });
    view.focus();
  }, [insertion]);

  useEffect(() => {
    const view = viewRef.current;
    if (
      !view ||
      !formatting ||
      formattingRequestRef.current === formatting.requestId ||
      language !== "markdown"
    ) {
      return;
    }
    formattingRequestRef.current = formatting.requestId;
    markdownCommand(formatting.name)(view);
    view.focus();
  }, [formatting, language]);

  return hostRef;
}

const tooltipGutter = 8;

/** Keeps tooltips a little clear of the window edge instead of flush against it. */
function viewportInset(view: EditorView): Rect {
  const window = view.dom.ownerDocument.defaultView;
  const width = window?.innerWidth ?? view.dom.ownerDocument.documentElement.clientWidth;
  const height = window?.innerHeight ?? view.dom.ownerDocument.documentElement.clientHeight;
  return {
    top: tooltipGutter,
    left: tooltipGutter,
    right: width - tooltipGutter,
    bottom: height - tooltipGutter,
  };
}

function useEditorLifecycle(
  hostRef: RefObject<HTMLDivElement | null>,
  viewRef: RefObject<EditorView | null>,
  initialValueRef: RefObject<string>,
  initialConfigurationRef: RefObject<Parameters<typeof editorConfiguration>[0]>,
  configurationCompartmentRef: RefObject<Compartment>,
  annotationCompartmentRef: RefObject<Compartment>,
  changeRef: RefObject<CodeEditorProps["onChange"]>,
  blurRef: RefObject<CodeEditorProps["onBlur"]>,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        configurationCompartmentRef.current.of(
          editorConfiguration(initialConfigurationRef.current),
        ),
        history(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          const remote = update.transactions.some(
            (transaction) => transaction.annotation(Transaction.remote) === true,
          );
          if (update.docChanged && !remote) {
            changeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({ blur: () => blurRef.current?.() }),
        annotationCompartmentRef.current.of([]),
        // Reader panes contain layout and clip overflow, which would crop completion lists and
        // hover cards. Mounting tooltips on the body positions them against the viewport.
        tooltips({ parent: host.ownerDocument.body, tooltipSpace: viewportInset }),
        readerEditorTheme,
        readerSearchTheme,
        mdbasePopupTheme,
        readerTooltipTheme,
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [
    annotationCompartmentRef,
    blurRef,
    changeRef,
    configurationCompartmentRef,
    hostRef,
    initialConfigurationRef,
    initialValueRef,
    viewRef,
  ]);
}
