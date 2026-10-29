import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(entryPath);
      if (
        entry.isFile() &&
        (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))
      ) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nested.flat();
}

function getSpecifierNodes(sourceFile) {
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0]);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

async function resolveOutputSpecifier(filePath, specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  if (path.posix.extname(specifier) !== "") return null;

  const targetPath = path.resolve(path.dirname(filePath), specifier);
  const extension = filePath.endsWith(".d.ts") ? ".d.ts" : ".js";

  if (await isFile(`${targetPath}${extension}`)) return `${specifier}.js`;
  if (await isFile(path.join(targetPath, `index${extension}`))) {
    return `${specifier}/index.js`;
  }

  throw new Error(
    `Could not resolve extensionless relative import "${specifier}" in ${filePath}`,
  );
}

async function rewriteFile(filePath) {
  let text = await readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".d.ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const replacements = [];

  for (const node of getSpecifierNodes(sourceFile)) {
    const updatedSpecifier = await resolveOutputSpecifier(filePath, node.text);
    if (updatedSpecifier) {
      replacements.push({
        start: node.getStart(sourceFile) + 1,
        end: node.end - 1,
        text: updatedSpecifier,
      });
    }
  }

  for (const replacement of replacements.reverse()) {
    text = `${text.slice(0, replacement.start)}${replacement.text}${text.slice(replacement.end)}`;
  }

  if (replacements.length > 0) await writeFile(filePath, text);
}

const outputDirectory = path.resolve(process.cwd(), process.argv[2] ?? "");
if (path.dirname(outputDirectory) !== process.cwd()) {
  throw new Error(
    "Provide a package output directory directly inside the package, for example: ./dist",
  );
}

for (const filePath of await collectFiles(outputDirectory)) {
  await rewriteFile(filePath);
}
