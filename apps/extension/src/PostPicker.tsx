import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import type { ExtensionCaptureController } from "./capture-controller.js";

type Picker = NonNullable<ExtensionCaptureController["postPicker"]>;

export function PostPicker({
  controller: c,
}: {
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element | null {
  const picker = c.postPicker;
  if (!picker) {
    return null;
  }
  if (!picker.open) {
    return (
      <button
        type="button"
        className="secondary compact"
        disabled={c.busy || c.navigated}
        onClick={picker.show}
      >
        <Trans>Choose posts…</Trans>
      </button>
    );
  }
  return <OpenPostPicker picker={picker} controller={c} />;
}

function OpenPostPicker({
  picker,
  controller: c,
}: {
  readonly picker: Picker;
  readonly controller: ExtensionCaptureController;
}): React.JSX.Element {
  const { t } = useLingui();
  // Mounted on opening only: scrolling must not discard a deliberate choice.
  const [selected, setSelected] = useState(
    () => new Set(picker.preselected ? [picker.preselected] : []),
  );
  const loadedSelected = [...selected].filter((id) => picker.items.some((item) => item.id === id));
  return (
    <section className="post-picker tab-section" aria-labelledby="post-picker-title">
      <h2 id="post-picker-title">
        <Trans>Choose posts to save</Trans>
      </h2>
      <p className="hint">
        <Trans>Only posts currently loaded on the page are listed. Feeds are never saved.</Trans>
      </p>
      <fieldset disabled={c.busy}>
        <legend>
          <Trans>Posts</Trans>
        </legend>
        {picker.items.map((item) => (
          <label className="post-picker-item" key={item.id}>
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={(event) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) {
                    next.add(item.id);
                  } else {
                    next.delete(item.id);
                  }
                  return next;
                })
              }
            />
            <span>
              <strong>{item.author || t`Post`}</strong>
              <span>{item.snippet || t`Media post`}</span>
              {item.published ? <time dateTime={item.published}>{item.published}</time> : null}
            </span>
          </label>
        ))}
        {!picker.items.length ? (
          <p>
            <Trans>No posts loaded. Scroll the page to load some posts.</Trans>
          </p>
        ) : null}
      </fieldset>
      <div className="save-bar">
        <button
          type="button"
          className="primary"
          disabled={
            !loadedSelected.length || c.busy || c.snapshot.status !== "ready" || c.navigated
          }
          onClick={() => void picker.save(loadedSelected)}
        >
          {c.busy ? t`Saving…` : t`Save ${String(loadedSelected.length)} selected`}
        </button>
        <button type="button" className="secondary" disabled={c.busy} onClick={picker.close}>
          <Trans context="Reader action">Cancel</Trans>
        </button>
      </div>
    </section>
  );
}
