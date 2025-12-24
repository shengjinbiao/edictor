"""
Semantic re-filtering with a simple GUI.

Allows users to:
  - choose an Excel file
  - set include/exclude seed phrases
  - run semantic filtering (CPU/GPU)
  - export scored and filtered results
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from pathlib import Path

import pandas as pd
import torch
from sentence_transformers import SentenceTransformer, util

# Column index of the gloss we want to score (0-based).
DEFAULT_GLOSS_COL_INDEX = 4

# Default positive and negative seed phrases (ASCII + Unicode escapes).
DEFAULT_POSITIVE_SEEDS = [
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
    "\u5934",  # head
    "\u5934\u90e8",  # head part
    "\u5934\u9885",  # head/forehead
    "\u9885\u9aa8",  # skull
    "\u5934\u76d6\u9aa8",  # skullcap
    "\u524d\u989d",  # forehead
    "\u5934\u9876",  # head top
    "\u9996\u9886",  # leader
    "\u9996\u8111",  # head/brain
    "\u5934\u9886",  # head/leader
    "\u5934\u76ee",  # head/eyes
]

DEFAULT_NEGATIVE_SEEDS = [
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
    "\u540e\u7f00",  # suffix
    "\u8bcd\u7f00",  # word suffix
    "\u513f\u5316",  # diminutive
    "\u6307\u5c0f",  # diminutive
    "\u865a\u5316",  # semantic bleaching
    "\u540e\u7f00\u5316",  # suffixing
    # Common false friends / non-head senses
    "taro",
    "yam",
    "potato",
    "\u828b\u5934",  # taro head
    "\u828b",  # taro
    "\u85e4\u85af",  # yam
    "\u9aa8\u5934",  # bone head
    "bone",
    "skeleton",
    "\u5ff5\u5934",  # idea
    "idea",
    "notion",
    "thought",
]

# Characters used to pre-filter candidate rows (any column) before scoring.
DEFAULT_HEAD_CHARS = "\u5934\u9996\u5143\u9885"

# Characters that often mark suffix-like/semantic-light usage.
SUFFIX_CHARS = {"\u5934", "\u9996", "\u5143", "\u9885", "\u513f", "\u5152", "\u5b50"}
# Roots that often precede a suffixal head but are not about head.
NON_HEAD_ROOTS = {"\u828b", "\u85e4", "\u9aa8", "\u5ff5"}


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


def _split_terms(text: str) -> list[str]:
    if not text:
        return []
    text = text.replace("\n", ";")
    parts = []
    for part in text.split(";"):
        part = part.strip()
        if part:
            parts.append(part)
    return parts


def run_filter(
    data_path: Path,
    gloss_col_name: str,
    gloss_col_index: int | None,
    include_text: str,
    exclude_text: str,
    head_chars: str,
    threshold: float,
    require_gpu: bool,
    status_cb,
) -> tuple[Path, Path, int, int, str]:
    df = pd.read_excel(data_path)

    if gloss_col_name:
        if gloss_col_name not in df.columns:
            raise ValueError(f"Gloss column not found: {gloss_col_name}")
        gloss_col = gloss_col_name
    else:
        idx = DEFAULT_GLOSS_COL_INDEX if gloss_col_index is None else gloss_col_index
        if idx < 0 or idx >= len(df.columns):
            raise ValueError("Gloss column index is out of range.")
        gloss_col = df.columns[idx]

    pos_terms = _split_terms(include_text)
    neg_terms = _split_terms(exclude_text)
    if not pos_terms:
        raise ValueError("Include terms are required.")

    status_cb("Scanning candidates...")
    if head_chars:
        char_mask = df.apply(
            lambda col: col.astype(str).str.contains(f"[{head_chars}]", na=False)
        )
        candidate_rows = char_mask.any(axis=1)
    else:
        candidate_rows = pd.Series(True, index=df.index)

    df_candidates = df[candidate_rows].copy()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if require_gpu and device != "cuda":
        raise RuntimeError("CUDA is not available on this system.")

    status_cb(f"Loading model on {device}...")
    model = SentenceTransformer(
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", device=device
    )

    status_cb("Encoding seeds...")
    pos_emb = model.encode(pos_terms, convert_to_tensor=True, normalize_embeddings=True).mean(
        dim=0, keepdim=True
    )
    pos_emb = util.normalize_embeddings(pos_emb)
    if neg_terms:
        neg_emb = model.encode(neg_terms, convert_to_tensor=True, normalize_embeddings=True).mean(
            dim=0, keepdim=True
        )
        neg_emb = util.normalize_embeddings(neg_emb)
    else:
        neg_emb = None

    status_cb("Encoding glosses...")
    gloss_texts = df_candidates[gloss_col].fillna("").astype(str).tolist()
    gloss_embs = model.encode(
        gloss_texts,
        convert_to_tensor=True,
        normalize_embeddings=True,
        batch_size=256 if device == "cuda" else 64,
        show_progress_bar=True,
    )

    sim_pos = util.cos_sim(gloss_embs, pos_emb).squeeze(1)
    if neg_emb is not None:
        sim_neg = util.cos_sim(gloss_embs, neg_emb).squeeze(1)
        semantic_score = (sim_pos - sim_neg).cpu().numpy()
    else:
        semantic_score = sim_pos.cpu().numpy()

    df["semantic_score"] = None
    df["suffix_penalty"] = None
    df["final_score"] = None

    df.loc[candidate_rows, "semantic_score"] = semantic_score
    df.loc[candidate_rows, "suffix_penalty"] = df_candidates[gloss_col].apply(
        compute_suffix_penalty
    )
    df.loc[candidate_rows, "final_score"] = (
        df.loc[candidate_rows, "semantic_score"]
        - df.loc[candidate_rows, "suffix_penalty"]
    )

    df["maybe_head_semantics"] = False
    df.loc[candidate_rows, "maybe_head_semantics"] = (
        df.loc[candidate_rows, "final_score"] >= threshold
    )

    stem = data_path.stem
    scored_path = data_path.with_name(f"{stem}_semantic_scored.xlsx")
    filtered_path = data_path.with_name(f"{stem}_semantic_filtered.xlsx")
    df.to_excel(scored_path, index=False)
    df[df["maybe_head_semantics"]].to_excel(filtered_path, index=False)

    kept = int(df["maybe_head_semantics"].sum())
    total = int(candidate_rows.sum())
    return scored_path, filtered_path, kept, total, device


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Semantic Filter GUI")
        self.geometry("760x520")

        self.file_path = tk.StringVar()
        self.gloss_col_name = tk.StringVar()
        self.gloss_col_index = tk.StringVar(value=str(DEFAULT_GLOSS_COL_INDEX))
        self.include_text = tk.StringVar(value="; ".join(DEFAULT_POSITIVE_SEEDS))
        self.exclude_text = tk.StringVar(value="; ".join(DEFAULT_NEGATIVE_SEEDS))
        self.head_chars = tk.StringVar(value=DEFAULT_HEAD_CHARS)
        self.threshold = tk.StringVar(value="0.18")
        self.require_gpu = tk.BooleanVar(value=False)
        self.status = tk.StringVar(value="Idle")

        self._build_ui()

    def _build_ui(self) -> None:
        pad = {"padx": 8, "pady": 6}

        row = 0
        tk.Label(self, text="Excel file").grid(row=row, column=0, sticky="w", **pad)
        tk.Entry(self, textvariable=self.file_path, width=70).grid(
            row=row, column=1, sticky="we", **pad
        )
        tk.Button(self, text="Browse", command=self._pick_file).grid(
            row=row, column=2, sticky="we", **pad
        )

        row += 1
        tk.Label(self, text="Gloss column name (optional)").grid(
            row=row, column=0, sticky="w", **pad
        )
        tk.Entry(self, textvariable=self.gloss_col_name, width=30).grid(
            row=row, column=1, sticky="w", **pad
        )
        tk.Label(self, text="Gloss column index").grid(
            row=row, column=2, sticky="w", **pad
        )
        tk.Entry(self, textvariable=self.gloss_col_index, width=8).grid(
            row=row, column=2, sticky="e", **pad
        )

        row += 1
        tk.Label(self, text="Include terms (semicolon-separated)").grid(
            row=row, column=0, sticky="w", **pad
        )
        tk.Entry(self, textvariable=self.include_text, width=70).grid(
            row=row, column=1, columnspan=2, sticky="we", **pad
        )

        row += 1
        tk.Label(self, text="Exclude terms (semicolon-separated)").grid(
            row=row, column=0, sticky="w", **pad
        )
        tk.Entry(self, textvariable=self.exclude_text, width=70).grid(
            row=row, column=1, columnspan=2, sticky="we", **pad
        )

        row += 1
        tk.Label(self, text="Pre-filter chars (optional)").grid(
            row=row, column=0, sticky="w", **pad
        )
        tk.Entry(self, textvariable=self.head_chars, width=30).grid(
            row=row, column=1, sticky="w", **pad
        )
        tk.Label(self, text="Threshold").grid(row=row, column=2, sticky="w", **pad)
        tk.Entry(self, textvariable=self.threshold, width=8).grid(
            row=row, column=2, sticky="e", **pad
        )

        row += 1
        tk.Checkbutton(self, text="Require GPU", variable=self.require_gpu).grid(
            row=row, column=0, sticky="w", **pad
        )
        tk.Button(self, text="Run", command=self._run).grid(
            row=row, column=2, sticky="e", **pad
        )

        row += 1
        tk.Label(self, textvariable=self.status, anchor="w").grid(
            row=row, column=0, columnspan=3, sticky="we", **pad
        )

        self.grid_columnconfigure(1, weight=1)

    def _pick_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Select Excel file",
            filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")],
        )
        if path:
            self.file_path.set(path)

    def _set_status(self, text: str) -> None:
        self.status.set(text)
        self.update_idletasks()

    def _run(self) -> None:
        if not self.file_path.get().strip():
            messagebox.showerror("Error", "Please select an Excel file.")
            return
        try:
            threshold = float(self.threshold.get().strip())
        except ValueError:
            messagebox.showerror("Error", "Threshold must be a number.")
            return

        try:
            gloss_index = int(self.gloss_col_index.get().strip())
        except ValueError:
            gloss_index = DEFAULT_GLOSS_COL_INDEX

        def worker() -> None:
            try:
                scored, filtered, kept, total, device = run_filter(
                    Path(self.file_path.get().strip()),
                    self.gloss_col_name.get().strip(),
                    gloss_index,
                    self.include_text.get(),
                    self.exclude_text.get(),
                    self.head_chars.get().strip(),
                    threshold,
                    self.require_gpu.get(),
                    self._set_status,
                )
                self._set_status(
                    f"Done. Kept {kept}/{total}. Device: {device}. "
                    f"Saved: {scored.name}, {filtered.name}"
                )
                messagebox.showinfo(
                    "Done",
                    f"Kept {kept}/{total}\nSaved:\n{scored}\n{filtered}",
                )
            except Exception as exc:
                self._set_status("Failed.")
                messagebox.showerror("Error", str(exc))

        threading.Thread(target=worker, daemon=True).start()


def main() -> None:
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
