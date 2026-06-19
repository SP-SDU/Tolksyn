import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppDesign } from "@/constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: AppDesign.color.red,
        tabBarInactiveTintColor: AppDesign.color.ink,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "900",
          textTransform: "uppercase",
        },
        tabBarStyle: {
          backgroundColor: AppDesign.color.paper,
          borderTopColor: AppDesign.color.ink,
          borderTopWidth: AppDesign.border.solid,
        },
        headerShown: false,
        // Light haptic on iOS confirms tab switches during fast capture workflows.
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Capture",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="camera.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="clock.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
