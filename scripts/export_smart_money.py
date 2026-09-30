#!/usr/bin/env python3
"""Export the existing 13F workbench DATA as JSON, without executing JavaScript.

Usage:
  python3 export_smart_money.py /path/to/index.html --out /path/to/smart-money.json
  python3 export_smart_money.py /path/to/index.html > smart-money.json

The input is read only. No network requests or SEC refreshes are performed.
The exported snapshot preserves the original fields and all original data limits.
To refresh first, run the existing update_13f.py separately with its declared SEC
contact information, then export the resulting HTML or upload that HTML directly.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import sys
import tempfile
from typing import Any


START = "/*__13F_DATA_START__*/"
END = "/*__13F_DATA_END__*/"
MAX_BYTES = 128 * 1024 * 1024


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key!r}")
        result[key] = value
    return result


def reject_constant(value: str) -> None:
    raise ValueError(f"Non-finite JSON number: {value}")


def check_finite(value: Any) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("Non-finite JSON number")
    if isinstance(value, dict):
        for child in value.values():
            check_finite(child)
    elif isinstance(value, list):
        for child in value:
            check_finite(child)


def extract_snapshot(text: str) -> dict[str, Any]:
    """Accept original marked HTML or its JSON export; never evaluate code."""
    stripped = text.lstrip("\ufeff \t\r\n")
    if stripped.startswith("{"):
        payload = stripped
    else:
        if text.count(START) != 1 or text.count(END) != 1:
            raise ValueError("Expected exactly one pair of 13F DATA markers")
        begin = text.index(START) + len(START)
        finish = text.index(END)
        if finish <= begin:
            raise ValueError("Invalid 13F DATA marker order")
        payload = text[begin:finish].strip()
    data = json.loads(payload, object_pairs_hook=unique_object,
                      parse_constant=reject_constant)
    if not isinstance(data, dict) or not isinstance(data.get("funds"), dict):
        raise ValueError("Expected a snapshot object containing a funds object")
    for key, fund in data["funds"].items():
        if not isinstance(fund, dict) or not isinstance(fund.get("quarters"), list):
            raise ValueError(f"Invalid institution structure: {key}")
        for quarter in fund["quarters"]:
            if not isinstance(quarter, dict) or not isinstance(quarter.get("holdings"), list):
                raise ValueError(f"Invalid quarterly holdings structure: {key}")
            if not all(isinstance(row, dict) for row in quarter["holdings"]):
                raise ValueError(f"Invalid holding row: {key}")
    check_finite(data)
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path, help="Existing workbench HTML or JSON")
    parser.add_argument("--out", type=Path, help="JSON output; default is stdout")
    args = parser.parse_args()
    temporary: Path | None = None
    try:
        source = args.input.resolve()
        if source.stat().st_size > MAX_BYTES:
            raise ValueError("Input exceeds the 128 MiB export limit")
        if args.out and args.out.resolve() == source:
            raise ValueError("Output must not overwrite the source file")
        data = extract_snapshot(source.read_text(encoding="utf-8-sig"))
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"),
                             allow_nan=False) + "\n"
        if args.out:
            target = args.out.resolve()
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
                    dir=target.parent, prefix=".smart-money-export-",
                    suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(payload)
            os.replace(temporary, target)
            temporary = None
        else:
            sys.stdout.write(payload)
        funds = data["funds"]
        quarters = [q for f in funds.values() for q in f["quarters"]]
        count = sum(len(q["holdings"]) for q in quarters)
        print(f"Exported {len(funds)} institutions, {len(quarters)} quarters, "
              f"{count:,} embedded holdings; snapshot {data.get('generatedAt', 'unknown')}. "
              "No refresh performed.", file=sys.stderr)
        return 0
    except (OSError, UnicodeError, ValueError, TypeError) as exc:
        print(f"Export failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
