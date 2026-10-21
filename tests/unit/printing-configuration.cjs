const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { validatePrinterConfiguration: validate, printerTransportCapability: capability, printerLifecyclePolicy: policy } =
  loadTs('src/lib/printing/configuration.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location' };
const location = { id: 'location', brandId: 'brand' };
const config = { ...scope, id: 'printer', name: 'Pizza ÆØÅ æøå', manufacturer: 'star', model: 'mc-print3',
  transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80 };
const evidence = { ...scope, printerId: 'printer', model: 'mc-print3', variant: 'MCP31CI', firmware: '5.1',
  source: 'self-test', verifiedAt: 1792530000000 };

test('credential-free setup accepts scoped configurations without verified hardware', () => {
  assert.deepEqual(validate({ ...config, name: '  Køkken  ' }, scope, location),
    { ok: true, configuration: { ...config, name: 'Køkken' } });
  for (const state of ['active', 'paused', 'disabled']) {
    for (const paperWidthMm of [58, 80]) {
      assert.equal(validate({ ...config, state, paperWidthMm }, scope, location).ok, true);
    }
  }
  const mqtt = { ...config, transport: 'cloudprnt-mqtt' };
  assert.equal(validate(mqtt, scope, location).ok, true);
  assert.deepEqual(capability(mqtt), { status: 'pending', reason: 'device_verification_required' });
  assert.deepEqual(capability(config), { status: 'pending', reason: 'device_verification_required' });
  assert.equal(validate({ ...config, model: 'mc-print2', paperWidthMm: 58 }, scope, location).ok, true);
});

test('malformed inputs, unknown enums, identifiers, names and incompatible hardware are rejected', () => {
  for (const value of [null, undefined, [], 'printer', 1, {}, { ...config, manufacturer: 'epson' },
    { ...config, model: 'unknown' }, { ...config, transport: 'http' }, { ...config, state: 'deleted' },
    { ...config, paperWidthMm: '80' }, { ...config, paperWidthMm: 79 },
    { ...config, model: 'mc-print2' }, { ...config, model: 'mc-print2', paperWidthMm: 58, transport: 'cloudprnt-mqtt' }]) {
    assert.deepEqual(validate(value, scope, location), { ok: false, code: 'invalid_configuration' });
  }
  for (const key of ['id', 'brandId', 'locationId']) {
    for (const value of ['', '../other', 'a/b', 'a b', 'x'.repeat(129), null, 4]) {
      assert.equal(validate({ ...config, [key]: value }, scope, location).ok, false);
    }
  }
  for (const name of ['', '   ', 'x'.repeat(81), 'x'.repeat(161), 'Pizza\n', '\tPizza', 'A\x1bB', 'A\x85B', null, 4]) {
    assert.equal(validate({ ...config, name }, scope, location).ok, false);
  }
  assert.equal(validate({ ...config, name: 'x'.repeat(80) }, scope, location).ok, true);
});

test('authoritative scope and loaded location must all agree', () => {
  for (const [input, authorized, reference, code] of [
    [{ ...config, brandId: 'other' }, scope, location, 'scope_mismatch'],
    [{ ...config, locationId: 'other' }, scope, location, 'scope_mismatch'],
    [config, scope, { ...location, brandId: 'other' }, 'scope_mismatch'],
    [config, scope, { ...location, id: 'other' }, 'scope_mismatch'],
    [config, { ...scope, brandId: '' }, location, 'invalid_scope'],
    [config, null, location, 'invalid_scope'],
    [config, scope, null, 'invalid_scope'],
  ]) assert.deepEqual(validate(input, authorized, reference), { ok: false, code });
});

test('credentials, capability claims and unknown fields never enter the setup DTO or errors', () => {
  for (const key of ['password', 'credentials', 'token', 'brokerUrl', 'verified', 'capabilities', 'firmware', 'variant']) {
    const result = validate({ ...config, [key]: 'PRIVATE_SENTINEL' }, scope, location);
    assert.deepEqual(result, { ok: false, code: 'invalid_configuration' });
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
  const dto = validate(config, scope, location).configuration;
  assert.deepEqual(Object.keys(dto).sort(), Object.keys(config).sort());
});

test('MQTT compatibility requires scoped verified evidence, exact variant and firmware >=5.1', () => {
  const mqtt = { ...config, transport: 'cloudprnt-mqtt' };
  for (const variant of ['MCP31CBI', 'MCP31CI']) {
    for (const firmware of ['5.1', '5.1.0', '5.10', '6.0']) {
      assert.deepEqual(capability(mqtt, { ...evidence, variant, firmware }), { status: 'verified', reason: 'verified_device' });
    }
  }
  assert.deepEqual(capability(mqtt, { ...evidence, variant: undefined }), { status: 'pending', reason: 'variant_required' });
  assert.deepEqual(capability(mqtt, { ...evidence, variant: 'MCP31L' }), { status: 'unsupported', reason: 'unsupported_variant' });
  for (const firmware of ['4.9', '5.0', '5.0.99']) {
    assert.deepEqual(capability(mqtt, { ...evidence, firmware }), { status: 'unsupported', reason: 'firmware_too_old' });
  }
  for (const key of ['brandId', 'locationId', 'printerId']) {
    assert.deepEqual(capability(mqtt, { ...evidence, [key]: 'other' }), { status: 'pending', reason: 'scope_mismatch' });
  }
  assert.equal(capability(mqtt, { ...evidence, model: 'mc-print2' }).reason, 'scope_mismatch');
  assert.equal(capability({ ...mqtt, model: 'mc-print2', paperWidthMm: 58 }, evidence).status, 'unsupported');
});

test('HTTP needs firmware >=1.2 and invalid verification evidence fails closed', () => {
  for (const model of ['mc-print2', 'mc-print3']) {
    const printer = { ...config, model, paperWidthMm: 58 };
    assert.equal(capability(printer, { ...evidence, model, firmware: '1.2', variant: undefined }).status, 'verified');
    assert.equal(capability(printer, { ...evidence, model, firmware: '1.1.99' }).status, 'unsupported');
  }
  for (const firmware of ['5', '5.1beta', '5.1.0.1', 'v5.1', '5. 1', '', 5.1]) {
    assert.deepEqual(capability(config, { ...evidence, firmware }), { status: 'pending', reason: 'invalid_evidence' });
  }
  for (const value of [null, {}, { ...evidence, source: 'user-claim' }, { ...evidence, verifiedAt: 0 },
    { ...evidence, verifiedAt: Infinity }, { ...evidence, password: 'PRIVATE_SENTINEL' }]) {
    assert.deepEqual(capability(config, value), { status: 'pending', reason: 'invalid_evidence' });
  }
});

test('pause queues, deactivate rejects new jobs, and soft-delete retains history', () => {
  assert.deepEqual(policy('active'), { acceptsNewJobs: true, dispatchesJobs: true, visibleInSetup: true, retainHistory: true, reviewQueueBeforeResume: false });
  assert.deepEqual(policy('paused'), { acceptsNewJobs: true, dispatchesJobs: false, visibleInSetup: true, retainHistory: true, reviewQueueBeforeResume: true });
  assert.deepEqual(policy('disabled'), { acceptsNewJobs: false, dispatchesJobs: false, visibleInSetup: true, retainHistory: true, reviewQueueBeforeResume: true });
  assert.deepEqual(policy('deleted'), { acceptsNewJobs: false, dispatchesJobs: false, visibleInSetup: false, retainHistory: true, reviewQueueBeforeResume: true });
  assert.throws(() => policy('unknown'));
});
