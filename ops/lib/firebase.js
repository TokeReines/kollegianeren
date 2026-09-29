const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const ALIASES = { prod: 'firebase-ehp', dev: 'kollegianeren' };

function resolveProject(name) {
  if (!name) throw new Error('Missing --project (prod, dev or a project id)');
  return ALIASES[name] || name;
}

// Cron uses a service account via GOOGLE_APPLICATION_CREDENTIALS. Locally we reuse the
// `firebase login` session by writing it out as an authorized_user ADC file.
function ensureCredentials(projectId) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const cfgPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(cfgPath)) throw new Error('No credentials: set GOOGLE_APPLICATION_CREDENTIALS or run `firebase login`');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const toolsApi = require(path.join(execSync('npm root -g').toString().trim(), 'firebase-tools/lib/api'));
  const file = path.join(os.tmpdir(), `kollegianeren-adc-${os.userInfo().uid}.json`);
  fs.writeFileSync(file, JSON.stringify({
    type: 'authorized_user',
    client_id: toolsApi.clientId(),
    client_secret: toolsApi.clientSecret(),
    refresh_token: cfg.tokens.refresh_token,
    quota_project_id: projectId,
  }), { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
}

function init(project) {
  const projectId = resolveProject(project);
  ensureCredentials(projectId);
  const credential = applicationDefault();
  const app = initializeApp({ credential, projectId }, projectId);
  const accessToken = async () => (await credential.getAccessToken()).access_token;
  return { projectId, app, db: getFirestore(app), auth: getAuth(app), accessToken };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

module.exports = { init, resolveProject, parseArgs, ALIASES };
