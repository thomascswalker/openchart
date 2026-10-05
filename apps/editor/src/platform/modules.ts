export type ModuleCollection = Record<string, Record<string, unknown>>;

export function moduleId(filepath: string, root: string): string | null {
  const prefix = `../${root}/`;
  if (
    !filepath.startsWith(prefix) ||
    /(?:^|\/)__tests__(?:\/|$)|\.test\./.test(filepath)
  ) {
    return null;
  }

  const relativePath = filepath
    .slice(prefix.length)
    .replace(/\.(?:[cm]?[jt]sx?)$/, "");
  if (!relativePath) return null;

  return relativePath
    .split("/")
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase(),
    )
    .join(".");
}
