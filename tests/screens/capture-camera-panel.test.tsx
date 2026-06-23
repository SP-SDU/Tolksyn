import { render } from "@testing-library/react-native";
import type { ComponentType } from "react";

import { BarcodeCamera } from "@/components/barcode-camera";
import { CameraPanel } from "@/screens/capture/camera-panel";

jest.mock("@/components/barcode-camera", () => ({
  BarcodeCamera: jest.fn(() => null),
}));

jest.mock("@/components/scan-animation", () => ({
  ScanAnimation: () => null,
}));

describe("CameraPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not mount camera before screen is ready", () => {
    const Panel = CameraPanel as ComponentType<any>;

    render(<Panel session={cameraSession()} focused cameraReady={false} />);

    expect(BarcodeCamera).not.toHaveBeenCalled();
  });

  it("does not mount camera while capture tab is blurred", () => {
    const Panel = CameraPanel as ComponentType<any>;

    render(<Panel session={cameraSession()} focused={false} cameraReady />);

    expect(BarcodeCamera).not.toHaveBeenCalled();
  });
});

function cameraSession() {
  return {
    cameraRef: { current: null },
    permission: { granted: true },
    requestPermission: jest.fn(),
    isProcessing: false,
    processingImageUris: null,
    pendingImages: [],
    handleBarcodeScanned: jest.fn(),
  };
}
