export type ModuleCollection = Record<string, Record<string, unknown>>;

function isTestFile(filepath: string): boolean {
  return /(?:^|\/)__tests__(?:\/|$)|\.test\./.test(filepath);
}

export function buildModuleId(filepath: string, root: string): string | null {
  // Check if the filepath starts with the expected prefix and is not a test
  // file
  const prefix = [`../${root}/`, `./${root}/`].find((candidate) =>
    filepath.startsWith(candidate),
  );
  if (!prefix || isTestFile(filepath)) {
    return null;
  }

  // Remove the prefix and file extension to get the relative path within the
  // module root
  const relativePath = filepath
    .slice(prefix.length)
    .replace(/\.(?:[cm]?[jt]sx?)$/, '');
  if (!relativePath) {
    return null;
  }

  // Convert the relative path into a module ID by replacing slashes with dots
  // and normalizing each segment
  return relativePath
    .split('/')
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase(),
    )
    .join('.');
}
