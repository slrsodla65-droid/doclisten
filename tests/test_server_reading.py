import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import build_oauth_authorize_url, concat_mp3, delete_user_account, extract_oauth_email, find_user_by_token, get_admin_metrics, get_health_status, get_or_create_user, get_public_config, get_user_status, is_admin_email, make_silence_mp3, mark_user_paid_with_code, normalize_tts_pronunciation, oauth_provider_config, create_usage_snapshot, record_beta_event, record_listen_usage, revoke_user_token, safe_public_url, split_for_human_reading, split_multilingual_tts_segments, transform_to_reading_script


def test_transform_to_reading_script_turns_plan_sentence_into_spoken_explanation():
    source = "가격 정책 및 회원 플랜 설계는 무료 체험, 베이직, 프로, 엔터프라이즈 플랜으로 구성한다."

    spoken = transform_to_reading_script(source)

    assert "가격 정책과 회원 플랜은" in spoken
    assert "크게 네 가지로 나눌 수 있습니다." in spoken
    assert "먼저 무료 체험." in spoken
    assert "그다음 베이직." in spoken
    assert "그리고 프로." in spoken
    assert "마지막으로 엔터프라이즈 플랜입니다." in spoken


def test_transform_to_reading_script_adds_rhythm_markers_for_long_business_sentences():
    source = "단계별 사업확장 전략은 초기 고객 확보와 유료 전환율 검증 이후 본격적으로 시장을 넓히는 방식입니다."

    spoken = transform_to_reading_script(source)

    assert "단계별 사업 확장 전략은," in spoken
    assert "먼저 초기 고객 확보와" in spoken
    assert "그다음 유료 전환율 검증 이후" in spoken
    assert "본격적으로 시장을 넓히는 방식입니다." in spoken


def test_transform_to_reading_script_turns_generic_feature_lists_into_spoken_enumeration():
    source = "핵심 기능은 PDF 업로드, 문단 선택, 이어듣기, 사용량 제한이다."

    spoken = transform_to_reading_script(source)

    assert "핵심 기능은, 크게 네 가지입니다." in spoken
    assert "먼저 PDF 업로드." in spoken
    assert "그다음 문단 선택." in spoken
    assert "그리고 이어듣기." in spoken
    assert "마지막으로 사용량 제한입니다." in spoken
    assert ".," not in spoken


def test_split_for_human_reading_separates_sentence_and_clause_pauses():
    chunks = split_for_human_reading(
        "핵심 기능은, 크게 네 가지입니다. 먼저 PDF 업로드. 그다음 문단 선택. 그리고 이어듣기. 마지막으로 사용량 제한입니다."
    )

    assert chunks == [
        "핵심 기능은, 크게 네 가지입니다.",
        "먼저 PDF 업로드.",
        "그다음 문단 선택.",
        "그리고 이어듣기.",
        "마지막으로 사용량 제한입니다.",
    ]


def test_embedded_silence_and_concat_work_without_system_ffmpeg(tmp_path, monkeypatch):
    monkeypatch.setattr("server.shutil.which", lambda _: None)
    first = tmp_path / "first.mp3"
    silence = tmp_path / "silence.mp3"
    out = tmp_path / "out.mp3"
    first.write_bytes(b"ID3first")

    make_silence_mp3(silence, 520)
    concat_mp3([first, silence], out)

    assert silence.read_bytes().startswith(b"ID3")
    assert out.read_bytes().startswith(b"ID3firstID3")


def test_normalize_tts_pronunciation_applies_reading_script_before_pronunciation_fix():
    spoken = normalize_tts_pronunciation("단계별 사업확장 전략은 초기 고객 확보와 유료 전환율 검증 이후 본격적으로 시장을 넓히는 방식입니다.")

    assert "단계별 사업 확장 전략은," in spoken
    assert "먼저 초기 고객 확보와" in spoken
    assert "그다음 유료 전환율 검증 이후" in spoken


