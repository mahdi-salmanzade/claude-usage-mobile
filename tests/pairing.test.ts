import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parsePairingPayload, validatePairing } from '../src/lib/api.ts';

const pairing = { host: '127.0.0.1', port: 47600, token: 'test-token' };

describe('pairing validation', () => {
  test('accepts and trims manual connection details', () => {
    assert.deepEqual(validatePairing({ ...pairing, host: ' localhost ', token: ' test-token ' }),
      { ...pairing, host: 'localhost' });
  });

  test('rejects invalid ports before attempting a connection', () => {
    for (const port of [0, -1, 65536, 47600.5, NaN, Infinity]) {
      assert.equal(validatePairing({ ...pairing, port }), null);
      assert.equal(parsePairingPayload(JSON.stringify({ ...pairing, port })), null);
    }
  });

  test('rejects blank values and URLs in the host field', () => {
    for (const host of ['', ' ', 'http://localhost', 'host/path', 'user@host', 'bad host']) {
      assert.equal(validatePairing({ ...pairing, host }), null);
    }
    assert.equal(validatePairing({ ...pairing, token: ' ' }), null);
  });

  test('QR parsing respects the wire version', () => {
    assert.deepEqual(parsePairingPayload(JSON.stringify({ ...pairing, v: 1 })), pairing);
    assert.equal(parsePairingPayload(JSON.stringify({ ...pairing, v: 2 })), null);
    assert.equal(parsePairingPayload('not JSON'), null);
  });
});
