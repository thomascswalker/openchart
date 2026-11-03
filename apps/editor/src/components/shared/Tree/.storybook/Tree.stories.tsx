import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileTreeView } from "../Tree";
import { Section } from "../../../shared";
import { useEffect, useState } from "react";
import {
  getOriginPrivateDirectory,
  type FileSystemDirectoryHandle,
} from "native-file-system-adapter";
import memoryAdapter from "native-file-system-adapter/src/adapters/memory.js";

interface MockDirectory {
  [name: string]: string | MockDirectory;
}

const MOCK_FILES: MockDirectory = {
  "file2.txt": "content2",
  dir1: {
    "file1.txt": "content",
    dir2: { "file4.txt": "content4" },
  },
  "file3.txt": "content3",
};

// Populates an in-memory directory (browser-safe; mock-fs requires Node).
async function populate(dir: FileSystemDirectoryHandle, tree: MockDirectory) {
  for (const [name, value] of Object.entries(tree)) {
    if (typeof value === "string") {
      const file = await dir.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(value);
      await writable.close();
    } else {
      const sub = await dir.getDirectoryHandle(name, { create: true });
      await populate(sub, value);
    }
  }
}

const Wrapper = () => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle>();

  useEffect(() => {
    (async () => {
      const root = await getOriginPrivateDirectory(memoryAdapter);
      await populate(root, MOCK_FILES);
      setRootHandle(root);
    })();
  }, []);

  if (!rootHandle) {
    return null;
  }

  return (
    <Section
      flexShrink={1}
      padding={0}
      borderRadius={4}
      border="1px solid var(--border-color-primary)"
    >
      <FileTreeView rootHandle={rootHandle} />
    </Section>
  );
};

const meta = {
  title: "Components/Tree",
  component: Wrapper,
  decorators: [
    (Story) => {
      return <Story />;
    },
  ],
} satisfies Meta<typeof Wrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
