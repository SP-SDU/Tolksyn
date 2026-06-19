import {
  serializeStructuredItemCsv,
  serializeSubmissionJson,
} from "@/services/export-serialization";
import type { StructuredItem } from "@/types/item-schema";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { SubmissionPayload } from "./submission-service";

export function createExportService() {
  return {
    async exportJson(payload: SubmissionPayload): Promise<void> {
      const content = serializeSubmissionJson(payload);
      const filename = `tolksyn-${payload.attemptId}-${Date.now()}.json`;
      await exportFile(filename, content, "application/json");
    },

    async exportCsv(attemptId: string, item: StructuredItem): Promise<void> {
      const content = serializeStructuredItemCsv(item);
      const filename = `tolksyn-${attemptId}-${Date.now()}.csv`;
      await exportFile(filename, content, "text/csv");
    },
  };
}

async function exportFile(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // Expo SDK 55 moved exports off legacy writeAsStringAsync paths.
  const exportsDir = new Directory(Paths.document, "tolksyn", "exports") as any;
  exportsDir.create({ idempotent: true, intermediates: true });

  const file = new File(exportsDir, filename) as any;
  file.write(content);

  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (isSharingAvailable) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: "Export Tolksyn Data",
    });
  } else {
    throw new Error("Sharing is not available on this device");
  }
}
