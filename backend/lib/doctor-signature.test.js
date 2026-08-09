import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeDoctorSignatureMimeType, parseDoctorSignatureDataUrl } from './doctor-signature.js';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('accepts a validated PNG doctor signature', () => {
  const signature = parseDoctorSignatureDataUrl(ONE_PIXEL_PNG);
  assert.equal(signature.mimeType, 'image/png');
  assert.equal(signature.extension, 'png');
  assert.ok(signature.buffer.length > 8);
});

test('rejects executable data disguised as an image', () => {
  const disguised = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
  assert.throws(() => parseDoctorSignatureDataUrl(disguised), /could not be validated/i);
});

test('infers the stored signature mime type from its immutable path', () => {
  assert.equal(normalizeDoctorSignatureMimeType('', 'doctors/abc/signature.png'), 'image/png');
  assert.equal(normalizeDoctorSignatureMimeType('', 'doctors/abc/signature.jpg'), 'image/jpeg');
});
