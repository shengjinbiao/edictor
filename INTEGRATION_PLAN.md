# EDICTOR 整合计划（功能与界面）

## 目标
- 让语言学家在浏览器中“一站式”使用：数据导入、同源判定、自动对齐、对应关系、部分同源、形态分析、可视化和导出。
- 简化复杂操作：提供向导/模板，避免用户记 CLI 或 Notebook。
- 保持兼容现有工作流：支持 TSV、CLDF、SQLite，本地与远程数据源。
- 界面与文案使用中文（标题、按钮、提示、错误信息），便于面向中文用户。

## 需要整合的功能（服务端已有端点/前端已有模块）
- 数据入口：上传/选择 TSV（EDICTOR Wordlist）、CLDF（`cldf-metadata.json`）、SQLite（`remote_dbase`）。
- 预处理：列映射/列选择（DOCULECT/CONCEPT/IPA/TOKENS/ALIGNMENT/COGID/PATTERNS/NOTE），缺失列的提示与默认策略。
- 自动同源：`/cognates.py`（支持 LingPy/LingRex 算法，如 LexStat、SCA 参数可选）。
- 自动对齐：`/alignments.py`（多序列对齐，含参数：算法、评分矩阵、gap 罚分）。
- 对应模式：`/patterns.py`、`/correspondences` 功能（提取音对应；配合 pattern 视图）。
- 缺失反射预测：基于对应模式推测缺失语言的词形，写入新列（如 `PREDICTED_FORM`），带置信度。
- 祖语重构：基于同源对齐和对应模式自动生成 proto-form（可多候选/概率），写入 `PROTO_FORM` 列。
- 部分同源：已有 panels/helps，需入口明确，支持标注和查询。
- 形态模块：形态拆分/标注视图（`morphology` 相关前端）。
- 交互编辑：手动标注、批量操作、过滤/排序。
- 导出：EDICTOR TSV、对齐结果、对应模式表；可选导出为 CLDF/CSV。
- 环境检测：是否安装 LingPy/LingRex，给出状态与安装提示。
- 帮助/教学：集成 `app/help/*.html` 到统一帮助区，按功能卡片展示。

## 用户典型工作流（向导化）
1) 导入数据  
   - 选文件：上传 TSV / 选择 CLDF metadata / 选 SQLite 数据库  
   - 列检测：自动识别列；必要时手动映射  
   - 预览：显示行样例 + 列状态
2) 同源判定  
   - 选择算法（LexStat/SCA/随机森林等可选项）与参数  
   - 运行并显示日志/进度；写入 COGID 列  
   - 结果可编辑（手工合并/拆分）
3) 对齐  
   - 选择目标列（TOKENS/IPA）和参数  
   - 批量运行，产出 ALIGNMENT 列，提供对齐可视化
4) 对应模式/音变  
   - 从对齐/同源结果提取对应  
   - 可视化对应矩阵，导出表格
5) 预测与重构  
   - 基于对应模式预测缺失反射（选目标语言、输出列、是否多候选）  
   - 基于对应模式 + 对齐重构祖语（输出 proto 列，显示置信度/变体）  
6) 部分同源/形态  
   - 标注并检索部分同源；形态拆分视图  
7) 导出  
   - 选择格式（EDICTOR TSV、对齐结果、对应表、CLDF）并下载

## 界面布局建议
- 左侧导航 / 顶部标签：
  - Dashboard（功能总览 + 环境状态 + 常用向导按钮）
  - Files（数据导入/管理）
  - Cognates（自动/手动同源）
  - Alignments（自动对齐 + 可视化）
  - Correspondences/Patterns（对应模式）
  - Partial & Morphology（部分同源、形态）
  - Export（导出）
  - Help（卡片式帮助，链接到现有 help HTML）
- Dashboard 内容：
  - “开始一个任务”卡片：CLDF → 同源 → 对齐 → 导出 的快捷按钮（预填参数，点击即发送 POST 调用对应端点）
  - 环境检测条：LingPy/LingRex 安装状态 + 安装命令提示
  - 最近使用的数据集列表（来自本地存储或配置）
- Files 页：
  - 上传区（拖拽/按钮）：TSV/CLDF/SQLite
  - 列映射对话框：自动检测 + 手动修正
  - 数据预览表
- 功能页（Cognates / Alignments / Patterns）：
  - 参数表单（算法、阈值、矩阵等）
  - 运行按钮 + 进度/日志面板
  - 结果表/可视化 + 内联编辑
- Patterns/Correspondences 页新增：
  - “预测缺失反射”表单：选择缺失语言/行、目标输出列名、候选数量、置信度开关；结果表格可手动接受/编辑。
  - “重构祖语”表单：选择使用的对应集/对齐列、输出 proto 列、是否生成多候选；结果表展示候选与分数。
- Export 页：
  - 勾选输出列/格式
  - 生成文件并触发下载
- Help 页：
  - 从 `app/help/*.html` 嵌入为折叠卡片，按功能分组

## 技术实现要点
- 后端：沿用 `server.py` 现有端点；必要时增加环境检测端点（检测 LingPy/LingRex 是否可导入）。
- 前端：
  - 在 `app/panels/` 新增 `dashboard.html`/`wizard.html`，在导航中挂载。
  - 共用已有 CSS/JS 框架，避免破坏现有页面；新增的向导/卡片可用轻量 JS 发送 POST。
  - 参数表单→`fetch` 调用 `/cognates.py`、`/alignments.py`、`/patterns.py` 等；处理返回并刷新视图。
- 配置与示例：
  - 扩展 `app/config.json`，增加示例链接（CLDF 示例、TSV 示例），方便一键体验。
  - 可预置示例数据在 `app/data` 或远程拉取。

## 迭代里程碑
1) 添加 Dashboard/Wizard 面板 + 环境检测条（前端）  
2) Files 页列映射对话框 + 预览完善  
3) 同源/对齐/对应页：参数表单与运行日志的统一 UI  
4) Export 页 + 格式选择  
5) 帮助页卡片化整合  
6) 文档：在 README 加“UI 向导”说明，截图/动图

## 附加：方言距离与语言树
- 计算方式：基于同源/对齐结果生成语言间距离矩阵（可选 LexStat 距离、音段编辑距离、Jaccard 等），支持标准化。
- 树构建：使用距离矩阵生成 UPGMA / Neighbor-Joining 树，支持导出 Newick 和图像。
- UI：新增 Distances/Trees 面板或在 Correspondences 页增加子卡片；表单选择算法、输入列、生成树方法；显示距离矩阵预览与树图，提供下载按钮。
- 工作流插入位置：在“对齐/对应”后，先跑距离，再生成树；可在 Dashboard 提供快捷流程（同源 → 对齐 → 距离 → 树 → 导出）。
- 导出：距离矩阵（CSV/TSV）、树（Newick/PNG），便于后续可视化或发表。
