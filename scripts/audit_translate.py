import argparse
import json
import os
import time
from typing import Dict, Iterable, List, Tuple

import pandas as pd
from deep_translator import GoogleTranslator


def load_cache(path: str) -> Dict[str, str]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_cache(path: str, cache: Dict[str, str]) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    os.replace(tmp, path)


def batched(items: List[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def translate_batch(
    translator: GoogleTranslator,
    batch: List[str],
    retry: int,
    sleep_s: float,
    error_log: str | None,
) -> List[str]:
    last_err = None
    for _ in range(retry):
        try:
            return translator.translate_batch(batch)
        except Exception as exc:  # noqa: BLE001 - keep running on translator hiccups
            last_err = exc
            time.sleep(sleep_s)

    # Fallback to per-item translation so one bad entry does not block the batch.
    results = []
    for text in batch:
        translated = ""
        for _ in range(retry):
            try:
                translated = translator.translate(text)
                break
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                time.sleep(sleep_s)
        if translated == "" and error_log:
            with open(error_log, "a", encoding="utf-8") as f:
                f.write(text + "\n")
        results.append(translated)
    if last_err is not None:
        time.sleep(sleep_s)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--batch-size", type=int, default=30)
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--retry", type=int, default=3)
    parser.add_argument("--error-log", default="d:\\edictor\\translation_errors.txt")
    args = parser.parse_args()

    df = pd.read_excel(args.input)
    if "英义" not in df.columns or "汉义" not in df.columns:
        raise ValueError("Missing required columns: 英义, 汉义")

    eng_col = "英义"
    han_col = "汉义"

    cache = load_cache(args.cache)
    eng_key = df[eng_col].apply(lambda x: str(x) if pd.notna(x) else None)
    uniques = [v for v in eng_key.dropna().unique().tolist() if v not in cache]

    translator = GoogleTranslator(source="en", target="zh-CN")
    total = len(uniques)
    done = 0
    for batch in batched(uniques, args.batch_size):
        translated = translate_batch(
            translator, batch, args.retry, args.sleep, args.error_log
        )
        for src, tgt in zip(batch, translated):
            cache[src] = tgt
        done += len(batch)
        if done % (args.batch_size * 10) == 0:
            save_cache(args.cache, cache)
            print(f"translated {done}/{total}")
        time.sleep(args.sleep)

    save_cache(args.cache, cache)

    df["汉译校对"] = eng_key.map(cache)

    # Only flag entries that differ from existing 汉义; leave identical as-is.
    df.loc[df["汉译校对"] == df[han_col], "汉译校对"] = ""

    df.to_excel(args.output, index=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
