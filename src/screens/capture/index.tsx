import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/ui/app-chrome";
import { Button } from "@/components/ui/button";
import { ScreenView } from "@/components/ui/screen";
import { scheduleDeferredMount } from "@/utils/idle";

import { CameraPanel } from "./camera-panel";
import { ControlPanel } from "./control-panel";
import { PendingImageStrip } from "./pending-image-strip";
import { useSession } from "./use-session";

export function CaptureScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const cameraReady = useDeferredCameraReady(focused);
  const session = useSession();

  return (
    <ScreenView className="gap-4 bg-background pb-6">
      <AppHeader
        eyebrow="Tolksyn"
        title="Capture"
        meta="Frame the label. Capture once. Review before sending."
        action={
          <Button
            variant="secondary"
            size="sm"
            label="Settings"
            onPress={() => router.push("/settings")}
          />
        }
      />
      <CameraPanel
        session={session}
        focused={focused}
        cameraReady={cameraReady}
      />
      <PendingImageStrip session={session} />
      <ControlPanel session={session} />
    </ScreenView>
  );
}

function useDeferredCameraReady(focused: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!focused) {
      setReady(false);
      return;
    }

    return scheduleDeferredMount(() => setReady(true));
  }, [focused]);

  return ready;
}