def test_split_multilingual_tts_segments_keeps_english_terms_in_english_segments():
    segments = split_multilingual_tts_segments("NoahAI는 PDF Reader와 SaaS BM을 제공합니다.")

    assert segments == [
        ("en", "NoahAI"),
        ("ko", "는"),
        ("en", "PDF Reader"),
        ("ko", "와"),
        ("en", "SaaS BM"),
        ("ko", "을 제공합니다."),
    ]


def test_split_multilingual_tts_segments_treats_full_english_sentence_as_english():
    segments = split_multilingual_tts_segments("This service reads PDF documents naturally.")

    assert segments == [("en", "This service reads PDF documents naturally.")]


def test_safe_public_url_accepts_https_only():
    assert safe_public_url("https://pay.example.com/doclisten") == "https://pay.example.com/doclisten"
    assert safe_public_url("http://pay.example.com/doclisten") == ""
    assert safe_public_url("javascript:alert(1)") == ""


def test_public_config_reads_payment_environment(monkeypatch):
    monkeypatch.setenv("DOC_LISTEN_PAYMENT_URL", "https://pay.example.com/beta")
    monkeypatch.setenv("DOC_LISTEN_PAYMENT_PROVIDER", "kakao-openchat")
    monkeypatch.setenv("DOC_LISTEN_BETA_PRICE_LABEL", "월 4,900원")

    config = get_public_config()

    assert config["paymentProvider"] == "kakao-openchat"
    assert config["paymentUrl"] == "https://pay.example.com/beta"
    assert config["betaPriceLabel"] == "월 4,900원"
    assert config["freeDailyLimit"] == 20


def test_public_config_defaults_to_kakao_openchat(monkeypatch):
    monkeypatch.delenv("DOC_LISTEN_PAYMENT_URL", raising=False)
    monkeypatch.delenv("DOC_LISTEN_PAYMENT_PROVIDER", raising=False)

    config = get_public_config()

    assert config["paymentProvider"] == "kakao-openchat"
    assert config["paymentUrl"] == "https://open.kakao.com/o/sKDe1RBi"


def test_server_usage_tracks_free_limit_by_user(tmp_path):
    store = tmp_path / "users.json"
    user = get_or_create_user("user@example.com", store)

    snapshot = create_usage_snapshot(user, "2026-06-30", limit=2)
    assert snapshot["plan"] == "free"
    assert snapshot["used"] == 0
    assert snapshot["remaining"] == 2
    assert snapshot["reached"] is False

    first = record_listen_usage(user["token"], store, "2026-06-30", limit=2)
    second = record_listen_usage(user["token"], store, "2026-06-30", limit=2)
    blocked = record_listen_usage(user["token"], store, "2026-06-30", limit=2)

    assert first["allowed"] is True
    assert second["allowed"] is True
    assert blocked["allowed"] is False
    assert blocked["usage"]["used"] == 2


