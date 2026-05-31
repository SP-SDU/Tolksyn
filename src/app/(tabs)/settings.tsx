import Head from "expo-router/head";

import { SettingsScreen } from "@/screens/settings";

export default function SettingsRoute() {
  return (
    <>
      <Head>
        <title>Tolksyn Settings</title>
        <meta
          name="description"
          content="Configure Tolksyn providers, ingest settings, barcode scanning, and local data."
        />
      </Head>
      <SettingsScreen />
    </>
  );
}
