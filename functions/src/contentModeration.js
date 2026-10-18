const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineInt } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const vision = require('@google-cloud/vision');
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence').v1;
const { isUnsafeImage, isUnsafeVideo } = require('./moderationPolicy');

const db = getFirestore();
const visionClient = new vision.ImageAnnotatorClient();
const videoClient = new VideoIntelligenceServiceClient();
const REPORT_THRESHOLD = defineInt('POST_AUTO_HIDE_REPORT_THRESHOLD', { default: 5, min: 2, max: 100 });

async function hideIfReportThresholdReached(postRef) {
  const postSnap = await postRef.get();
  if (!postSnap.exists || postSnap.data().moderationStatus !== 'approved') return;
  const reports = await db.collection('reports').where('targetPostId', '==', postRef.id).get();
  const reporterIds = new Set(reports.docs
    .map((doc) => doc.data())
    .filter((row) => row.type === 'post' && row.status === 'pending' && typeof row.reporterId === 'string')
    .map((row) => row.reporterId));
  const threshold = REPORT_THRESHOLD.value();
  if (reporterIds.size < threshold) return;
  await db.runTransaction(async (tx) => {
    const current = await tx.get(postRef);
    if (current.exists && current.data().moderationStatus === 'approved') {
      tx.update(postRef, {
        moderationStatus: 'hidden_by_reports', autoHiddenAt: Date.now(),
        autoHideReportCount: reporterIds.size, autoHideThreshold: threshold,
      });
    }
  });
}
async function inspectObject(bucketName, filePath, contentType) {
  const gsUri = `gs://${bucketName}/${filePath}`;
  if (contentType?.startsWith('image/')) {
    const [result] = await visionClient.safeSearchDetection(gsUri);
    if (result.error?.message) throw new Error(`Vision SafeSearch: ${result.error.message}`);
    if (!result.safeSearchAnnotation) throw new Error('Vision SafeSearch nəticə qaytarmadı.');
    return { approved: !isUnsafeImage(result.safeSearchAnnotation), provider: 'vision-safe-search' };
  }
  if (contentType?.startsWith('video/')) {
    const [operation] = await videoClient.annotateVideo({ inputUri: gsUri, features: ['EXPLICIT_CONTENT_DETECTION'] });
    const [result] = await operation.promise();
    if (!result.annotationResults?.length) throw new Error('Video Intelligence nəticə qaytarmadı.');
    return { approved: !isUnsafeVideo(result), provider: 'video-intelligence-explicit-content' };
  }
  return { approved: false, provider: 'unsupported-content-type' };
}

const moderateUploadedPost = onObjectFinalized({ retry: true, timeoutSeconds: 540, memory: '1GiB' }, async (event) => {
  const object = event.data;
  const match = String(object.name || '').match(/^posts\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/[^/]+$/);
  if (!match) return;
  const [, ownerId, postId] = match;
  const postRef = db.doc(`posts/${postId}`);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new Error(`Post ${postId} is not ready for moderation yet.`);
  const post = postSnap.data();
  if (post.userId !== ownerId || post.mediaPath !== object.name) return;
  if (post.moderationStatus === 'rejected') {
    await getStorage().bucket(object.bucket).file(object.name).delete({ ignoreNotFound: true });
    return;
  }
  if (post.moderationStatus === 'approved') {
    await hideIfReportThresholdReached(postRef);
    return;
  }
  if (post.moderationStatus !== 'pending') return;

  const verdict = post.moderationVerdict === 'safe'
    ? { approved: true, provider: post.moderationProvider }
    : await inspectObject(object.bucket, object.name, object.contentType);
  if (!verdict.approved) {
    await postRef.update({ moderationStatus: 'rejected', moderationProvider: verdict.provider, moderatedAt: Date.now() });
    await getStorage().bucket(object.bucket).file(object.name).delete({ ignoreNotFound: true });
    return;
  }
  if (post.moderationVerdict !== 'safe') {
    await postRef.update({
      moderationVerdict: 'safe',
      moderationProvider: verdict.provider,
      moderatedAt: Date.now(),
    });
  }
  if (!post.mediaUrl) throw new Error(`Post ${postId} upload URL is not ready for approval yet.`);
  await postRef.update({ moderationStatus: 'approved', moderationProvider: verdict.provider, moderatedAt: Date.now() });
  await hideIfReportThresholdReached(postRef);
});

const autoHideReportedPost = onDocumentCreated('reports/{reportId}', async (event) => {
  const report = event.data?.data();
  if (!report || report.type !== 'post' || typeof report.targetPostId !== 'string') return;
  const postRef = db.doc(`posts/${report.targetPostId}`);
  await hideIfReportThresholdReached(postRef);
});

module.exports = { moderateUploadedPost, autoHideReportedPost };
