// The shell arms a 15 second watchdog that covers the whole viewport with "The
// Hub did not finish loading" unless window.__hubAlive is set. Nothing in this
// repository set it, so the banner fired on every load of both Hubs, for
// everyone, from 30 August. Which view it landed on was only a question of
// where the reader happened to be when the timer expired, which is why it
// looked like a broker-only fault and was not one.
//
// These read the shipped files, so the guarantee is about what deploys.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const shell = read('index.html');
const payload = read('hub_payload.html');
const next = read('hub_next.html');

const checks = [];

// If the shell ever stops arming the watchdog these become pointless rather
// than wrong, so assert the contract still exists before asserting both sides.
checks.push(['the shell still arms the watchdog', /if\(window\.__hubAlive\) return;/.test(shell)]);
checks.push(['and it is the banner this guards',
  /did not finish loading/.test(shell)]);

checks.push(['the old Hub declares itself alive', /window\.__hubAlive\s*=\s*true/.test(payload)]);
checks.push(['the new Hub declares itself alive', /window\.__hubAlive\s*=\s*true/.test(next)]);

// It has to be set on the path that runs, not somewhere plausible. In the old
// Hub that is hubInit, after the member row comes back and before the ICA gate,
// so an agent held at the gate is still alive.
{
  const i = payload.indexOf('async function hubInit()');
  const j = payload.indexOf('__hubAlive=true');
  const k = payload.indexOf('hubSignGateInit');
  checks.push(['the old Hub sets it inside hubInit', i >= 0 && j > i && j - i < 4000]);
  checks.push(['and before the ICA gate, so a gated agent is not reported dead', j < k]);
}
// In the new Hub that is hubShowApp, which is what unhides #app.
{
  const i = next.indexOf('function hubShowApp()');
  const j = next.indexOf('__hubAlive=true');
  checks.push(['the new Hub sets it inside hubShowApp', i >= 0 && j > i && j - i < 800]);
}

// The two defects found alongside it. Both real, neither the cause.
checks.push(['no undeclared barBtns survives', !/barBtns/.test(payload)]);
checks.push(['the announcement reads query filters on a column that exists',
  !/realty_announcement_reads'\)[^;]*\.eq\('agent_id'/.test(payload)]);
checks.push(['and it filters on user_id',
  /realty_announcement_reads'\)[^;]*\.eq\('user_id'/.test(payload)]);
// The carousel loop has to bind the collection that was actually queried.
checks.push(['the carousel binds the bars it queried',
  /var bars=list\.querySelectorAll\('\.s-bar'\)/.test(payload) && /bars\.forEach\(function\(b\)\{/.test(payload)]);

let bad = 0;
for (const [n, ok] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) bad++; }
console.log(bad ? '\nFAIL' : '\nPASS');
process.exit(bad ? 1 : 0);
