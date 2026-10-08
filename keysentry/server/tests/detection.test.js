import test from 'node:test';
import assert from 'node:assert/strict';
import { computeShannonEntropy, scanContent } from '../services/detector.js';

test('Shannon entropy matches known distributions', () => {
  assert.equal(computeShannonEntropy(''), 0);
  assert.equal(computeShannonEntropy('aaaa'), 0);
  assert.equal(computeShannonEntropy('aabb'), 1);
  assert.equal(computeShannonEntropy('abcd'), 2);
});

test('Detects and masks high entropy credentials with correct source location', () => {
  const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const findings = scanContent(`// configuration\nconst key = '${secret}';`, 'src/config.js');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].keyType, 'GitHub PAT');
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].filePath, 'src/config.js');
  assert.ok(findings[0].entropy >= 3.8);
  assert.ok(!JSON.stringify(findings).includes(secret));
  assert.equal(scanContent(`'${secret}'`, 'src/config.js', true)[0].rawSecret, secret);
});

test('Rejects low entropy tokens and excluded generated files', () => {
  assert.deepEqual(scanContent('token = "aaaaaaaaaaaaaaaaaaaaaaaa"', 'config.js'), []);
  assert.deepEqual(scanContent('token = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"', 'node_modules/config.js'), []);
});

test('Supports modern prefixed OpenAI keys', () => {
  const secret = 'sk-proj-' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijkl';
  assert.ok(scanContent(`'${secret}'`, 'config.js').some(t => t.keyType === 'OpenAI'));
});
