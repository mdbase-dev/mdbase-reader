import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.mdbase.reader",
  appName: "mdbase reader",
  webDir: "../reader/dist",
  server: { androidScheme: "https" },
};

export default config;
