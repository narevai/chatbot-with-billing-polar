import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Adjust this if your script is in the root instead of a `scripts/` folder:
// const targetDir = __dirname;
const targetDir = path.resolve(__dirname, '..');

// Configuration
const REPO_URL = 'https://github.com/narevai/ai-billing.git';
const BRANCH = 'docs/polar-billing-template-sync';
const SOURCE_SUBDIR = 'examples/chatbot-with-billing-polar';

async function main() {
  // Create a temporary directory to clone the monorepo
  const tempRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-billing-'));
  console.log(`Cloning ${REPO_URL} (branch: ${BRANCH}) into ${tempRepoDir}...`);

  try {
    // 1. Clone the repository (depth 1 for speed)
    execSync(
      `git clone --depth 1 --branch ${BRANCH} ${REPO_URL} ${tempRepoDir}`,
      { stdio: 'inherit' },
    );

    const sourceDir = path.join(tempRepoDir, SOURCE_SUBDIR);
    console.log(`Copying template from ${sourceDir} to ${targetDir}...`);

    // 2. Copy files (excluding node_modules and build artifacts)
    // We iterate and copy so we don't overwrite the .git folder of the current repo
    const filesToCopy = await fs.readdir(sourceDir);
    for (const file of filesToCopy) {
      if (['node_modules', '.next', 'dist', '.turbo'].includes(file)) continue;
      await fs.cp(path.join(sourceDir, file), path.join(targetDir, file), {
        recursive: true,
        force: true,
      });
    }

    // 2.5 Copy root configuration files from the cloned repo
    const rootFilesToCopy = ['LICENSE', '.oxfmtrc.jsonc'];
    for (const file of rootFilesToCopy) {
      try {
        await fs.cp(path.join(tempRepoDir, file), path.join(targetDir, file));
        console.log(`Copied ${file} from root.`);
      } catch (error) {
        console.warn(
          `Warning: Could not copy ${file} from root:`,
          error.message,
        );
      }
    }

    // 3. Parse pnpm-workspace.yaml for catalog versions from the cloned repo
    const workspaceYaml = await fs.readFile(
      path.join(tempRepoDir, 'pnpm-workspace.yaml'),
      'utf-8',
    );
    const catalogSection = workspaceYaml
      .split('catalogs:')[1]
      ?.split('default:')[1];
    const catalog = {};
    if (catalogSection) {
      for (const line of catalogSection.split('\n')) {
        const match = line.match(
          /^\s+['"]?([^:'"]+)['"]?:\s*['"]?([^'"]+)['"]?/,
        );
        if (match) {
          catalog[match[1]] = match[2];
        }
      }
    }

    // 4. Read workspace packages to get their versions from the cloned repo
    const packagesDir = path.join(tempRepoDir, 'packages');
    const packageDirs = await fs.readdir(packagesDir);
    const workspaceVersions = {};
    for (const dir of packageDirs) {
      const pkgPath = path.join(packagesDir, dir, 'package.json');
      try {
        const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        workspaceVersions[pkgJson.name] = pkgJson.version;
      } catch (e) {
        // Ignore if not a package
      }
    }

    // 5. Update package.json in the target directory
    const targetPkgPath = path.join(targetDir, 'package.json');
    const targetPkg = JSON.parse(await fs.readFile(targetPkgPath, 'utf-8'));

    const updateDependencies = deps => {
      if (!deps) return;
      for (const [name, version] of Object.entries(deps)) {
        if (version === 'workspace:*' || version.startsWith('workspace:')) {
          if (workspaceVersions[name]) {
            deps[name] = `^${workspaceVersions[name]}`;
            console.log(
              `Replaced workspace dependency ${name} with ^${workspaceVersions[name]}`,
            );
          } else {
            console.warn(
              `Warning: Workspace package ${name} not found in packages/`,
            );
          }
        } else if (version === 'catalog:') {
          if (catalog[name]) {
            deps[name] = catalog[name];
            console.log(
              `Replaced catalog dependency ${name} with ${catalog[name]}`,
            );
          } else {
            console.warn(
              `Warning: Catalog package ${name} not found in pnpm-workspace.yaml`,
            );
          }
        }
      }
    };

    updateDependencies(targetPkg.dependencies);
    updateDependencies(targetPkg.devDependencies);

    // Optional: remove private flag or update name
    targetPkg.name = 'chatbot-with-billing-polar';
    delete targetPkg.private;

    await fs.writeFile(
      targetPkgPath,
      JSON.stringify(targetPkg, null, 2) + '\n',
    );
    console.log('Updated package.json successfully.');

    // 6. Test the exported template
    console.log('\nTesting the pulled template by running pnpm install...');
    execSync('pnpm install', { cwd: targetDir, stdio: 'inherit' });
    console.log('\nTemplate pulled and tested successfully!');
  } catch (error) {
    console.error('\nFailed to pull and install dependencies:', error);
    process.exit(1);
  } finally {
    // 7. Clean up the temporary repository clone
    console.log(`\nCleaning up temporary directory ${tempRepoDir}...`);
    await fs.rm(tempRepoDir, { recursive: true, force: true });
  }
}

main().catch(console.error);
