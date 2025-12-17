"""
Semantic re-filtering for head-related vocabulary.

Reads ``head_data.xlsx`` (copy of the user's Excel), computes a semantic score
for the English/Chinese gloss column, and exports two files:
    - head_data_semantic_scored.xlsx  (original rows + scores + flag)
    - head_data_semantic_filtered.xlsx  (rows flagged as head/cranial semantics)

The goal is to keep items whose gloss is semantically related to the body part
“head” (including common metaphoric extensions), and down-rank items where
characters like “头/首/元/颅” are used as affixes or semantic-light endings.
"""

from __future__ import annotations

import pandas as pd
import torch
from sentence_transformers import SentenceTransformer, util

DATA_PATH = "head_data.xlsx"
OUTPUT_SCORED = "head_data_semantic_scored.xlsx"
OUTPUT_FILTERED = "head_data_semantic_filtered.xlsx"

# Column index of the gloss we want to score (0-based). In this sheet it is the
# 5th column (labelled “英义”).
GLOSS_COL_INDEX = 4

# Positive and negative seed phrases (kept ASCII via Unicode escapes for
# portability in different shells/code pages).
POSITIVE_SEEDS = [
    "head (human body)",
    "human head",
    "animal head",
    "skull",
    "cranium",
    "forehead",
    "crown of head",
    "face",
    "brow",
    "head top",
    "braincase",
    "head as leader",
    "chief",
    "leader",
    "headman",
    "\u5934",  # 头
    "\u5934\u90e8",  # 头部
    "\u5934\u9885",  # 头颅
    "\u9885\u9aa8",  # 颅骨
    "\u5934\u76d6\u9aa8",  # 头盖骨
    "\u524d\u989d",  # 前额
    "\u5934\u9876",  # 头顶
    "\u9996\u9886",  # 首领
    "\u9996\u8111",  # 首脑
    "\u5934\u9886",  # 头领
    "\u5934\u76ee",  # 头目
]

NEGATIVE_SEEDS = [
    # Generic morphology / semantic bleaching
    "affix",
    "suffix",
    "bound morpheme",
    "diminutive",
    "grammatical particle",
    "classifier",
    "word ending",
    "derivational suffix",
    "function word",
    "reduction of meaning",
    "\u540e\u7f00",  # 后缀
    "\u8bcd\u7f00",  # 词缀
    "\u513f\u5316",  # 儿化
    "\u6307\u5c0f",  # 指小
    "\u865a\u5316",  # 虚化
    "\u540e\u7f00\u5316",  # 后缀化
    # Common false friends / non-head senses
    "taro",
    "yam",
    "potato",
    "\u828b\u5934",  # 芋头
    "\u828b",  # 芋
    "\u85e4\u85af",  # 藷/薯
    "\u9aa8\u5934",  # 骨头
    "bone",
    "skeleton",
    "\u5ff5\u5934",  # 念头
    "idea",
    "notion",
    "thought",
]

# Characters used to pre-filter candidate rows (any column) before scoring.
HEAD_CHARS = "头首元颅"

# Characters that often mark suffix-like/semantic-light usage.
SUFFIX_CHARS = {"\u5934", "\u9996", "\u5143", "\u9885", "\u513f", "\u5152", "\u5b50"}
# Roots that often precede a suffixal “头/儿/子” but are not about the head.
NON_HEAD_ROOTS = {"\u828b", "\u85e4", "\u9aa8", "\u5ff5"}  # 芋、薯、骨、念


def compute_suffix_penalty(text: str) -> float:
    """Return a small penalty if the string looks like suffixal/bleached usage."""
    if not isinstance(text, str):
        return 0.0
    penalty = 0.0
    lower = text.lower()
    if any(k in lower for k in ("suffix", "affix", "classifier", "particle", "diminutive")):
        penalty = max(penalty, 0.25)
    for idx, ch in enumerate(text):
        if ch in SUFFIX_CHARS and idx > 0:
            penalty = max(penalty, 0.25)
            break
    if any(root in text for root in NON_HEAD_ROOTS):
        penalty = max(penalty, 0.2)
    return penalty


def main() -> None:
    df = pd.read_excel(DATA_PATH)
    gloss_col = df.columns[GLOSS_COL_INDEX]

    # Pre-filter rows that contain the target characters anywhere to speed up processing.
    char_mask = df.apply(lambda col: col.astype(str).str.contains(f"[{HEAD_CHARS}]", na=False))
    candidate_rows = char_mask.any(axis=1)
    df_candidates = df[candidate_rows].copy()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SentenceTransformer(
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", device=device
    )
    pos_emb = model.encode(POSITIVE_SEEDS, convert_to_tensor=True, normalize_embeddings=True).mean(
        dim=0, keepdim=True
    )
    pos_emb = util.normalize_embeddings(pos_emb)
    neg_emb = model.encode(NEGATIVE_SEEDS, convert_to_tensor=True, normalize_embeddings=True).mean(
        dim=0, keepdim=True
    )
    neg_emb = util.normalize_embeddings(neg_emb)

    gloss_texts = df_candidates[gloss_col].fillna("").astype(str).tolist()
    gloss_embs = model.encode(
        gloss_texts,
        convert_to_tensor=True,
        normalize_embeddings=True,
        batch_size=256 if device == "cuda" else 64,
        show_progress_bar=True,
    )

    sim_pos = util.cos_sim(gloss_embs, pos_emb).squeeze(1)
    sim_neg = util.cos_sim(gloss_embs, neg_emb).squeeze(1)
    semantic_score = (sim_pos - sim_neg).cpu().numpy()

    df["semantic_score"] = None
    df["suffix_penalty"] = None
    df["final_score"] = None

    df.loc[candidate_rows, "semantic_score"] = semantic_score
    df.loc[candidate_rows, "suffix_penalty"] = df_candidates[gloss_col].apply(compute_suffix_penalty)
    df.loc[candidate_rows, "final_score"] = df.loc[candidate_rows, "semantic_score"] - df.loc[candidate_rows, "suffix_penalty"]

    # Initial threshold; adjust if needed after inspecting the score distribution.
    threshold = 0.18
    df["maybe_head_semantics"] = False
    df.loc[candidate_rows, "maybe_head_semantics"] = df.loc[candidate_rows, "final_score"] >= threshold

    df.to_excel(OUTPUT_SCORED, index=False)
    df[df["maybe_head_semantics"]].to_excel(OUTPUT_FILTERED, index=False)

    kept = int(df["maybe_head_semantics"].sum())
    total = int(candidate_rows.sum())
    print(f"Kept {kept}/{total} candidate rows (threshold={threshold})")
    print("Examples above threshold:")
    print(df[df["maybe_head_semantics"]][[gloss_col, "final_score"]].head(10))
    print("Examples below threshold:")
    print(df[candidate_rows & ~df["maybe_head_semantics"]][[gloss_col, "final_score"]].head(10))


if __name__ == "__main__":
    main()
