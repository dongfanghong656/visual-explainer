import { TaskProofError } from './core.mjs';

function fail(code, message, details) {
  throw new TaskProofError(code, message, details);
}

function adapterKey(kind, id) {
  return `${kind}:${id}`;
}

export function createTrustedAdapterRegistry(entries) {
  if (!Array.isArray(entries)) fail('TRUSTED_ADAPTER_REGISTRY', 'Trusted adapter entries must be an array.');
  const adapters = new Map();
  const manifest = [];
  for (const entry of entries) {
    const kind = entry?.kind;
    const id = entry?.id;
    if (typeof kind !== 'string' || kind.length === 0 || typeof id !== 'string' || id.length === 0) {
      fail('TRUSTED_ADAPTER_IDENTITY', 'Every trusted adapter requires a non-empty kind and id.');
    }
    if (typeof entry.create !== 'function') {
      fail('TRUSTED_ADAPTER_FACTORY', `Trusted adapter ${adapterKey(kind, id)} must use a server-owned function factory.`);
    }
    const key = adapterKey(kind, id);
    if (adapters.has(key)) fail('TRUSTED_ADAPTER_DUPLICATE', `Duplicate trusted adapter: ${key}.`);
    adapters.set(key, entry.create);
    manifest.push(Object.freeze({
      kind,
      id,
      description: typeof entry.description === 'string' ? entry.description : '',
    }));
  }
  manifest.sort((left, right) => {
    const leftKey = adapterKey(left.kind, left.id);
    const rightKey = adapterKey(right.kind, right.id);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  Object.freeze(manifest);

  return Object.freeze({
    describe() {
      return manifest.map((entry) => ({ ...entry }));
    },
    require(kind, id, context) {
      const key = adapterKey(kind, id);
      const create = adapters.get(key);
      if (!create) fail('TRUSTED_ADAPTER_UNAVAILABLE', `No trusted server adapter is registered for ${key}.`);
      const adapter = create(context);
      if (typeof adapter !== 'function') {
        fail('TRUSTED_ADAPTER_INSTANCE', `Trusted adapter factory ${key} did not return a function.`);
      }
      return adapter;
    },
  });
}
