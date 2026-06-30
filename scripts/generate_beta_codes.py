#!/usr/bin/env python3
"""Generate one-time DocListen beta access codes for KakaoTalk manual payment."""
from __future__ import annotations

import argparse
import secrets
import string

ALPHABET = string.ascii_uppercase + string.digits


def generate_code(prefix: str = "DL", length: int = 10) -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(length))
    return f"{prefix}-{body}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate DOC_LISTEN_BETA_ACCESS_CODES values.")
    parser.add_argument("count", type=int, nargs="?", default=10, help="number of codes to generate")
    parser.add_argument("--prefix", default="DL", help="code prefix")
    parser.add_argument("--length", type=int, default=10, help="random body length")
    args = parser.parse_args()

    if args.count < 1:
        raise SystemExit("count must be at least 1")
    if args.length < 6:
        raise SystemExit("length must be at least 6")

    codes = [generate_code(args.prefix, args.length) for _ in range(args.count)]
    print(",".join(codes))


if __name__ == "__main__":
    main()
