const DB_NAME = "midiedit.audio-directory";
const STORE_NAME = "handles";
const HANDLE_KEY = "rootDirectory";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveAudioDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await withStore("readwrite", (store) => store.put(handle, HANDLE_KEY));
}

export async function loadAudioDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await withStore<FileSystemDirectoryHandle | undefined>(
      "readonly",
      (store) => store.get(HANDLE_KEY),
    );
    return handle ?? null;
  } catch {
    return null;
  }
}

/** Checks (without prompting) whether read permission is already granted. */
export async function hasReadPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    return (await handle.queryPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

/** Requests read permission; must be called from a user gesture. */
export async function requestReadPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    return (await handle.requestPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}
