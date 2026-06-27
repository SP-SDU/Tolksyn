import { render } from "@testing-library/react-native";
import React, { Children, isValidElement, type ReactElement } from "react";
import { ActivityIndicator } from "react-native";

import { AppDesign } from "@/constants/theme";

type TabRootProps = {
  children?: React.ReactNode;
  screenOptions: {
    tabBarActiveTintColor: string;
    tabBarInactiveTintColor: string;
    headerShown: boolean;
    lazy: boolean;
    tabBarLabelStyle: Record<string, unknown>;
    tabBarStyle: Record<string, unknown>;
  };
};

type TabScreenProps = {
  name: string;
  options: {
    title: string;
    tabBarIcon: (props: { color: string }) => ReactElement<{ name: string }>;
  };
};

type SQLiteProviderProps = {
  databaseName: string;
  options: { enableChangeListener: boolean };
  useSuspense: boolean;
};

jest.mock("../../global.css", () => ({}));

const mockTabsScreen = () => null;
mockTabsScreen.displayName = "Tabs.Screen";
const mockTabs = Object.assign(
  ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  { Screen: mockTabsScreen },
);

const mockStackScreen = () => null;
mockStackScreen.displayName = "Stack.Screen";
const mockStack = Object.assign(
  ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  { Screen: mockStackScreen },
);

const mockHead = Object.assign(
  ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  { Provider: ({ children }: { children?: React.ReactNode }) => <>{children}</> },
);

const mockSQLiteProvider = ({ children }: { children?: React.ReactNode }) => <>
  {children}
</>;

const mockStatusBar = (props: object) => React.createElement("StatusBar", props);
const mockThemeProvider = ({ children, ...props }: { children?: React.ReactNode }) =>
  React.createElement("ThemeProvider", props, children);
const mockAppRuntimeProvider = ({ children }: { children?: React.ReactNode }) => <>
  {children}
</>;
const mockToastProvider = ({ children }: { children?: React.ReactNode }) => <>
  {children}
</>;
const mockProviderConfigurationReminder = () =>
  React.createElement("ProviderConfigurationReminder");
const mockIconSymbol = (props: object) => React.createElement("IconSymbol", props);

jest.mock("expo-router", () => {
  return { Tabs: mockTabs, Stack: mockStack };
});

jest.mock("expo-router/head", () => {
  return { __esModule: true, default: mockHead };
});

jest.mock("expo-sqlite", () => {
  return {
    SQLiteProvider: mockSQLiteProvider,
    useSQLiteContext: jest.fn(() => ({ id: "sqlite" })),
  };
});

jest.mock("drizzle-orm/expo-sqlite/migrator", () => ({
  useMigrations: jest.fn(),
}));

jest.mock("expo-status-bar", () => ({
  StatusBar: mockStatusBar,
}));

jest.mock("@react-navigation/native", () => ({
  DarkTheme: { name: "dark" },
  DefaultTheme: { name: "default" },
  ThemeProvider: mockThemeProvider,
}));

jest.mock("@/db/client", () => ({
  DATABASE_NAME: "tolksyn.test.db",
  createDb: jest.fn((sqlite) => ({ sqlite })),
}));

jest.mock("@/drizzle/migrations", () => ({}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: jest.fn() }));
jest.mock("@/providers/app-provider", () => ({
  AppRuntimeProvider: mockAppRuntimeProvider,
}));
jest.mock("@/providers/toast-provider", () => ({
  ToastProvider: mockToastProvider,
}));
jest.mock("@/components/provider-configuration-reminder", () => ({
  ProviderConfigurationReminder: mockProviderConfigurationReminder,
}));
jest.mock("@/components/haptic-tab", () => ({ HapticTab: () => null }));
jest.mock("@/components/ui/icon-symbol", () => ({
  IconSymbol: mockIconSymbol,
}));
jest.mock("react-native-reanimated", () => ({}));

