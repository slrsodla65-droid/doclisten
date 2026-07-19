import {
  ADMOB_LIVE_BANNER_ID,
  ADMOB_TEST_BANNER_ID,
  ADMOB_USE_TEST_ADS,
} from './admobConfig.mjs?v=1';
import {
  isPrivacyOptionsRequired,
  normalizeBannerHeight,
  resolveConsentInfo,
  selectBannerAdId,
} from './admobCore.mjs?v=1';

let initializationPromise = null;
let privacyButtonBound = false;

function isNativeContainer() {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.getPlatform?.() === 'android' ||
    window.Capacitor?.getPlatform?.() === 'ios'
  );
}

function getAdMobPlugin() {
  if (!window.Capacitor?.isPluginAvailable?.('AdMob')) return null;
  return window.Capacitor?.Plugins?.AdMob || null;
}

function applyBannerHeight(info) {
  const height = normalizeBannerHeight(info);
  document.documentElement.style.setProperty('--admob-banner-height', `${height}px`);
  document.documentElement.classList.toggle('admob-banner-visible', height > 0);
}

function bindPrivacyOptions(plugin, consentInfo) {
  const button = document.querySelector('#adPrivacyOptionsBtn');
  if (!button) return;
  const required = isPrivacyOptionsRequired(consentInfo);
  button.classList.toggle('hidden', !required);
  if (!required || privacyButtonBound) return;
  privacyButtonBound = true;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await plugin.showPrivacyOptionsForm();
    } catch (error) {
      console.debug('Ad privacy options unavailable', error);
    } finally {
      button.disabled = false;
    }
  });
}

async function startAdMob() {
  if (!isNativeContainer()) return { status: 'web' };
  const plugin = getAdMobPlugin();
  if (!plugin) return { status: 'plugin-unavailable' };

  await Promise.all([
    plugin.addListener('bannerAdSizeChanged', applyBannerHeight),
    plugin.addListener('bannerAdFailedToLoad', () => applyBannerHeight({ height: 0 })),
  ]);

  // The Capacitor plugin documents initialize -> UMP consent -> ad request order.
  await plugin.initialize({
    initializeForTesting: ADMOB_USE_TEST_ADS,
    maxAdContentRating: 'General',
  });

  let consentInfo;
  try {
    consentInfo = await resolveConsentInfo(plugin);
  } catch (error) {
    console.debug('Ad consent unavailable; ads remain disabled', error);
    return { status: 'consent-error' };
  }
  bindPrivacyOptions(plugin, consentInfo);
  if (!consentInfo.canRequestAds) return { status: 'consent-required' };

  const adId = selectBannerAdId({
    useTestAds: ADMOB_USE_TEST_ADS,
    testBannerId: ADMOB_TEST_BANNER_ID,
    liveBannerId: ADMOB_LIVE_BANNER_ID,
  });
  await plugin.showBanner({
    adId,
    adSize: 'ADAPTIVE_BANNER',
    position: 'BOTTOM_CENTER',
    margin: 0,
    isTesting: ADMOB_USE_TEST_ADS,
  });
  return { status: 'requested', testing: ADMOB_USE_TEST_ADS };
}

export function initializeAdMob() {
  if (!initializationPromise) initializationPromise = startAdMob();
  return initializationPromise;
}
