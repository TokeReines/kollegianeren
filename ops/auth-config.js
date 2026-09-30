#!/usr/bin/env node
// Reads or changes a project's Firebase Auth settings through the Identity Toolkit admin API.
//
//   node auth-config.js --project dev                                  # show the relevant settings
//   node auth-config.js --project dev --email-privacy on|off           # email enumeration protection
//   node auth-config.js --project dev --domains a.web.app,localhost    # authorised domains (replaces the list)
const { init, parseArgs } = require('./lib/firebase');

const args = parseArgs();
const { projectId, accessToken } = init(args.project);
const URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', 'x-goog-user-project': projectId },
    body: body && JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j;
}

const show = c => console.log(JSON.stringify({
  emailPrivacy: !!c.emailPrivacyConfig?.enableImprovedEmailPrivacy,
  authorizedDomains: c.authorizedDomains,
  signIn: { email: c.signIn?.email, anonymous: c.signIn?.anonymous?.enabled ?? false },
}, null, 2));

(async () => {
  const patch = {}, mask = [];
  if (args['email-privacy']) {
    patch.emailPrivacyConfig = { enableImprovedEmailPrivacy: args['email-privacy'] === 'on' };
    mask.push('emailPrivacyConfig.enableImprovedEmailPrivacy');
  }
  if (typeof args.domains === 'string') {
    patch.authorizedDomains = args.domains.split(',').map(s => s.trim()).filter(Boolean);
    mask.push('authorizedDomains');
  }
  if (!mask.length) return show(await call('GET', URL));
  console.log('before:'); show(await call('GET', URL));
  console.log('after:'); show(await call('PATCH', `${URL}?updateMask=${mask.join(',')}`, patch));
})().catch(e => { console.error(e.message); process.exit(1); });
