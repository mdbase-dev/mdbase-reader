import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { highlightPalette } from "@mdbase-reader/core";
import { useCallback, useId, useState, type JSX } from "react";

import { DisplayChoice, DisplaySettings } from "./DisplaySettings.js";
import { FileNameSettings } from "./FileNameSettings.js";
import {
  setLastHighlightColor,
  useHighlightChoices,
  useLastHighlightColor,
} from "./highlight-colors.js";
import { HighlightColorSettings } from "./HighlightColorSettings.js";
import { ReaderCollectionSwitcher, useReaderMdbase } from "./reader-collections.js";
import { connectionLabels, type ReaderConnectionState } from "./ReaderHeader.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { ReaderSettingsStore } from "@mdbase-reader/connect";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

export interface SettingsSectionsProps {
  readonly display: Parameters<typeof DisplaySettings>[0];
  readonly gateway: ReaderWorkspaceGateway;
  readonly library: readonly SourceSummary[];
  readonly openSources: readonly SourceSummary[];
  readonly collectionName: string;
  readonly connectionState: ReaderConnectionState;
  readonly beforeCollectionSwitch: () => boolean | Promise<boolean>;
  /** Asks before unsaved settings are lost. */
  readonly beforeLeave: () => Promise<boolean>;
  readonly onDirtyChange: (name: string, dirty: boolean) => void;
}

const previewCount = 3;

/** The Settings page's sections: this device, this collection, and the connection. */
export function SettingsSections({
  display,
  gateway,
  library,
  openSources,
  collectionName,
  connectionState,
  beforeCollectionSwitch,
  beforeLeave,
  onDirtyChange,
}: SettingsSectionsProps): JSX.Element {
  useLocale();
  const id = useId();
  const settings = gateway.settings;
  const colorsDirty = useCallback(
    (dirty: boolean) => onDirtyChange("highlight colours", dirty),
    [onDirtyChange],
  );
  const fileNamesDirty = useCallback(
    (dirty: boolean) => onDirtyChange("file names", dirty),
    [onDirtyChange],
  );
  return (
    <>
      <section className="settings-section" aria-labelledby={`${id}-device`}>
        <h2 id={`${id}-device`}>
          <Trans>This device</Trans>
        </h2>
        <p className="settings-section-intro">
          <Trans>These apply only to Reader in this browser.</Trans>
        </p>
        <div className="settings-device">
          <DisplaySettings {...display} />
          <DefaultHighlightColor />
        </div>
      </section>
      <section className="settings-section" aria-labelledby={`${id}-collection`}>
        <h2 id={`${id}-collection`}>
          <Trans>This collection</Trans>
        </h2>
        {settings ? (
          <>
            <p className="settings-section-intro">{translate`Shared by everyone who uses ${collectionName}, on every device.`}</p>
            <HighlightColorSettings settings={settings} onDirtyChange={colorsDirty} />
            <CollectionFileNames
              settings={settings}
              gateway={gateway}
              library={library}
              openSources={openSources}
              onDirtyChange={fileNamesDirty}
            />
          </>
        ) : (
          <p className="settings-section-intro">{translate`${collectionName} can’t hold shared settings, so Reader uses its default highlight colours and file names here.`}</p>
        )}
      </section>
      <section className="settings-section" aria-labelledby={`${id}-connection`}>
        <h2 id={`${id}-connection`}>
          <Trans>Connection</Trans>
        </h2>
        <Connection
          collectionName={collectionName}
          state={connectionState}
          beforeSwitch={async () => (await beforeLeave()) && beforeCollectionSwitch()}
        />
      </section>
    </>
  );
}

/** The colour the next highlight takes; using another colour changes it, as it always has. */
function DefaultHighlightColor(): JSX.Element {
  useLocale();
  const { colors } = useHighlightChoices();
  const color = useLastHighlightColor();
  return (
    <>
      <DisplayChoice
        legend={translate({ message: "Default highlight colour" })}
        value={color}
        options={colors.map((key) => ({ value: key, label: highlightPalette[key].label }))}
        onChange={setLastHighlightColor}
      />
      <p className="display-note">
        <Trans>Highlighting in another colour makes that one the default.</Trans>
      </p>
    </>
  );
}

/** File names, previewed against the sources open now, then the library's first. */
function CollectionFileNames({
  settings,
  gateway,
  library,
  openSources,
  onDirtyChange,
}: {
  readonly settings: ReaderSettingsStore;
  readonly gateway: ReaderWorkspaceGateway;
  readonly library: readonly SourceSummary[];
  readonly openSources: readonly SourceSummary[];
  readonly onDirtyChange: (dirty: boolean) => void;
}): JSX.Element {
  // Taken once, so the preview doesn't change under the user as the library loads.
  const [sources] = useState(() => {
    const seen = new Set<string>();
    return [...openSources, ...library]
      .filter((source) => !seen.has(source.id) && Boolean(seen.add(source.id)))
      .slice(0, previewCount);
  });
  const loadAnnotations = useCallback(async (): Promise<readonly Annotation[]> => {
    const found: Annotation[] = [];
    for (const source of sources) {
      found.push(...(await gateway.annotations(source.id)));
      if (found.length >= previewCount) {
        break;
      }
    }
    return found.slice(0, previewCount);
  }, [gateway, sources]);
  return (
    <FileNameSettings
      settings={settings}
      sources={sources}
      library={library}
      loadAnnotations={loadAnnotations}
      onDirtyChange={onDirtyChange}
    />
  );
}

/** Which collection is open; the shared collection menu switches it and signs out. */
function Connection({
  collectionName,
  state,
  beforeSwitch,
}: {
  readonly collectionName: string;
  readonly state: ReaderConnectionState;
  readonly beforeSwitch: () => Promise<boolean>;
}): JSX.Element {
  const mdbase = useReaderMdbase();
  return (
    <>
      <dl className="settings-connection">
        <dt>
          <Trans>Collection</Trans>
        </dt>
        <dd>{collectionName}</dd>
        <dt>
          <Trans>Status</Trans>
        </dt>
        <dd>{connectionLabels[state]}</dd>
      </dl>
      {mdbase ? (
        <>
          <p className="settings-section-intro">
            <Trans>Switch collections, manage access or sign out from the collection menu.</Trans>
          </p>
          <ReaderCollectionSwitcher mdbase={mdbase} beforeSwitch={beforeSwitch} />
        </>
      ) : null}
    </>
  );
}
