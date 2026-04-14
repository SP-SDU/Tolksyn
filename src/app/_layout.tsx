import '../../global.css';

import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import 'react-native-reanimated';

import { createDb, DATABASE_NAME } from '@/db/client';
import { AppRuntimeProvider } from '@/providers/app-provider';
import migrations from '@/drizzle/migrations';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      }>
      <SQLiteProvider databaseName={DATABASE_NAME} options={{ enableChangeListener: true }} useSuspense>
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

  if (!migration.success) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AppRuntimeProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="confirm/[attemptId]" options={{ title: 'Confirm & Edit' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppRuntimeProvider>
  );
}
