/**
 * Stage a copy of the LYS project (minus heavy/ignored dirs) and run the Vercel CLI
 * to create a standalone student-only deployment for one classroom.
 */

import { cp, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createLogger } from '@/lib/logger';

const log = createLogger('VercelClassroomDeploy');

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  '.git',
  'data',
  'logs',
  'coverage',
  'test-results',
  'playwright-report',
  '.cursor',
  'out',
  'dist',
  'build',
  '.worktrees',
]);

function shouldCopySourcePath(sourcePath: string, projectRoot: string): boolean {
  const rel = path.relative(projectRoot, sourcePath);
  if (!rel || rel === '.') return true;
  const normalized = rel.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  for (const segment of parts) {
    if (SKIP_DIR_NAMES.has(segment)) return false;
  }
  if (normalized.toLowerCase().endsWith('.zip')) return false;
  return true;
}

const MINIMAL_GITIGNORE = `node_modules
.next
.env*.local
.vercel
`;

/**
 * Copy project sources into a temp directory so `data/classrooms` can be uploaded
 * (normally blocked by .gitignore on the teacher's machine).
 */
export async function copyProjectForVercelStaging(destDir: string, projectRoot: string): Promise<void> {
  await cp(projectRoot, destDir, {
    recursive: true,
    filter: (src) => shouldCopySourcePath(src, projectRoot),
  });
  await writeFile(path.join(destDir, '.gitignore'), MINIMAL_GITIGNORE, 'utf-8');
}

export function parseVercelProductionUrl(cliOutput: string): string | null {
  const productionLine = cliOutput.match(/Production:\s*(https:\/\/[^\s\]]+)/i);
  if (productionLine?.[1]) return productionLine[1].replace(/\/+$/, '');

  const all = cliOutput.match(/https:\/\/[^\s]+\.vercel\.app/g);
  if (all?.length) return all[all.length - 1]!.replace(/\/+$/, '');

  const anyHttps = cliOutput.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/gi);
  if (anyHttps?.length) return anyHttps[anyHttps.length - 1]!.replace(/\/+$/, '');

  return null;
}

function sanitizeVercelProjectName(classroomId: string): string {
  return `LYS-${classroomId}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-{3,}/g, '--')
    .slice(0, 100);
}

export async function runVercelDeploy(options: {
  /** LYS project root (contains node_modules / vercel CLI). */
  projectRoot: string;
  stagingDir: string;
  token: string;
  classroomId: string;
}): Promise<string> {
  const { projectRoot, stagingDir, token, classroomId } = options;

  const envPairs = [
    `NEXT_PUBLIC_LYS_STUDENT_SITE=1`,
    `NEXT_PUBLIC_STUDENT_CLASSROOM_ID=${classroomId}`,
  ];

  const projectName = sanitizeVercelProjectName(classroomId);

  const args = [
    'exec',
    'vercel',
    'deploy',
    '--yes',
    '--prod',
    '--token',
    token,
    '--name',
    projectName,
    ...envPairs.flatMap((pair) => ['--build-env', pair]),
    ...envPairs.flatMap((pair) => ['--env', pair]),
    stagingDir,
  ];

  const out = await new Promise<string>((resolve, reject) => {
    const proc = spawn('pnpm', args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        VERCEL_TOKEN: token,
        CI: '1',
      },
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      stdout += s;
      log.info(s.trimEnd());
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      stderr += s;
      log.warn(s.trimEnd());
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const combined = stdout + '\n' + stderr;
      if (code === 0) resolve(combined);
      else reject(new Error(combined || `vercel deploy exited with code ${code}`));
    });
  });

  const url = parseVercelProductionUrl(out);
  if (!url) {
    log.error('Could not parse deployment URL. CLI output tail:', out.slice(-2000));
    throw new Error(
      'Vercel deploy finished but no deployment URL was found. Check server logs and VERCEL_TOKEN scope.',
    );
  }
  return url;
}

export async function makeStagingDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'LYS-vercel-'));
}

export async function removeStagingDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
