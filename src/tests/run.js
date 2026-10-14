// Runs every test module and prints the results into tests.html.

import { tests, infoLog } from './harness.js';
import './worldgen.test.js';
import './renames.test.js';
import './save.test.js';
import './storage.test.js';
import './engine.test.js';
import './lineup.test.js';
import './match.test.js';
import './season.test.js';
import './development.test.js';
import './transfers.test.js';
import './news.test.js';
import './continental.test.js';
import './stadium.test.js';
import './loans.test.js';
import './national.test.js';
import './training.test.js';
import './morale.test.js';
import './board.test.js';
import './nationaljob.test.js';
import './career.test.js';
import './records.test.js';
import './club.test.js';
import './realpack.test.js';
import './preseason.test.js';
import './coefficients.test.js';
import './currency.test.js';
import './youthleague.test.js';
import './features27.test.js';
import './features28.test.js';
import './features29.test.js';
import './features30.test.js';
import './features31.test.js';

const out = document.getElementById('results');
const summary = document.getElementById('summary');
let passed = 0;
const failures = [];

for (const t of tests) {
  const row = document.createElement('div');
  const t0 = performance.now();
  try {
    await t.fn();
    passed++;
    row.className = 'pass';
    row.textContent = `PASS  ${t.name}  (${Math.round(performance.now() - t0)} ms)`;
  } catch (e) {
    failures.push(t.name);
    row.className = 'fail';
    row.textContent = `FAIL  ${t.name}: ${e.message}`;
    console.error(t.name, e);
  }
  out.appendChild(row);
}

const info = document.getElementById('info');
info.textContent = infoLog.join('\n');

const text = `${passed}/${tests.length} passed${failures.length ? ' - FAILED: ' + failures.join(', ') : ''}`;
summary.textContent = text;
summary.className = failures.length ? 'fail' : 'pass';
document.title = (failures.length ? 'FAIL ' : 'PASS ') + text;
document.documentElement.dataset.done = '1';
