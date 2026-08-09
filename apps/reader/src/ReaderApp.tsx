import {
  ProductBrand,
  ReaderButton,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "@mdbase-reader/ui";
import { lazy, Suspense, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

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
  type AsyncResource,
  type ReaderWorkspaceController,
  useReaderWorkspace,
} from "./use-reader-workspace.js";
import { filterSources, type ReaderWorkspaceGateway } from "./workspace-model.js";

import type { Annotation, SourceSummary } from "@mdbase-reader/core";

export interface ReaderAppProps {
  readonly gateway: ReaderWorkspaceGateway;
  readonly renderDocument?: (source: SourceSummary) => ReactNode;
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
  const workspace = useReaderWorkspace(gateway);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<InspectorTab>("annotations");
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

  const sources = useMemo(
    () =>
      filterSources(
        workspace.library.status === "ready" ? workspace.library.value.sources : [],
        search,
      ),
    [search, workspace.library],
  );

  const selectSource = (id: SourceSummary["id"]): void => {
    workspace.selectSource(id);
    setMobileLibraryOpen(false);
  };

  const changeTheme = (): void => {
    const next = nextTheme(theme);
    saveThemePreference(next, localStorage, document.documentElement);
    setTheme(next);
  };

  if (workspace.library.status !== "ready") {
    return (
      <ReaderLoading
        error={workspace.library.status === "error" ? workspace.library.message : null}
        onRetry={workspace.retryLibrary}
      />
    );
  }

  const library = workspace.library.value;
  const source = workspace.selectedSource;
  return (
    <div className="reader-shell">
      <header className="reader-header">
        <ProductBrand />
        <div className="reader-header-context">
          <span>{library.collectionName}</span>
          <i aria-hidden="true" />
          <span className={`connection-state is-${library.connectionState}`}>
            {library.connectionState}
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
              All <span>{library.sources.length}</span>
            </button>
            <button type="button">
              Reading{" "}
              <span>
                {library.sources.filter(({ readingStatus }) => readingStatus === "reading").length}
              </span>
            </button>
            <button type="button">Queued</button>
          </nav>
          <div className="source-list">
            {sources.map((item) => (
              <button
                key={item.id}
                type="button"
                className={["source-row", source?.id === item.id ? "is-selected" : ""]
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
              <div className="document-canvas">{renderDocument?.(source) ?? <DocumentEmpty />}</div>
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
                Annotations{" "}
                <span>
                  {workspace.annotations.status === "ready"
                    ? workspace.annotations.value.length
                    : "—"}
                </span>
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
              <AnnotationList annotations={workspace.annotations} />
            ) : (
              <div className="note-editor">
                <SourceNoteEditor workspace={workspace} />
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

function AnnotationList({
  annotations,
}: {
  readonly annotations: AsyncResource<readonly Annotation[]>;
}): JSX.Element {
  if (annotations.status !== "ready") {
    if (annotations.status === "error") {
      return (
        <div className="inspector-status is-error" role="alert">
          {annotations.message}
        </div>
      );
    }
    return <div className="inspector-status">Loading annotations…</div>;
  }
  return (
    <div className="annotation-list">
      <div className="annotation-list-heading">
        <span>On this source</span>
        <button type="button">Newest</button>
      </div>
      {annotations.value.map((annotation) => (
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

function SourceNoteEditor({
  workspace,
}: {
  readonly workspace: ReaderWorkspaceController;
}): JSX.Element {
  if (workspace.sourceRecord.status === "idle" || workspace.sourceRecord.status === "loading") {
    return <div className="editor-loading">Opening source note…</div>;
  }
  if (workspace.sourceRecord.status === "error") {
    return (
      <div className="inspector-status is-error" role="alert">
        {workspace.sourceRecord.message}
      </div>
    );
  }
  return (
    <>
      <Suspense fallback={<div className="editor-loading">Opening source note…</div>}>
        <MarkdownEditor
          value={workspace.draft}
          ariaLabel="Source literature note"
          onChange={workspace.setDraft}
          onBlur={workspace.saveDraft}
        />
      </Suspense>
      {workspace.saveStatus === "saving" ? (
        <span className="editor-save-status" role="status">
          Saving…
        </span>
      ) : null}
      {workspace.saveError ? (
        <span className="editor-save-status is-error" role="alert">
          {workspace.saveError}
        </span>
      ) : null}
    </>
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
