import "../../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";
import "react-native-reanimated";

import { ProviderConfigurationReminder } from "@/components/provider-configuration-reminder";
import { createDb, DATABASE_NAME } from "@/db/client";
import migrations from "@/drizzle/migrations";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppRuntimeProvider } from "@/providers/app-provider";
import { ToastProvider } from "@/providers/toast-provider";

// Confirm deep links should land in tabs context, not strand users without capture/history.
export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <Suspense
      fallback={
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" />
        </View>
      }
    >
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        options={{ enableChangeListener: true }}
        useSuspense
      >
        <RootLayoutWithDatabase />
      </SQLiteProvider>
    </Suspense>
  );
}

function RootLayoutWithDatabase() {
  const sqlite = useSQLiteContext();
  const db = createDb(sqlite);
  const migration = useMigrations(db, migrations);
  const colorScheme = useColorScheme();

  if (migration.error) {
    throw migration.error;
  }

  // Repositories query tables that do not exist until migrations finish.
  if (!migration.success) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AppRuntimeProvider>
      <ToastProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Head.Provider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="confirm/[attemptId]"
                options={{ title: "Confirm & Edit" }}
              />
            </Stack>
            <ProviderConfigurationReminder />
          </Head.Provider>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ToastProvider>
    </AppRuntimeProvider>
  );
}
