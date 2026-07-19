import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivacyOptionsRequired,
  normalizeBannerHeight,
  resolveConsentInfo,
  selectBannerAdId,
} from '../src/admobCore.mjs';

const testId = 'ca-app-pub-3940256099942544/6300978111';
const liveId = 'ca-app-pub-1234567890123456/1234567890';

test('test mode always selects the Google sample banner ID', () => {
  assert.equal(selectBannerAdId({ useTestAds: true, testBannerId: testId, liveBannerId: liveId }), testId);
});

test('live mode selects the configured production banner ID', () => {
  assert.equal(selectBannerAdId({ useTestAds: false, testBannerId: testId, liveBannerId: liveId }), liveId);
});

test('invalid banner configuration fails closed', () => {
  assert.throws(() => selectBannerAdId({ useTestAds: false, testBannerId: testId, liveBannerId: '' }));
});

test('consent form is shown only when ads are blocked and a form is available', async () => {
  let formCalls = 0;
  const result = await resolveConsentInfo({
    requestConsentInfo: async () => ({ canRequestAds: false, isConsentFormAvailable: true }),
    showConsentForm: async () => {
      formCalls += 1;
      return { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
    },
  });
  assert.equal(formCalls, 1);
  assert.equal(result.canRequestAds, true);
});

test('existing consent skips the consent form', async () => {
  let formCalls = 0;
  const result = await resolveConsentInfo({
    requestConsentInfo: async () => ({ canRequestAds: true, isConsentFormAvailable: true }),
    showConsentForm: async () => { formCalls += 1; },
  });
  assert.equal(formCalls, 0);
  assert.equal(result.canRequestAds, true);
});

test('privacy options and banner height are normalized', () => {
  assert.equal(isPrivacyOptionsRequired({ privacyOptionsRequirementStatus: 'REQUIRED' }), true);
  assert.equal(isPrivacyOptionsRequired({ privacyOptionsRequirementStatus: 'NOT_REQUIRED' }), false);
  assert.equal(normalizeBannerHeight({ height: 50.4 }), 50);
  assert.equal(normalizeBannerHeight({ height: -1 }), 0);
  assert.equal(normalizeBannerHeight({ height: 999 }), 250);
});
