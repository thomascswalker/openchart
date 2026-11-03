// The package ships no declarations for its node adapter.
declare module "native-file-system-adapter/src/adapters/node.js" {
  import type { FileSystemDirectoryHandle } from "native-file-system-adapter";

  const nodeAdapter: (
    path: string,
  ) => Promise<FileSystemDirectoryHandle> | FileSystemDirectoryHandle;
  export default nodeAdapter;
}
