import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustedAdapterRegistry } from './trusted-adapter-registry.mjs';

test('trusted adapter registry resolves only explicitly registered server factories', () => {
  const verifier = () => ({ ok: true });
  const registry = createTrustedAdapterRegistry([{
    kind: 'evidence',
    id: 'strict-review-evidence-v1',
    description: 'Revalidates strict review evidence.',
    create: ({ expected }) => (candidate) => candidate === expected && verifier(),
  }]);

  assert.deepEqual(registry.describe(), [{
    kind: 'evidence',
    id: 'strict-review-evidence-v1',
    description: 'Revalidates strict review evidence.',
  }]);
  assert.equal(registry.require('evidence', 'strict-review-evidence-v1', { expected: 'bound' })('bound').ok, true);
  assert.throws(
    () => registry.require('evidence', 'client-supplied-adapter', {}),
    (error) => error.code === 'TRUSTED_ADAPTER_UNAVAILABLE',
  );
});

test('trusted adapter registry rejects duplicate identities and non-function factories', () => {
  const entry = {
    kind: 'authority', id: 'repository-source-v1', description: 'Repository source.', create: () => () => ({ ok: true }),
  };
  assert.throws(
    () => createTrustedAdapterRegistry([entry, entry]),
    (error) => error.code === 'TRUSTED_ADAPTER_DUPLICATE',
  );
  assert.throws(
    () => createTrustedAdapterRegistry([{ ...entry, create: 'caller-value' }]),
    (error) => error.code === 'TRUSTED_ADAPTER_FACTORY',
  );
});
