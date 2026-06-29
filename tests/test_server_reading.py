import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import normalize_tts_pronunciation, split_multilingual_tts_segments, transform_to_reading_script


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
