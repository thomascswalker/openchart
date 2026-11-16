import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const packageRoot = process.cwd();
const distRoot = path.join(packageRoot, 'dist');
const sourceRoot = path.join(packageRoot, 'src');

await mkdir(distRoot, { recursive: true });

for (const relative of ['styles.css', 'theme.css']) {
  const source = path.join(sourceRoot, relative);
  const target = path.join(distRoot, relative);
  await cp(source, target);
}

for (const relative of ['assets', 'components', 'models', 'util']) {
  const sourceDir = path.join(sourceRoot, relative);
  const targetDir = path.join(distRoot, relative);
  await cp(sourceDir, targetDir, { recursive: true });
}
