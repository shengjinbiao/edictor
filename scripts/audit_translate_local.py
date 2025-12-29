import argparse
import json
import os
import time
from typing import Dict, Iterable, List

import pandas as pd
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


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
    tokenizer: AutoTokenizer,
    model: AutoModelForSeq2SeqLM,
    texts: List[str],
    device: torch.device,
    src_lang: str | None,
    tgt_lang: str | None,
) -> List[str]:
    if src_lang:
        tokenizer.src_lang = src_lang
    inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    gen_kwargs = {}
    if tgt_lang:
        gen_kwargs["forced_bos_token_id"] = tokenizer.convert_tokens_to_ids(tgt_lang)
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=80, **gen_kwargs)
    return tokenizer.batch_decode(outputs, skip_special_tokens=True)


def translate_with_fallback(
    tokenizer: AutoTokenizer,
    model: AutoModelForSeq2SeqLM,
    texts: List[str],
    device: torch.device,
    src_lang: str | None,
    tgt_lang: str | None,
    error_log: str | None,
) -> List[str]:
    try:
        return translate_batch(tokenizer, model, texts, device, src_lang, tgt_lang)
    except Exception:
        results = []
        for text in texts:
            try:
                results.extend(
                    translate_batch(
                        tokenizer, model, [text], device, src_lang, tgt_lang
                    )
                )
            except Exception:
                if error_log:
                    with open(error_log, "a", encoding="utf-8") as f:
                        f.write(text + "\n")
                results.append("")
        return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--model", default="facebook/nllb-200-distilled-600M")
    parser.add_argument("--src-lang", default="eng_Latn")
    parser.add_argument("--tgt-lang", default="zho_Hans")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--sleep", type=float, default=0.0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--error-log", default="d:\\edictor\\translation_errors.txt")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    is_nllb = "nllb" in args.model.lower()
    src_lang = args.src_lang if is_nllb else None
    tgt_lang = args.tgt_lang if is_nllb else None
    if not is_nllb:
        print("non-NLLB model detected; ignoring --src-lang/--tgt-lang")

    df = pd.read_excel(args.input)
    if "英义" not in df.columns or "汉义" not in df.columns:
        raise ValueError("Missing required columns: 英义, 汉义")

    eng_col = "英义"
    han_col = "汉义"

    cache = load_cache(args.cache)
    eng_key = df[eng_col].apply(lambda x: str(x) if pd.notna(x) else None)
    uniques = [v for v in eng_key.dropna().unique().tolist() if v not in cache]
    if args.limit and args.limit > 0:
        uniques = uniques[: args.limit]

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model).to(device)
    model.eval()

    total = len(uniques)
    done = 0
    for batch in batched(uniques, args.batch_size):
        translated = translate_with_fallback(
            tokenizer,
            model,
            batch,
            device,
            src_lang,
            tgt_lang,
            args.error_log,
        )
        for src, tgt in zip(batch, translated):
            cache[src] = tgt
        done += len(batch)
        if done % max(args.batch_size * 20, 1) == 0:
            save_cache(args.cache, cache)
            print(f"translated {done}/{total}")
        if args.sleep:
            time.sleep(args.sleep)

    save_cache(args.cache, cache)

    df["汉译校对"] = eng_key.map(cache)
    df.loc[df["汉译校对"] == df[han_col], "汉译校对"] = ""
    df.to_excel(args.output, index=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
