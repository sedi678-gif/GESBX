const BLOCKING_LIKELIHOODS = new Set(['LIKELY', 'VERY_LIKELY']);

function isUnsafeImage(annotation) {
  return ['adult', 'racy', 'violence'].some((key) => BLOCKING_LIKELIHOODS.has(annotation?.[key]));
}

function isUnsafeVideo(result) {
  return (result.annotationResults?.[0]?.explicitAnnotation?.frames || [])
    .some((frame) => BLOCKING_LIKELIHOODS.has(frame.pornographyLikelihood));
}

module.exports = { isUnsafeImage, isUnsafeVideo };
