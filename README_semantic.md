## 语义过滤工具使用说明（`filter_head_semantics.py`）

本工具提供图形界面，基于 sentence-transformers 对 Excel 词表做语义筛选，输出带分数的全表和过滤后的子集。

### 1. 环境准备
推荐单独新建环境，避免影响其他项目。

```powershell
conda create -n edictor-gpu python=3.12 -y
conda activate edictor-gpu
# GPU 版（需 NVIDIA 驱动）
pip install --index-url https://download.pytorch.org/whl/cu121 torch torchvision torchaudio
# 如果只需 CPU，改为：pip install torch==2.3.0
# 通用依赖
pip install sentence-transformers pandas openpyxl
```

### 2. 运行
在环境中执行：
```powershell
python filter_head_semantics.py
```
打开 “Semantic Filter GUI” 窗口。

### 3. 界面字段
- **Excel file**：选择待处理的 Excel（同目录输出结果）。
- **Gloss column name (optional)**：可填列名；为空则按列序号。
- **Gloss col**：列序号（0 起），默认 4。
- **Include terms**：必填，分号分隔的包含词/短语。
- **Exclude terms**：可选，分号分隔的排除词/短语。
- **Pre-filter chars**：可选，字符预过滤（正则类字符集），留空则不过滤。
- **Threshold**：阈值，默认 0.18，分数 ≥ 阈值视为匹配。
- **Require GPU**：勾选则强制用 CUDA；若 CUDA 不可用会报错。
- **Run**：开始处理。状态栏会显示 “Encoding glosses…” 等进度，完成后提示保存位置。

### 4. 输出
处理完成后，在源文件同目录生成两份：
- `<原文件名>_semantic_scored.xlsx`：全表，附加 `semantic_score`、`suffix_penalty`、`final_score`、`maybe_head_semantics`。
- `<原文件名>_semantic_filtered.xlsx`：只保留通过阈值的行。

### 5. 常见问题
- **找不到 sentence_transformers / torch**：确认在创建的环境里运行，或在当前环境重新 `pip install sentence-transformers torch`。
- **CUDA 报错或 meta tensor**：先取消勾选 Require GPU 用 CPU 跑通；如需 GPU，重装稳定的 CUDA 版 torch（示例：`torch==2.3.0` cu121）。
- **文件损坏/Excel 打不开**：说明中途报错或被中断，删掉损坏的输出，重跑一次。

### 6. 性能提示
- 大文件耗时较长，CPU 模式更慢。GPU 可显著加速，但需驱动匹配。
- 预过滤字符或收窄 include/exclude 能减少处理量。***
