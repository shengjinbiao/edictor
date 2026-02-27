# EDICTOR 3: Web-Based Tool for Computer-Assisted Language Comparison

## 中文完整教程

- 仓库地址（官方）：https://github.com/digling/edictor
- 中文完整教程：`docs/EDICTOR_完整中文教程.md`

EDICTOR is a web-based tool for computer-assisted language comparison. As of Version 3, EDICTOR is available in two forms. You can access the application via its website at [https://edictor.org](https://edictor.org) or you can install a Python application that allows you to run EDICTOR with more features locally in your webbrowser.

In order to get started with the local application, you should make sure to have a recent Python installation (3.9 or higher) along with the PIP package manager. It is necessary to install the package from a virtual environment, so we start with setting this up.

## 近期更新（中文）
- 界面新增分词辅助：上传正字法文件自动生成 `TOKENS`，生成后可直接覆盖保存或下载。
- 覆盖率检查：一键查看每个方言点的概念覆盖率，判断数据是否稠密。
- 同源计算自动创建 COGID：未设置同源列时会提示并创建 `COGID/COGIDS`。
- 音系分析增强：声母/韵母/声调频次，同音表（声韵/声韵调），支持中文列名/大小写不敏感。
- 方言点选择下拉自动填充（从 DOCULECT 列），选中后统计仅作用于当前方言点。
- 语义概念筛选（本地服务）
    EDICTOR 提供语义概念筛选功能，用于查找与目标语义相关的概念集合（如“head”），同时排除语义虚化或不相关的用法（如“taro”“suffix”）。
    这有助于在人工核查前缩小同源候选集合。

    工作原理：

    使用 Sentence-Transformers 模型将概念嵌入到向量空间中。
    将“包含”项取均值形成正向“目标”向量；可选的“排除”项形成负向向量。
    为每个概念计算语义分数（与正向向量的余弦相似度减去与负向向量的相似度）。
    分数超过阈值的概念会被选中，用于过滤词表。
    Sentence-Transformers 的关键作用在于：它把短语（概念标签或释义）映射为稠密向量，并用余弦距离衡量语义相似性，从而实现“按语义”而非“按字符”的筛选。

    该筛选在本地 Python 服务端运行。如果有 CUDA GPU，可在对话框中强制使用 GPU；否则默认使用 CPU。
- 计算面板改成弹窗
   Workflow 向导与暂停/恢复
   分词流程两条路径（ipa2tokens / tokenizer）
   正字法歧义全局选择
   音变链分析与可视化测试

## Virtual Environments

One possible way of managing virtual environments is the `virtualenv' package. The first recommended step is to install the 'virtualenv' package that manages those environments, and to create and activate such an environment. You can read more about virtual environments here: [https://docs.python.org/3/library/venv.html](https://docs.python.org/3/library/venv.html).

```shell
python3 -m pip install virtualenv
python3 -m venv venv/edictor
source venv/edictor/bin/activate
```

## Installing EDICTOR

Installing EDICTOR can then be done via the commandline by simply typing the following command in the terminal (the `$` symbol here indicates that the command is issued as a prompt and not written inside a script).

```shell
pip install edictor
```

This will install EDICTOR on your computer and offer the command `edictor` on your commandline that you can use to run the application locally. To check that this works in principle, simply type the following command.

```shell
edictor --help
```

This shows you all the current options of the application. Running the application then simply requires to type the subcommand `server`, as illustrated below.

```shell
edictor server
```

### Installing from source (editable)

```shell
git clone https://github.com/digling/edictor.git
cd edictor
python -m pip install -e .
```

Running the application will try to automatically open the webbrowser at the default address `http://localhost:9999`. This may not work on all operation systems, partly, because command names for webbrowsers differ, and possibly also because the port is already used by another application. You can select another port when starting the application.

```shell
edictor server --port=9876
```

The landing page will provide further information on files and datasets that you can open and test.

## Installing EDICTOR 3 with LingPy Support

If you want to test EDICTOR 3 with [LingPy](https://pypi.org/project/lingpy) support, you can again install the package via PIP using the following command.

```shell
pip install "edictor[lingpy]"
```

This will not only add support to all functionalities provided by LingPy (improved automatic cognate detection, improved alignments) and [LingRex](https://pypi.org/project/lingrex) (improved correspondence pattern detection), but also provide access to the `wordlist` command from the EDICTOR 3 commandline (see below for details). In many terminals, you can run the same command without quotation marks.

## Semantic concept filter (local server)

EDICTOR includes a semantic concept filter for finding concept sets related to a target meaning
(e.g., "head") while excluding semantic-light or irrelevant uses (e.g., "taro", "suffix").
This is useful for narrowing candidate cognate sets before manual inspection.

How it works:

1. Concepts are embedded into a vector space using a Sentence-Transformers model.
2. The include terms are averaged into a positive "target" vector; optional exclude terms
   form a negative vector.
3. Each concept gets a semantic score (cosine similarity to positive minus similarity
   to negative).
4. Concepts above a threshold are selected and used to filter the wordlist.

Sentence-Transformers provides the key capability here: it maps short phrases (concept
labels or glosses) to dense vectors where semantic similarity is measured by cosine
distance. This makes it possible to select meanings by semantics rather than by
character matching.

The filter runs on the local Python server. If a CUDA-enabled GPU is available, you can
require GPU usage from the dialog; otherwise the filter runs on CPU.

## Getting Started on Windows

在 conda 环境里打开本地源码，按 README 的方式这样做即可（PowerShell）：

```shell
   git clone https://github.com/shengjinbiao/edictor.git
   conda create -n edictor_env
   conda activate edictor_env
   cd D:\edictor
   python -m pip install -e .
   edictor server
```
这样会打开localhost:9999。可选：指定端口

```shell
   edictor server --port=9876
```

如果你还没装依赖，用 python -m pip install -e . 一次即可，之后只需 edictor server。

In order to get the EDICTOR application working on Windows, we have successfully carried out the following steps. First, you should download [Python](https://python.org) (we used Python 3.11.9, but you can use versions starting from 3.9). We also downloaded [GIT](https://www.git-scm.com/) for Windows (Version 2.45.2.windows.1). Having installed both programs successfully, you must also install the [Windows Powershell](https://learn.microsoft.com/en-us/powershell/?view=powershell-7.4) which offers commandline facilities. This program can then be opened as any other application (but you must open the application as administrator, you find information on doing this in German [here](https://www.heise.de/tipps-tricks/Windows-Powershell-Skript-ausfuehren-4672163.html)).

Having opened the Powersheel terminal window, you will reside in the path `C:\windows\system32`. From here, you should got to your user path with the `cd` command. In the following example, the username is `edictor3`.

```shell
PS C:\windows\system32> cd C:\Users\edictor3\Desktop\
```

There, we create a directory for EDICTOR3 files and use `GIT` to clone the most recent EDICTOR version.

```shell
PS C:\Users\edictor3\Desktop> mkdir edictor3
PS C:\Users\edictor3\Desktop> cd edictor3
PS C:\Users\edictor3\Desktop> git clone https://github.com/digling/edictor.git
PS C:\Users\edictor3\Desktop> git checkout v3.0.0
```

We now create a virtual environment with Python in order to make sure we can use the code locally and do not need to destroy anything in our Python installation with the installation of EDICTOR3. Instructions can be found [here](https://mothergeo-py.readthedocs.io/en/latest/development/how-to/venv-win.html). 

```shell
PS C:\Users\edictor3\Desktop\edictor3> python -m pip install virtualenv
PS C:\Users\edictor3\Desktop\edictor3> virtualenv edi3
PS C:\Users\edictor3\Desktop\edictor3> Set-ExecutionPolicy -ExecutionPolicy Unrestricted -force
PS C:\Users\edictor3\Desktop\edictor3> .\edi3\Scripts\activate
```

With these commands, you have in this terminal a virtual environment that you can safely use to install packages in Python. We can now install the package locally and load it directly.

```shell
(edi3) PS C:\Users\edictor3\Desktop\edictor3> python -m pip install -e edictor
(edi3) PS C:\Users\edictor3\Desktop\edictor3> edictor server
```

You must still open your webbrowser at the URL `https://localhost:9999`, since we cannot automatically trigger Windows to open the Firefox (the preferred webbrowser for the EDICTOR). But with this, you are done and can use the tool in your work.

If you want to use the tool along with [LingPy](https://lingpy.org) and [LingRex](https://pypi.org/project/lingrex), you can install these packages as well. EDICTOR will recognize if they are installed and allow for more options in computing cognates, alignments, and correspondence patterns. 

```shell
(edi3) PS C:\Users\edictor3\Desktop\edictor3> python -m pip install lingpy lingrex
```

## Run with Docker (no local Python needed)

We provide a Dockerfile to run EDICTOR in a container (CUDA runtime base image).

Build:

```bash
docker build -t edictor .
```

Run (default port 9999):

```bash
docker run --rm -p 9999:9999 edictor
# override port
docker run --rm -e PORT=9876 -p 9876:9876 edictor
```

Then open `http://localhost:9999` in your browser.

Notes:
- The Docker image installs `requirements.txt` plus `.[lingpy]` so that
  semantic filtering (Sentence-Transformers), tokenizer (segments), and
  Excel support (pandas/openpyxl) are available in the container.
- The base image is CUDA-enabled; if you don't need GPU, you can switch
  to a CPU-only base image and keep the same install steps.

Mount data (optional):

```bash
docker run --rm -p 9999:9999 -v /path/to/data:/data edictor
```

## PyEDICTOR Functionalities in EDICTOR 3

EDICTOR 3 now implements functionalities originally provided in [PyEDICTOR](https://pypi.org/project/pyedictor). Since EDICTOR uses the same namespace as PyEDICTOR, 
this means that for those who wish to use PyEDICTOR independently of the EDICTOR web application, nothing has changed, since the same commands in the same form are still offered. 
With EDICTOR 3, we consider PyEDICTOR as obsolete, and all future development of PyEDICTOR will be provided in EDICTOR.

As an example on how to use PyEDICTOR functionalities in EDICTOR, you can test the following line of code to download a CLDF dataset with the
help of GIT and then convert the CLDF data to EDICTOR's "Wordlist" format.

```shell
$ git clone https://github.com/lexibank/allenbai.git
$ edictor wordlist --dataset=allenbai/cldf/cldf-metadata.json --name=allenbai
$ edictor server
```

When opening your local EDICTOR application, you can now open the tab FILES and click to open the file `allenbai.tsv` in EDICTOR there directly.

## Citing EDICTOR 3

If you use EDICTOR in your work, please cite the tool as follows:

> List, Johann-Mattis, Frederic Blum, and Kellen Parker van Dam (2025): EDICTOR 3: A Web-Based Tool for Computer-Assisted Language Comparison [Software Tool, Version 3.1]. MCL Chair at the University of Passau: Passau. URL: [https://edictor.org/](https://edictor.org).

