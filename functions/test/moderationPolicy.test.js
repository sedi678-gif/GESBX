const test = require('node:test');
const assert = require('node:assert/strict');
const { isUnsafeImage, isUnsafeVideo } = require('../src/moderationPolicy');

test('image SafeSearch blocks likely adult, racy, or violent media', () => {
  assert.equal(isUnsafeImage({ adult: 'LIKELY' }), true);
  assert.equal(isUnsafeImage({ racy: 'VERY_LIKELY' }), true);
  assert.equal(isUnsafeImage({ violence: 'LIKELY' }), true);
  assert.equal(isUnsafeImage({ adult: 'POSSIBLE', racy: 'UNLIKELY', violence: 'UNLIKELY' }), false);
});

test('video explicit-content policy blocks likely pornography frames', () => {
  assert.equal(isUnsafeVideo({ annotationResults: [{ explicitAnnotation: { frames: [{ pornographyLikelihood: 'LIKELY' }] } }] }), true);
  assert.equal(isUnsafeVideo({ annotationResults: [{ explicitAnnotation: { frames: [{ pornographyLikelihood: 'POSSIBLE' }] } }] }), false);
  assert.equal(isUnsafeVideo({ annotationResults: [{ explicitAnnotation: { frames: [] } }] }), false);
});