def test_paid_user_bypasses_free_limit_after_beta_code(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODE", "PAID-1234")
    user = get_or_create_user("paid@example.com", store)

    activation = mark_user_paid_with_code(user["token"], "PAID-1234", store)
    assert activation["ok"] is True
    assert activation["user"]["plan"] == "beta-pro"

    for _ in range(5):
        result = record_listen_usage(user["token"], store, "2026-06-30", limit=1)
        assert result["allowed"] is True
        assert result["usage"]["plan"] == "beta-pro"


def test_admin_email_gets_unlimited_admin_plan_only_after_google_oauth(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.setenv("DOC_LISTEN_ADMIN_EMAILS", "owner@example.com, other@example.com")

    manual_user = get_or_create_user("Owner@Example.com", store)
    user = get_or_create_user("Owner@Example.com", store, auth_provider="google")

    assert is_admin_email("owner@example.com") is True
    assert manual_user["plan"] == "free"
    assert user["token"] == manual_user["token"]
    assert user["plan"] == "admin"
    for _ in range(5):
        result = record_listen_usage(user["token"], store, "2026-06-30", limit=1)
        assert result["allowed"] is True
        assert result["usage"]["plan"] == "admin"


def test_existing_free_user_is_promoted_when_google_email_becomes_admin(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    user = get_or_create_user("owner@example.com", store)
    assert user["plan"] == "free"

    monkeypatch.setenv("DOC_LISTEN_ADMIN_EMAILS", "owner@example.com")
    still_manual = get_or_create_user("owner@example.com", store)
    promoted = get_or_create_user("owner@example.com", store, auth_provider="google")

    assert still_manual["plan"] == "free"
    assert promoted["token"] == user["token"]
    assert promoted["plan"] == "admin"


def test_existing_google_user_becomes_unlimited_admin_without_relogin(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    user = get_or_create_user("owner@example.com", store, auth_provider="google")
    assert user["plan"] == "free"
    record_listen_usage(user["token"], store, "2026-06-30", limit=1)
    blocked_before = record_listen_usage(user["token"], store, "2026-06-30", limit=1)
    assert blocked_before["allowed"] is False

    monkeypatch.setenv("DOC_LISTEN_ADMIN_EMAILS", "owner@example.com")
    status = get_user_status(user["token"], store)
    after_admin = record_listen_usage(user["token"], store, "2026-06-30", limit=1)

    assert status["user"]["plan"] == "admin"
    assert status["usage"]["remaining"] is None
    assert after_admin["allowed"] is True
    assert after_admin["usage"]["plan"] == "admin"


def test_requested_owner_google_email_is_unlimited_admin(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.delenv("DOC_LISTEN_ADMIN_EMAILS", raising=False)

    user = get_or_create_user("gkrwodl3@gmail.com", store, auth_provider="google")

    assert user["plan"] == "admin"
    for _ in range(5):
        result = record_listen_usage(user["token"], store, "2026-07-01", limit=1)
        assert result["allowed"] is True
        assert result["usage"]["plan"] == "admin"
        assert result["usage"]["remaining"] is None


def test_wrong_beta_code_is_rejected(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODE", "PAID-1234")
    user = get_or_create_user("wrong@example.com", store)

    activation = mark_user_paid_with_code(user["token"], "BAD", store)

    assert activation["ok"] is False
    assert activation["reason"] == "invalid-code"


def test_beta_access_codes_can_be_issued_once_for_kakao_manual_payment(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODES", "PAID-1111, PAID-2222")
    first_user = get_or_create_user("first@example.com", store, auth_provider="google")
    second_user = get_or_create_user("second@example.com", store, auth_provider="google")

    first_activation = mark_user_paid_with_code(first_user["token"], "PAID-1111", store)
    reuse_by_same_user = mark_user_paid_with_code(first_user["token"], "PAID-1111", store)
    second_code_for_same_user = mark_user_paid_with_code(first_user["token"], "PAID-2222", store)
    reuse_by_other_user = mark_user_paid_with_code(second_user["token"], "PAID-1111", store)

    assert first_activation["ok"] is True
    assert reuse_by_same_user["ok"] is True
    assert second_code_for_same_user["ok"] is False
    assert second_code_for_same_user["reason"] == "code-already-used"
    assert reuse_by_other_user["ok"] is False
    assert reuse_by_other_user["reason"] == "code-already-used"


def test_used_beta_code_stays_blocked_after_account_deletion(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODES", "PAID-1111")
    first_user = get_or_create_user("first-delete@example.com", store, auth_provider="google")
    second_user = get_or_create_user("second-delete@example.com", store, auth_provider="google")

    first_activation = mark_user_paid_with_code(first_user["token"], "PAID-1111", store)
    delete_user_account(first_user["token"], store)
    reuse_after_delete = mark_user_paid_with_code(second_user["token"], "PAID-1111", store)

    assert first_activation["ok"] is True
    assert reuse_after_delete["ok"] is False
    assert reuse_after_delete["reason"] == "code-already-used"


def test_sqlite_beta_access_code_stays_one_time_after_delete(tmp_path, monkeypatch):
    store = tmp_path / "users.sqlite3"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODES", "PAID-1111")
    first_user = get_or_create_user("first-sqlite@example.com", store, auth_provider="google")
    second_user = get_or_create_user("second-sqlite@example.com", store, auth_provider="google")

    first_activation = mark_user_paid_with_code(first_user["token"], "PAID-1111", store)
    delete_user_account(first_user["token"], store)
    reuse_after_delete = mark_user_paid_with_code(second_user["token"], "PAID-1111", store)

    assert first_activation["ok"] is True
    assert reuse_after_delete["ok"] is False
    assert reuse_after_delete["reason"] == "code-already-used"


def test_logout_revokes_token_without_deleting_account(tmp_path, monkeypatch):
    store = tmp_path / "users.json"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODE", "PAID-1234")
    user = get_or_create_user("logout@example.com", store, auth_provider="google")
    record_listen_usage(user["token"], store, "2026-06-30", limit=20)
    mark_user_paid_with_code(user["token"], "PAID-1234", store)

    revoked = revoke_user_token(user["token"], store)
    renewed = get_or_create_user("logout@example.com", store, auth_provider="google")
    _, renewed_user = find_user_by_token(renewed["token"], store)
    usage = create_usage_snapshot(renewed_user, "2026-06-30", limit=20)

    assert revoked["ok"] is True
    assert get_user_status(user["token"], store)["ok"] is False
    assert renewed["token"] != user["token"]
    assert renewed["plan"] == "beta-pro"
    assert usage["used"] == 1


def test_delete_account_removes_user_and_usage(tmp_path):
    store = tmp_path / "users.json"
    user = get_or_create_user("delete@example.com", store, auth_provider="google")
    record_listen_usage(user["token"], store, "2026-06-30", limit=20)

    deleted = delete_user_account(user["token"], store)

    assert deleted["ok"] is True
    assert deleted["deleted"] is True
    assert "email" not in deleted
    assert get_user_status(user["token"], store)["ok"] is False


def test_free_limit_is_not_reset_by_logout_and_google_relogin(tmp_path):
    store = tmp_path / "users.json"
    user = get_or_create_user("limit@example.com", store, auth_provider="google")
    first = record_listen_usage(user["token"], store, "2026-06-30", limit=1)
    blocked_before = record_listen_usage(user["token"], store, "2026-06-30", limit=1)

    revoke_user_token(user["token"], store)
    renewed = get_or_create_user("limit@example.com", store, auth_provider="google")
    blocked_after = record_listen_usage(renewed["token"], store, "2026-06-30", limit=1)

    assert first["allowed"] is True
    assert blocked_before["allowed"] is False
    assert blocked_after["allowed"] is False
    assert blocked_after["usage"]["used"] == 1


def test_sqlite_logout_preserves_plan_and_usage(tmp_path, monkeypatch):
    store = tmp_path / "users.sqlite3"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODE", "PAID-1234")
    user = get_or_create_user("sqlite-logout@example.com", store, auth_provider="google")
    record_listen_usage(user["token"], store, "2026-06-30", limit=20)
    mark_user_paid_with_code(user["token"], "PAID-1234", store)

    revoke_user_token(user["token"], store)
    renewed = get_or_create_user("sqlite-logout@example.com", store, auth_provider="google")
    _, renewed_user = find_user_by_token(renewed["token"], store)
    usage = create_usage_snapshot(renewed_user, "2026-06-30", limit=20)

    assert renewed["token"] != user["token"]
    assert renewed["plan"] == "beta-pro"
    assert usage["used"] == 1


def test_sqlite_user_store_persists_usage_and_beta_plan(tmp_path, monkeypatch):
    store = tmp_path / "users.sqlite3"
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODE", "PAID-1234")

    user = get_or_create_user("paid@example.com", store, auth_provider="google")
    first = record_listen_usage(user["token"], store, "2026-06-30", limit=2)
    activation = mark_user_paid_with_code(user["token"], "PAID-1234", store)
    status = get_or_create_user("paid@example.com", store, auth_provider="google")
    after = record_listen_usage(user["token"], store, "2026-06-30", limit=1)

    assert store.exists()
    assert store.read_bytes().startswith(b"SQLite format 3")
    assert first["allowed"] is True
    assert activation["ok"] is True
    assert activation["user"]["plan"] == "beta-pro"
    assert status["plan"] == "beta-pro"
    assert after["allowed"] is True
    assert after["usage"]["used"] == 2


def test_sqlite_user_store_admin_promotion_requires_google_oauth(tmp_path, monkeypatch):
    store = tmp_path / "users.sqlite3"
    monkeypatch.setenv("DOC_LISTEN_ADMIN_EMAILS", "owner@example.com")

    manual = get_or_create_user("owner@example.com", store)
    promoted = get_or_create_user("owner@example.com", store, auth_provider="google")

    assert manual["plan"] == "free"
    assert promoted["token"] == manual["token"]
    assert promoted["plan"] == "admin"


def test_health_status_exposes_safe_operational_readiness(tmp_path, monkeypatch):
    monkeypatch.setenv("DOC_LISTEN_USER_STORE_PATH", str(tmp_path / "users.sqlite3"))
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("DOC_LISTEN_BETA_ACCESS_CODE", "PAID-1234")

    status = get_health_status()

    assert status["ok"] is True
    assert status["storage"] == "sqlite"
    assert status["googleOAuthConfigured"] is True
    assert status["betaActivationConfigured"] is True
    assert status["adminEmailConfigured"] is True
    assert "secret" not in str(status).lower()


def test_beta_event_metrics_count_launch_funnel_without_external_analytics(tmp_path):
    metrics = tmp_path / "metrics.json"

    view = record_beta_event("page_view", path=metrics, day="2026-07-01")
    upload = record_beta_event("pdf_upload", path=metrics, day="2026-07-01")
    bad = record_beta_event("raw-email", path=metrics, day="2026-07-01")

    data = metrics.read_text(encoding="utf-8")
    assert view["ok"] is True
    assert upload["ok"] is True
    assert bad["ok"] is False
    assert '"page_view": 1' in data
    assert '"pdf_upload": 1' in data
    assert "raw-email" not in data


def test_admin_can_read_beta_metrics_but_free_user_cannot(tmp_path, monkeypatch):
    user_store = tmp_path / "users.json"
    metrics = tmp_path / "metrics.json"
    monkeypatch.setenv("DOC_LISTEN_ADMIN_EMAILS", "owner@example.com")
    admin = get_or_create_user("owner@example.com", user_store, auth_provider="google")
    free = get_or_create_user("free@example.com", user_store, auth_provider="google")
    record_beta_event("beta_cta_click", path=metrics, day="2026-07-01")

    admin_view = get_admin_metrics(admin["token"], metrics, user_store)
    free_view = get_admin_metrics(free["token"], metrics, user_store)

    assert admin_view["ok"] is True
    assert admin_view["metrics"]["days"]["2026-07-01"]["events"]["beta_cta_click"] == 1
    assert free_view["ok"] is False
    assert free_view["reason"] == "admin-required"


def test_oauth_provider_config_uses_environment(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")

    config = oauth_provider_config("google")

    assert config["clientId"] == "google-id"
    assert config["clientSecret"] == "google-secret"
    assert "accounts.google.com" in config["authorizeUrl"]


def test_build_google_oauth_authorize_url_contains_redirect_and_state(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")

    url = build_oauth_authorize_url("google", "https://doclisten.app/api/oauth/callback/google", "state-123")

    assert "accounts.google.com/o/oauth2/v2/auth" in url
    assert "client_id=google-id" in url
    assert "state=state-123" in url
    assert "redirect_uri=https%3A%2F%2Fdoclisten.app%2Fapi%2Foauth%2Fcallback%2Fgoogle" in url


def test_extract_oauth_email_by_provider():
    assert extract_oauth_email("google", {"email": "User@Example.com", "email_verified": True}) == "user@example.com"
    assert extract_oauth_email("google", {"email": "User@Example.com", "email_verified": False}) == ""
    assert extract_oauth_email("google", {"email": "User@Example.com"}) == ""


def test_non_google_oauth_providers_are_disabled(monkeypatch):
    monkeypatch.setenv("KAKAO_REST_API_KEY", "kakao-id")
    monkeypatch.setenv("KAKAO_CLIENT_SECRET", "kakao-secret")
    monkeypatch.setenv("NAVER_CLIENT_ID", "naver-id")
    monkeypatch.setenv("NAVER_CLIENT_SECRET", "naver-secret")

    assert oauth_provider_config("kakao") == {}
    assert oauth_provider_config("naver") == {}
