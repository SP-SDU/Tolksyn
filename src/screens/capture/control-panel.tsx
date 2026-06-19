import { View } from "react-native";

import { BrutalFrame, StatusPill } from "@/components/ui/app-chrome";
import { Button } from "@/components/ui/button";

import type { Session } from "./use-session";

type Stage = Session["barcodeState"];

export function ControlPanel({ session }: { session: Session }) {
  return (
    <BrutalFrame className="gap-3 bg-paper">
      <View className="flex-row flex-wrap gap-2">
        <StatusPill
          label={session.permission?.granted ? "Camera Ready" : "Camera Locked"}
          tone={session.permission?.granted ? "success" : "warning"}
        />
        <StatusPill
          label={barcodeSummary(session.liveBarcodes.length)}
          tone={session.liveBarcodes.length ? "warning" : "default"}
        />
        <StatusPill
          label={`Barcode: ${formatStage(session.barcodeState, session.barcodeState === "running" ? session.elapsedSec : undefined)}`}
          tone={stageTone(session.barcodeState)}
        />
        <StatusPill
          label={`Vision-language: ${formatStage(session.extractionState, session.extractionState === "running" ? session.elapsedSec : undefined)}`}
          tone={stageTone(session.extractionState)}
        />
        <StatusPill
          label={`Websearch: ${formatStage(session.websearchState, session.websearchState === "running" ? session.elapsedSec : undefined)}`}
          tone={stageTone(session.websearchState)}
        />
        {session.isProcessing ? (
          <StatusPill label="Processing" tone="warning" />
        ) : null}
      </View>
      <CaptureButtons session={session} />
    </BrutalFrame>
  );
}

function CaptureButtons({ session }: { session: Session }) {
  if (session.isProcessing) {
    return (
      <ButtonRow label="Cancel" onPress={session.handleCancelProcessing} />
    );
  }

  if (session.pendingImages.length > 0) {
    return (
      <View className="flex-row gap-2">
        <PanelButton
          label={`Process (${session.pendingImages.length})`}
          onPress={session.handleProcessPending}
        />
        <PanelButton
          label="Capture"
          variant="secondary"
          onPress={session.handleCapture}
        />
      </View>
    );
  }

  return (
    <View className="flex-row gap-2">
      <PanelButton
        label="Gallery"
        variant="secondary"
        onPress={session.handleGalleryImport}
      />
      <PanelButton label="Capture" onPress={session.handleCapture} />
    </View>
  );
}

function ButtonRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View className="flex-row gap-2">
      <PanelButton label={label} variant="secondary" onPress={onPress} />
    </View>
  );
}

function PanelButton({
  label,
  onPress,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button
      variant={variant}
      className="flex-1 min-h-12 px-3 py-3"
      textClassName="text-center text-xs leading-5"
      label={label}
      onPress={onPress}
    />
  );
}

function barcodeSummary(count: number) {
  if (!count) {
    return "No Barcode Yet";
  }

  return `${count} Barcode${count === 1 ? "" : "s"}`;
}

function formatStage(stage: Stage, elapsedSec?: number) {
  if (stage === "running") {
    return elapsedSec == null ? "running" : `running (${elapsedSec}s)`;
  }

  if (stage === "done") {
    return "done";
  }

  if (stage === "failed") {
    return "failed";
  }

  return "waiting";
}

function stageTone(stage: Stage): "default" | "warning" | "success" | "danger" {
  if (stage === "failed") {
    return "danger";
  }

  if (stage === "done") {
    return "success";
  }

  if (stage === "running") {
    return "warning";
  }

  return "default";
}
