const BANNER_ID_PATTERN = /^ca-app-pub-\d+\/\d+$/;

export function selectBannerAdId({ useTestAds, testBannerId, liveBannerId }) {
  const selected = useTestAds ? testBannerId : liveBannerId;
  if (!BANNER_ID_PATTERN.test(selected || '')) {
    throw new Error('Invalid AdMob banner ID configuration');
  }
  return selected;
}

export async function resolveConsentInfo(plugin) {
  let consentInfo = await plugin.requestConsentInfo();
  if (!consentInfo?.canRequestAds && consentInfo?.isConsentFormAvailable) {
    consentInfo = await plugin.showConsentForm();
  }
  return consentInfo || { canRequestAds: false, privacyOptionsRequirementStatus: 'UNKNOWN' };
}

export function isPrivacyOptionsRequired(consentInfo) {
  return consentInfo?.privacyOptionsRequirementStatus === 'REQUIRED';
}

export function normalizeBannerHeight(info) {
  const height = Number(info?.height || 0);
  if (!Number.isFinite(height) || height <= 0) return 0;
  return Math.min(250, Math.round(height));
}