const { useMigrations } = jest.requireMock(
  "drizzle-orm/expo-sqlite/migrator",
) as { useMigrations: jest.Mock };
const { useColorScheme } = jest.requireMock("@/hooks/use-color-scheme") as {
  useColorScheme: jest.Mock;
};
const { createDb, DATABASE_NAME } = jest.requireMock("@/db/client") as {
  createDb: jest.Mock;
  DATABASE_NAME: string;
};

const { default: TabLayout } = require("@/app/(tabs)/_layout") as typeof import("@/app/(tabs)/_layout");
const {
  default: RootLayout,
  unstable_settings,
} = require("@/app/_layout") as typeof import("@/app/_layout");

describe("app layouts", () => {
  beforeEach(() => {
    useMigrations.mockReset();
    useColorScheme.mockReset();
    createDb.mockClear();
    useColorScheme.mockReturnValue("light");
  });

  test("tab layout wires tab chrome and screen options", () => {
    const root = TabLayout() as ReactElement<TabRootProps>;
    const screens = Children.toArray(root.props.children).filter(
      isValidElement,
    ) as ReactElement<TabScreenProps>[];

    expect(root.props.screenOptions).toEqual(
      expect.objectContaining({
        tabBarActiveTintColor: AppDesign.color.red,
        tabBarInactiveTintColor: AppDesign.color.ink,
        headerShown: false,
        lazy: true,
      }),
    );
    expect(root.props.screenOptions.tabBarLabelStyle).toEqual({
      fontSize: 11,
      fontWeight: "900",
      textTransform: "uppercase",
    });
    expect(root.props.screenOptions.tabBarStyle).toEqual({
      backgroundColor: AppDesign.color.paper,
      borderTopColor: AppDesign.color.ink,
      borderTopWidth: AppDesign.border.solid,
    });
    expect(screens.map((screen) => screen.props.name)).toEqual([
      "index",
      "history",
      "settings",
    ]);
    expect(screens.map((screen) => screen.props.options.title)).toEqual([
      "Capture",
      "History",
      "Settings",
    ]);
    expect(screens[0].props.options.tabBarIcon({ color: "red" }).props.name).toBe(
      "camera.fill",
    );
    expect(screens[1].props.options.tabBarIcon({ color: "blue" }).props.name).toBe(
      "clock.fill",
    );
    expect(screens[2].props.options.tabBarIcon({ color: "green" }).props.name).toBe(
      "gearshape.fill",
    );
  });

  test("root layout anchors deep links and configures sqlite provider", () => {
    useMigrations.mockReturnValue({ success: false });

    const root = RootLayout() as ReactElement<{
      children: ReactElement<SQLiteProviderProps>;
    }>;
    const sqliteProvider = root.props.children;

    expect(unstable_settings).toEqual({ anchor: "(tabs)" });
    expect(sqliteProvider.props.databaseName).toBe(DATABASE_NAME);
    expect(sqliteProvider.props.options).toEqual({ enableChangeListener: true });
    expect(sqliteProvider.props.useSuspense).toBe(true);
  });

  test("root layout shows migration loading fallback until migrations finish", () => {
    useMigrations.mockReturnValue({ success: false });

    const { UNSAFE_getByType } = render(<RootLayout />);

    expect(createDb).toHaveBeenCalledWith({ id: "sqlite" });
    expect(UNSAFE_getByType(ActivityIndicator).props.size).toBe("large");
  });

  test("root layout throws migration errors", () => {
    const error = new Error("migration failed");
    useMigrations.mockReturnValue({ error, success: false });

    expect(() => render(<RootLayout />)).toThrow(error);
  });

  test("root layout renders navigation chrome after migrations succeed", () => {
    useMigrations.mockReturnValue({ success: true });
    useColorScheme.mockReturnValue("dark");

    const { UNSAFE_getByType } = render(<RootLayout />);

    expect(UNSAFE_getByType("ThemeProvider" as any).props.value).toEqual({
      name: "dark",
    });
    expect(UNSAFE_getByType("ProviderConfigurationReminder" as any)).toBeTruthy();
    expect(UNSAFE_getByType("StatusBar" as any).props.style).toBe("auto");
  });
});
