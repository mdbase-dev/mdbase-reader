import {
  ProductBrand,
  ReaderButton,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { readerErrorMessage } from "./errors.js";
import {
  BackIcon,
  HighlightIcon,
  LibraryIcon,
  MoreIcon,
  NoteIcon,
  SearchIcon,
  ThemeIcon,
} from "./icons.js";
import {
  filterSources,
  type ReaderWorkspaceGateway,
  type ReaderWorkspaceSnapshot,
} from "./workspace-model.js";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly renderDocument?: (snapshot: ReaderWorkspaceSnapshot) => ReactNode;
}

type InspectorTab = "note" | "annotations";

const MarkdownEditor = lazy(async () => {
  const module = await import("@mdbase-reader/markdown-editor");
  return { default: module.MarkdownEditor };
});

function nextTheme(theme: ThemePreference): ThemePreference {
  if (theme === "system") {
    return "light";
  }
  return theme === "light" ? "dark" : "system";
}

export function ReaderApp({ gateway, renderDocument }: ReaderAppProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<ReaderWorkspaceSnapshot | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<InspectorTab>("annotations");
  const [draft, setDraft] = useState("");
  const [openingSourceId, setOpeningSourceId] = useState<
    NonNullable<ReaderWorkspaceSnapshot["selectedSource"]>["id"] | null
  >(null);
  const selectionRequest = useRef(0);
  const [inspectorOpen, setInspectorOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => loadThemePreference(localStorage));

  useEffect(() => {
    applyThemePreference(theme, document.documentElement);
  }, [theme]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = (event: MediaQueryListEvent): void => setInspectorOpen(!event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let active = true;
    void gateway
      .snapshot()
      .then((next) => {
        if (active) {
          setWorkspaceError(null);
          setSnapshot(next);
          setDraft(next.selectedSource?.body ?? "");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setWorkspaceError(readerErrorMessage(reason, "Reader could not load this collection."));
        }
      });
    return () => {
      active = false;
    };
  }, [gateway, loadAttempt]);

  const sources = useMemo(
    () => filterSources(snapshot?.sources ?? [], search),
    [search, snapshot?.sources],
  );

  const selectSource = (id: NonNullable<ReaderWorkspaceSnapshot["selectedSource"]>["id"]): void => {
    const request = selectionRequest.current + 1;
    selectionRequest.current = request;
    setOpeningSourceId(id);
    setWorkspaceError(null);
    void gateway
      .selectSource(id)
      .then((next) => {
        if (request !== selectionRequest.current) {
          return;
        }
        setSnapshot(next);
        setDraft(next.selectedSource?.body ?? "");
        setMobileLibraryOpen(false);
        setOpeningSourceId(null);
      })
      .catch((reason: unknown) => {
        if (request !== selectionRequest.current) {
          return;
        }
        setOpeningSourceId(null);
        setWorkspaceError(readerErrorMessage(reason, "Reader could not open that source."));
      });
  };

  const saveDraft = (): void => {
    const source = snapshot?.selectedSource;
    if (!source || draft === source.body) {
      return;
    }
    setWorkspaceError(null);
    void gateway
      .saveSourceBody(source, draft)
      .then(setSnapshot)
      .catch((reason: unknown) => {
        setWorkspaceError(readerErrorMessage(reason, "Reader could not save the source note."));
      });
  };

  const changeTheme = (): void => {
    const next = nextTheme(theme);
    saveThemePreference(next, localStorage, document.documentElement);
    setTheme(next);
  };

  if (!snapshot) {
    return (
      <ReaderLoading
        error={workspaceError}
        onRetry={() => {
          setWorkspaceError(null);
          setLoadAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  const source = snapshot.selectedSource;
  return (
    <div className="reader-shell">
      <header className="reader-header">
        <ProductBrand />
        <div className="reader-header-context">
          <span>{snapshot.collectionName}</span>
          <i aria-hidden="true" />
          <span className={`connection-state is-${snapshot.connectionState}`}>
            {snapshot.connectionState}
          </span>
        </div>
        <div className="reader-header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={`Theme: ${theme}. Change theme`}
            onClick={changeTheme}
          >
            <ThemeIcon />
          </button>
          <button
            className="profile-button"
            type="button"
            aria-label="Account and collection settings"
          >
            CB
          </button>
        </div>
      </header>

      <WorkspaceError error={workspaceError} onDismiss={() => setWorkspaceError(null)} />

      <main className={mobileLibraryOpen ? "reader-main is-library-open" : "reader-main"}>
        <aside className="library-pane" aria-label="Library">
          <div className="pane-heading">
            <span>
              <LibraryIcon /> Library
            </span>
            <button className="icon-button" type="button" aria-label="Library actions">
              <MoreIcon />
            </button>
          </div>
          <label className="library-search">
            <SearchIcon />
            <span className="sr-only">Search sources</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search library"
            />
            <kbd>⌘K</kbd>
          </label>
          <nav className="status-nav" aria-label="Reading status">
            <button className="is-active" type="button">
              All <span>{snapshot.sources.length}</span>
            </button>
            <button type="button">
              Reading{" "}
              <span>
                {snapshot.sources.filter(({ readingStatus }) => readingStatus === "reading").length}
              </span>
            </button>
            <button type="button">Queued</button>
          </nav>
          <div className="source-list">
            {sources.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[
                  "source-row",
                  source?.id === item.id ? "is-selected" : "",
                  openingSourceId === item.id ? "is-opening" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selectSource(item.id)}
              >
                <span className="source-format">
                  {item.documents[0]?.mediaType.includes("pdf")
                    ? "PDF"
                    : item.documents[0]?.mediaType.includes("epub")
                      ? "EPUB"
                      : "WEB"}
                </span>
                <strong>{item.title}</strong>
                <small>{item.creators.join(", ") || "Unknown creator"}</small>
                <span className="source-row-meta">{item.readingStatus ?? "inbox"}</span>
              </button>
            ))}
          </div>
          <div className="library-footer">
            <ReaderButton>+ Add source</ReaderButton>
          </div>
        </aside>

        <section className="document-workspace" aria-label="Document reader">
          {source ? (
            <>
              <div className="document-toolbar">
                <button
                  className="mobile-back icon-button"
                  type="button"
                  aria-label="Back to library"
                  onClick={() => setMobileLibraryOpen(true)}
                >
                  <BackIcon />
                </button>
                <div className="document-identity">
                  <strong>{source.title}</strong>
                  <span>
                    {source.documents[0]?.title ?? source.documents[0]?.mediaType ?? "Source note"}
                  </span>
                </div>
                <div className="document-tools">
                  <button
                    type="button"
                    className="mobile-inspector-toggle tool-button"
                    onClick={() => setInspectorOpen(true)}
                  >
                    <NoteIcon /> Annotations
                  </button>
                  <button type="button" className="tool-button">
                    <HighlightIcon /> Highlight
                  </button>
                  <span className="page-position">42 / 218</span>
                  <button className="icon-button" type="button" aria-label="Document actions">
                    <MoreIcon />
                  </button>
                </div>
              </div>
              <div className="document-canvas">
                {renderDocument?.(snapshot) ?? <DocumentEmpty />}
              </div>
            </>
          ) : (
            <EmptyCollection />
          )}
        </section>

        {source ? (
          <aside
            className={inspectorOpen ? "inspector-pane" : "inspector-pane is-mobile-closed"}
            aria-label="Source workspace"
          >
            <button
              className="inspector-close icon-button"
              type="button"
              aria-label="Close source workspace"
              onClick={() => setInspectorOpen(false)}
            >
              ×
            </button>
            <div className="inspector-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "annotations"}
                onClick={() => setTab("annotations")}
              >
                <HighlightIcon />
                Annotations <span>{snapshot.annotations.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "note"}
                onClick={() => setTab("note")}
              >
                <NoteIcon />
                Source note
              </button>
            </div>
            {tab === "annotations" ? (
              <AnnotationList snapshot={snapshot} />
            ) : (
              <div className="note-editor">
                <Suspense fallback={<div className="editor-loading">Opening source note…</div>}>
                  <MarkdownEditor
                    value={draft}
                    ariaLabel="Source literature note"
                    onChange={setDraft}
                    onBlur={saveDraft}
                  />
                </Suspense>
              </div>
            )}
          </aside>
        ) : null}
      </main>
    </div>
  );
}

function ReaderLoading({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element {
  if (!error) {
    return (
      <div className="reader-loading" role="status">
        Opening your reading collection…
      </div>
    );
  }
  return (
    <div className="reader-loading is-error" role="alert">
      <p>{error}</p>
      <ReaderButton onClick={onRetry}>Try again</ReaderButton>
    </div>
  );
}

function WorkspaceError({
  error,
  onDismiss,
}: {
  readonly error: string | null;
  readonly onDismiss: () => void;
}): JSX.Element | null {
  if (!error) {
    return null;
  }
  return (
    <div className="workspace-error" role="alert">
      <span>{error}</span>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function AnnotationList({ snapshot }: { readonly snapshot: ReaderWorkspaceSnapshot }): JSX.Element {
  return (
    <div className="annotation-list">
      <div className="annotation-list-heading">
        <span>On this source</span>
        <button type="button">Newest</button>
      </div>
      {snapshot.annotations.map((annotation) => (
        <article key={annotation.id} className="annotation-card">
          <header>
            <span className={`annotation-kind is-${annotation.annotationType}`}>
              {annotation.annotationType}
            </span>
            <small>{annotation.locator?.label ?? "Page 42"}</small>
          </header>
          {annotation.target?.quote?.exact ? (
            <blockquote>{annotation.target.quote.exact}</blockquote>
          ) : null}
          {annotation.body ? <p>{annotation.body.replace(/^>.*$/gmu, "").trim()}</p> : null}
          <footer>
            <time>
              {new Date(annotation.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            <button className="icon-button" type="button" aria-label="Annotation actions">
              <MoreIcon />
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}

function DocumentEmpty(): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">No readable representation</span>
        <h2>Add a PDF, EPUB, or saved web page.</h2>
        <p>
          The literature note is available now. Document controls appear when a supported
          representation is attached.
        </p>
        <ReaderButton>Add a representation</ReaderButton>
      </div>
    </div>
  );
}

function EmptyCollection(): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">Your library is empty</span>
        <h2>Begin with something worth returning to.</h2>
        <p>Save a web page, upload a PDF or EPUB, or import an existing library.</p>
        <ReaderButton>Upload PDF or EPUB</ReaderButton>
      </div>
    </div>
  );
}
