const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const launcher = path.join(projectRoot, 'launcher.py');
const candidates = [
  process.env.PYTHON,
  'python',
  'py',
  path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe')
].filter(Boolean);

function canRun(command) {
  if (path.isAbsolute(command)) return fs.existsSync(command);
  const probeArgs = command.toLowerCase() === 'py' ? ['-3', '--version'] : ['--version'];
  const probe = spawnSync(command, probeArgs, { stdio: 'ignore', shell: false });
  return !probe.error && probe.status === 0;
}

const python = candidates.find(canRun);
if (!python) {
  console.error('Python was not found. Please install Python or set the PYTHON environment variable.');
  process.exit(1);
}

const args = path.basename(python).toLowerCase() === 'py' ? ['-3', launcher] : [launcher];
const child = spawn(python, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
