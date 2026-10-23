import { i18n, type Messages } from "@lingui/core";

import english from "../locales/en/messages.json";

// Every entry point shares one instance. English never needs a network request.
i18n.load("en", english.messages as Messages);
i18n.activate("en");

export { i18n };
