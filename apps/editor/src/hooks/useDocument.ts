import { useSyncExternalStore } from "react";
import Platform from "../platform";
import { DocumentService } from "../services/document";

export function useDocument() {
  const document = Platform.services.get<DocumentService>("document");
  return useSyncExternalStore(
    document.subscribe,
    document.getSnapshot,
    document.getSnapshot,
  );
}
