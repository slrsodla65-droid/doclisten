const statusEl = document.querySelector('#adminStatus');
const dashboardEl = document.querySelector('#metricsDashboard');
const todayEl = document.querySelector('#todayMetrics');
const conversionEl = document.querySelector('#conversionMetrics');
const dailyEl = document.querySelector('#dailyMetrics');

const EVENT_LABELS = {
  page_view: '방문',
  pdf_upload: 'PDF 업로드',
  listen_attempt: '듣기 시도',
  login_click: 'Google 로그인 클릭',
  beta_cta_click: '카카오 신청 클릭',
  beta_code_attempt: '베타 코드 입력 시도',
  contact_view: '문의 페이지 방문',
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function count(events, name) {
  return Number(events?.[name] || 0);
}

function ratio(numerator, denominator) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function metricCard(label, value, hint = '') {
  return `<article class="metric-card"><strong>${label}</strong><span>${value}</span>${hint ? `<p>${hint}</p>` : ''}</article>`;
}

function renderMetrics(metrics) {
  const days = metrics?.days || {};
  const sortedDays = Object.keys(days).sort().reverse();
  const today = days[todayKey()] || sortedDays.map((day) => days[day])[0] || { events: {} };
  const events = today.events || {};

  const views = count(events, 'page_view');
  const uploads = count(events, 'pdf_upload');
  const listens = count(events, 'listen_attempt');
  const ctas = count(events, 'beta_cta_click');
  const codeAttempts = count(events, 'beta_code_attempt');
  const contacts = count(events, 'contact_view');

  todayEl.innerHTML = [
    metricCard('방문', views, '랜딩/앱 진입'),
    metricCard('PDF 업로드', uploads, '실제 사용 의도'),
    metricCard('듣기 시도', listens, '핵심 기능 사용'),
    metricCard('카카오 신청 클릭', ctas, '결제 관심'),
    metricCard('베타 코드 입력', codeAttempts, '전환/입금 이후 흐름'),
    metricCard('문의 페이지 방문', contacts, '신청 상세 확인'),
  ].join('');

  conversionEl.innerHTML = [
    metricCard('방문→업로드', ratio(uploads, views), '첫 체험 전환'),
    metricCard('업로드→듣기', ratio(listens, uploads), '기능 이해도'),
    metricCard('듣기→신청 클릭', ratio(ctas, listens), '유료 관심도'),
    metricCard('신청→코드 입력', ratio(codeAttempts, ctas), '수동 결제/전환 진행도'),
  ].join('');

  dailyEl.innerHTML = sortedDays.slice(0, 14).map((day) => {
    const e = days[day]?.events || {};
    const items = Object.entries(EVENT_LABELS).map(([key, label]) => `<li>${label}: ${count(e, key)}</li>`).join('');
    return `<article class="notice-box"><strong>${day}</strong><ul>${items}</ul></article>`;
  }).join('') || '<p class="muted">아직 기록된 지표가 없습니다.</p>';
}

async function loadAdminMetrics() {
  const token = localStorage.getItem('doclisten-user-token') || '';
  if (!token) {
    statusEl.innerHTML = '관리자 로그인이 필요합니다. <a href="/api/oauth/start?provider=google">Google로 로그인</a>한 뒤 다시 열어주세요.';
    return;
  }
  try {
    const response = await fetch('/api/admin/metrics', {
      headers: { 'X-DocListen-Token': token },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      statusEl.textContent = payload.reason === 'admin-required'
        ? '관리자 계정에서만 볼 수 있습니다. gkrwodl3@gmail.com Google 계정으로 로그인해주세요.'
        : '관리자 지표를 불러오지 못했습니다. 다시 로그인해주세요.';
      return;
    }
    statusEl.textContent = '관리자 확인 완료. 아래 지표로 이번 주 유료 베타 전환을 판단하세요.';
    dashboardEl.classList.remove('hidden');
    renderMetrics(payload.metrics);
  } catch (error) {
    console.debug('Admin metrics unavailable', error);
    statusEl.textContent = '지표를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
  }
}

void loadAdminMetrics();
