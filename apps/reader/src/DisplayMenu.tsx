import { lazyFeature } from "./lazy-feature.js";
import { Menu } from "./Menu.js";

import type { DisplaySettings } from "./DisplaySettings.js";

const Settings = lazyFeature(
  async () => ({ default: (await import("./DisplaySettings.js")).DisplaySettings }),
  "display settings",
);

/** Keep the native disclosure trigger immediate; settings load on intent or opening. */
export function DisplayMenu(props: Parameters<typeof DisplaySettings>[0]): React.JSX.Element {
  return (
    <Menu
      className="header-display-menu"
      label="Display settings"
      title="Text and display"
      triggerClassName="icon-button header-display-trigger"
      trigger={<span aria-hidden="true">Aa</span>}
      defer
      onIntent={Settings.preload}
    >
      <Settings {...props} />
    </Menu>
  );
}
