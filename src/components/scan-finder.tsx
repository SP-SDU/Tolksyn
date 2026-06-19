import { View } from "react-native";

import { AppDesign } from "@/constants/theme";

export function ScanFinder() {
  return (
    <View
      style={{
        width: 92,
        height: 92,
        borderWidth: 3,
        borderColor: AppDesign.color.yellow,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{ width: 8, height: 8, backgroundColor: AppDesign.color.yellow }}
      />
    </View>
  );
}
