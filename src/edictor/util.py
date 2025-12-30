"""
Utility functions for the server.
"""
import sqlite3
import urllib
import os
import json
import codecs
import getpass
import signal
import re
from email.parser import BytesParser
from email.policy import default as email_default

from urllib.request import urlopen

from pathlib import Path
from datetime import datetime
from importlib.machinery import SourceFileLoader

DATA = {
    "js": "text/javascript",
    "css": "text/css",
    "html": "text/html",
    "tsv": "text/plain; charset=utf-8",
    "csv": "text/plain; charset=utf-8",
    "png": "",
    "jpg": "",
    "ttf": "",
    "woff": "",
    "json": "text/plain; charset=utf-8",
    "config": "config.json",
}

SEMANTIC_MODELS = {}


def _split_terms(text):
    if not text:
        return []
    text = text.replace("\n", ";")
    parts = re.split(r"[;,|]+", text)
    out = []
    for part in parts:
        part = part.strip()
        if part:
            out.append(part)
    return out


def _get_semantic_model(name, device):
    key = (name, device)
    if key not in SEMANTIC_MODELS:
        from sentence_transformers import SentenceTransformer
        SEMANTIC_MODELS[key] = SentenceTransformer(name, device=device)
    return SEMANTIC_MODELS[key]


def opendb(path, conf):
    if Path(conf["sqlite"], path + ".sqlite3").exists():
        db = sqlite3.connect(
            Path(conf["sqlite"], path + ".sqlite3"))
    elif edictor_path(conf["sqlite"], path + ".sqlite3").exists():
        db = sqlite3.connect(
            edictor_path(conf["sqlite"], path + ".sqlite3"))
    else:
        raise ValueError("SQLITE DB could not be found.")
    return db, db.cursor()


def edictor_path(*comps):
    return Path(__file__).parent.joinpath("app", *comps)


def parse_args(path):
    args = {}
    # avoid splitting error 
    if "?" in path and "=" in path:
        for k, v in map(
                lambda x: x.split("="),
                path.split("?")[1].split("#")[0].split("&"),
        ):
            args[k] = v
    return args


def parse_post(path):
    args = {}
    if isinstance(path, bytes):
        path = path.decode("utf-8")
    if "=" in path:
        for k, v in map(
                lambda x: x.split("="),
                path.split("#")[0].split("&")):
            args[k] = v
    return args


def download(s, post):
    """
    Download command, that writes the file to the current folder.
    """
    args = parse_post(post)
    if not args["file"].endswith(".tsv"):
        return
    date, time = str(datetime.today()).split(" ")
    if Path(args["file"]).exists():
        os.rename(
            args["file"],
            args["file"][:-4] + "-" + date + "-".join(time.split(":")[:2]) + ".tsv"
        )
    with codecs.open(args["file"], "w", "utf-8") as f:
        f.write(urllib.parse.unquote_plus(args["data"]))

    send_response(s, "success")


def send_response(s, content, content_type="text/html",
                  content_disposition=None, encode=True, status_code=200):
    if encode:
        content = bytes(content, "utf-8")
    s.send_response(status_code)
    s.send_header("Content-type", content_type)
    if content_disposition:
        s.send_header("Content-disposition", content_disposition)
    s.end_headers()
    s.wfile.write(content)


def handle_args(args, query, qtype):
    if qtype == "POST":
        args.update(parse_post(query))
    elif qtype == "GET":
        args.update(parse_args(query))


# noinspection PyPackageRequirements
def check(s):
    try:
        import lingpy
        import lingrex
        message = "lingpy"
    except ImportError:  # pragma: no cover
        message = "python"
    send_response(s, message)


def configuration():
    """
    Load the Configuration Data File.
    """
    if Path(DATA["config"]).exists():
        with codecs.open(DATA["config"], "r", "utf-8") as f:
            conf = json.load(f)
    elif edictor_path(DATA["config"]).exists():
        with codecs.open(edictor_path(DATA["config"]), "r", "utf-8") as f:
            conf = json.load(f)
    else:  # pragma: no cover
        conf = {
            "user": "unknown",
            "links": None,
            "sqlite": "sqlite",
        }

    if conf.get("remote"):  # pragma: no cover
        if not conf.get("user"):
            conf["user"] = input("User name: ")
        if not conf.get("pw"):
            conf["pw"] = getpass.getpass("Remote password: ")
        # prepare the links now
        for key, values in conf["remote"].items():
            for file in values:
                values[file]["data"] = "&".join(
                    ["{0}={1}".format(k, v) for k, v in
                     values[file]["data"].items()])

    # represent urls as lists
    if conf.get("links"):
        for link in conf["links"]:
            link["url"] = link["url"] + "?" + "&".join(
                ["{0}={1}".format(k, v) for k, v in link["data"].items()])

    if not conf.get("sqlite"):
        conf["sqlite"] = "sqlite"

    if not conf.get("user"):
        conf["user"] = "unknown"

    return conf


def get_distinct(what, cursor, name):
    out = [line[0] for line in cursor.execute(
        'select distinct val from ' + name + ' where col="' + what + '";'
    )]
    return out


def get_columns(cursor, name):
    out = [line[0] for line in cursor.execute(
        'select distinct col from ' + name + ';')]
    return out


def file_type(path):
    return path.split("?")[0].split(".")[-1]


def file_name(path):
    return path.split("?")[0]


def file_handler(s, ft, fn):
    """
    Handle different file types.
    """
    message = b"404 FNF"
    ctype = DATA.get(ft, "text/plain; charset=utf-8")
    status_code = 200
    if ft in ["js", "html", "css", "csv"]:
        try:
            with codecs.open(edictor_path(fn[1:]), "r", "utf-8") as f:
                message = bytes(f.read(), "utf-8")
        except FileNotFoundError:
            message = b"404 FNF"
            ctype = "text/plain; charset=utf-8"
            status_code = 404
            print("Missing static file:", fn)
    elif ft == "tsv":
        # if a file is in the same folder where the app was started, it is
        # marked by preceding it with "/data/" by the JS application, so
        # these files must be checked for first, as they are local files.
        if Path(fn[6:]).exists() and fn.startswith("/data/"):
            with codecs.open(fn[6:], "r", "utf-8") as f:
                message = bytes(f.read(), "utf-8")
        else:
            if edictor_path(fn[1:]).exists():
                with codecs.open(edictor_path(fn[1:]), "r", "utf-8") as f:
                    message = bytes(f.read(), "utf-8")
            else:
                message = b"404 FNF"
                status_code = 404
                print("Missing TSV file:", fn)
    elif ft in ["png", "ttf", "jpg", "woff"]:
        try:
            with codecs.open(edictor_path(fn[1:]), 'rb', None) as f:
                message = f.read()
        except FileNotFoundError:
            message = b"404 FNF"
            ctype = "application/octet-stream"
            status_code = 404
            print("Missing binary file:", fn)
    send_response(s, message, ctype, encode=False, status_code=status_code)


def serve_base(s, conf):
    with codecs.open(edictor_path("index.html"), "r", "utf-8") as f:
        text = f.read()
    link_template = """<div class="dataset inside" onclick="window.open('{url}');"><span>{name}</span></div>"""

    links = []
    for link in conf["links"]:
        links += [link_template.format(**link)]
    text = text.replace("{USERDATA}", "".join(links))

    # add paths that are in the current folder
    paths = []
    for path in Path().glob("*.tsv"):
        paths += [link_template.format(url="edictor.html?file=" + path.name,
                                       name="Open File «" + path.name + "»")]
    text = text.replace("{DATASETS}", "".join(paths))
    text = text.replace(' id="files" style="display:none"', '')
    text = text.replace(' id="user" style="display:none"', '')
    text = text.replace(' class="user" style="display:none"', '')

    send_response(s, text)


# noinspection SqlDialectInspection,SqlResolve
def new_id(s, query, qtype, conf):
    """
    Obtain new identifier from currently largest one.
    """
    args = dict(
        remote_dbase='',
        file='',
        new_id='',
    )
    handle_args(args, query, qtype)
    if conf.get("remote") and args["remote_dbase"] in conf["remote"]:  # pragma: no cover
        print("requesting remote ID")
        info = conf["remote"][args["remote_dbase"]]["new_id.py"]
        req = urllib.request.Request(
            info["url"],
            data=bytes(info["data"] + "&new_id=true", "utf-8"))
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        req.get_method = lambda: 'POST'
        data = urllib.request.urlopen(req).read()
        send_response(
            s,
            data,
            encode=False,
            content_type="text/plain; charset=utf-8",
            content_disposition='attachment; filename="triples.tsv"'
        )
        return

    db, cursor = opendb(args["remote_dbase"], conf)

    if args['new_id'] == "true":
        cursor.execute('select DISTINCT ID from ' + args['file'] + ';')
        linesA = [x[0] for x in cursor.fetchall()]
        # noinspection SqlNoDataSourceInspection
        cursor.execute(
            'select DISTINCT ID from backup where FILE = "' + args['file'] + '";'
        )
        linesB = [x[0] for x in cursor.fetchall()]
        try:
            maxA = max(linesA)
        except ValueError:
            maxA = 0
        try:
            maxB = max(linesB)
        except ValueError:
            maxB = 0

        if maxA >= maxB:
            message = str(maxA + 1)
        else:
            message = str(maxB + 1)
    else:
        lines = [x[0] for x in cursor.execute('select DISTINCT VAL from ' + args['file'] +
                                              ' where COL="' + args['new_id'] + '";')]
        # dammit but, it doesn't really seem to work without explicit
        # type-checking
        cogids = []
        for line in lines:
            try:
                cogids += [int(line)]
            except ValueError:
                try:
                    cogids += [int(x) for x in line.split(' ')]
                except ValueError:
                    pass
        message = str(max(cogids) + 1)
    send_response(s, message)


def cognates(s, query, qtype):
    args = {
        "wordlist": "",
        "mode": "full",
        "method": "lexstat"
    }
    handle_args(args, query, qtype)
    args["wordlist"] = urllib.parse.unquote_plus(args["wordlist"])

    # assemble the wordlist header
    from lingpy.compare.partial import Partial
    from lingpy.compare.lexstat import LexStat
    from lingpy import basictypes
    tmp = {0: ["doculect", "concept", "form", "tokens"]}
    for row in args["wordlist"].split("\n")[:-1]:
        idx, doculect, concept, tokens = row.split('\t')
        tmp[int(idx)] = [
            doculect,
            concept,
            tokens,
            tokens.split(" ")
        ]
    out = ""
    if args["mode"] == "partial":
        part = Partial(tmp)
        part.partial_cluster(
            method="sca", threshold=0.45, ref="cogid",
            cluster_method="upgma")
        for idx in part:
            out += str(idx) + "\t" + str(basictypes.ints(part[idx, "cogid"])) + "\n"
    else:
        lex = LexStat(tmp)
        lex.cluster(
            method="sca", threshold=0.45, ref="cogid",
            cluster_method="upgma")
        for idx in lex:
            out += str(idx) + "\t" + str(lex[idx, "cogid"]) + "\n"

    send_response(
        s,
        out,
        content_type="text/plain; charset=utf-8",
        content_disposition='attachment; filename="triples.tsv"'
    )


def patterns(s, query, qtype):
    """
    Compute correspondence patterns with CoPaR (LingRex)
    """
    args = {
        "wordlist": "",
        "mode": "full",
        "method": "copar",
        "minrefs": 2
    }
    handle_args(args, query, qtype)
    args["wordlist"] = urllib.parse.unquote_plus(args["wordlist"])

    # assemble the wordlist header
    import lingpy
    from lingrex.copar import CoPaR
    if args["mode"] == "partial":
        ref = "cogids"
    else:
        ref = "cogid"
    tmp = {0: ["doculect", "concept", "form", "tokens", ref, "alignment", "structure"]}
    for row in args["wordlist"].split("\n")[:-1]:
        idx, doculect, concept, tokens, cogid, alignment = row.split('\t')
        tmp[int(idx)] = [
            doculect,
            concept,
            tokens,
            tokens.split(" "),
            lingpy.basictypes.ints(cogid) if args["mode"] == "partial" else int(cogid),
            alignment.split(" "),
            lingpy.tokens2class(tokens.split(), "cv")
        ]
    cop = CoPaR(
        tmp,
        ref=ref,
        transcription="form",
        fuzzy=True if args["mode"] == "partial" else False,
        minrefs=args["minrefs"]
    )
    print("Loaded the CoPaR object.")
    cop.get_sites()
    print("Loaded the Sites.")
    cop.cluster_sites()
    print("Clustered Sites.")
    cop.sites_to_pattern()
    print("Converted Sites to Patterns.")
    cop.add_patterns()
    out = ""
    for idx in cop:
        out += str(idx) + "\t" + " ".join(cop[idx, "patterns"]) + "\n"
    send_response(
        s,
        out,
        content_type="text/plain; charset=utf-8",
        content_disposition='attachment; filename="triples.tsv"'
    )
    print("Successfully computed correspondence patterns.")


def alignments(s, query, qtype):
    args = {
        "wordlist": "",
        "mode": "full",
        "method": "library"
    }
    handle_args(args, query, qtype)
    args["wordlist"] = urllib.parse.unquote_plus(args["wordlist"])

    print("Carrying out alignments with LingPy")
    # assemble the wordlist header
    import lingpy
    ref = "cogid" if args["mode"] == "full" else "cogids"
    tmp = {0: ["doculect", "concept", "form", "tokens", ref]}
    for row in args["wordlist"].split("\n")[:-1]:
        idx, doculect, concept, tokens, cogid = row.split('\t')
        tmp[int(idx)] = [
            doculect,
            concept,
            tokens,
            tokens.split(" "),
            lingpy.basictypes.ints(cogid) if args["mode"] == "partial" else cogid
        ]
    alms = lingpy.Alignments(tmp, ref=ref, transcription="form",
                             fuzzy=True if args["mode"] == "partial" else False)
    alms.align(method=args["method"])
    out = ""
    for idx in alms:
        out += str(idx) + "\t" + " ".join(alms[idx, "alignment"]) + "\n"

    send_response(
        s,
        out,
        content_type="text/plain; charset=utf-8",
        content_disposition='attachment; filename="triples.tsv"'
    )


def distances(s, query, qtype):
    args = {
        "wordlist": "",
        "method": "edit-dist",
        "mode": "overlap",
        "tree": "neighbor"
    }
    handle_args(args, query, qtype)
    args["wordlist"] = urllib.parse.unquote_plus(args["wordlist"])

    if not args["wordlist"].strip():
        send_response(
            s,
            json.dumps({"error": "Missing wordlist."}),
            content_type="application/json; charset=utf-8",
        )
        return

    allowed_methods = {"edit-dist", "turchin", "sca", "lexstat"}
    allowed_modes = {"overlap", "global", "local", "dialign"}
    allowed_trees = {"neighbor", "upgma", ""}
    if args["method"] not in allowed_methods:
        args["method"] = "edit-dist"
    if args["mode"] not in allowed_modes:
        args["mode"] = "overlap"
    if args["tree"] not in allowed_trees:
        args["tree"] = "neighbor"

    from lingpy.compare.lexstat import LexStat
    from lingpy.convert.strings import matrix2dst
    from lingpy.algorithm.clustering import neighbor, upgma
    from lingpy import Tree

    tmp = {0: ["doculect", "concept", "form", "tokens"]}
    for row in args["wordlist"].split("\n")[:-1]:
        idx, doculect, concept, tokens = row.split('\t')
        tmp[int(idx)] = [
            doculect,
            concept,
            tokens,
            tokens.split(" ")
        ]

    lex = LexStat(tmp)
    if len(lex.taxa) < 2:
        send_response(
            s,
            json.dumps({"error": "Need at least two taxa to compute distances."}),
            content_type="application/json; charset=utf-8",
        )
        return
    try:
        from lingpy import util as lingpy_util
        from lingpy.algorithm.cython import _misc as misc
        empty_pairs = 0
        dist_list = []
        for distances in lex._get_distances(
            args["method"],
            args["mode"],
            0.5,
            0.3,
            -2,
            lingpy_util.identity,
            True
        ):
            if distances:
                dist_list.append(sum(distances) / len(distances))
            else:
                dist_list.append(1.0)
                empty_pairs += 1
        D = misc.squareform(dist_list)
    except ZeroDivisionError:
        send_response(
            s,
            json.dumps({"error": "No overlapping concepts between taxa; distance undefined. Please check filters or data coverage."}),
            content_type="application/json; charset=utf-8",
        )
        return
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Distance computation failed.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return
    taxa = lex.taxa
    def _sanitize_taxa(names):
        forbidden = set("():;,")
        safe = []
        seen = {}
        mapping = {}
        for name in names:
            cleaned = "".join("_" if ch in forbidden else ch for ch in name)
            if cleaned in seen:
                seen[cleaned] += 1
                cleaned = f"{cleaned}_{seen[cleaned]}"
            else:
                seen[cleaned] = 0
            safe.append(cleaned)
            mapping[cleaned] = name
        return safe, mapping
    dst = matrix2dst(D, taxa)

    newick = ""
    ascii_tree = ""
    taxa_map = {}
    if args["tree"] in {"neighbor", "upgma"}:
        safe_taxa, taxa_map = _sanitize_taxa(taxa)
        try:
            if args["tree"] == "neighbor":
                newick = neighbor(D, safe_taxa)
            elif args["tree"] == "upgma":
                newick = upgma(D, safe_taxa)
        except ValueError as exc:
            send_response(
                s,
                json.dumps({"error": str(exc)}),
                content_type="application/json; charset=utf-8",
            )
            return

    if newick:
        ascii_tree = Tree(newick).asciiArt()

    matrix = D.tolist() if hasattr(D, "tolist") else D
    payload = {
        "taxa": taxa,
        "matrix": matrix,
        "phylip": dst,
        "tree": newick,
        "ascii": ascii_tree,
        "method": args["method"],
        "mode": args["mode"],
        "tree_method": args["tree"],
        "taxa_map": taxa_map,
        "empty_pairs": empty_pairs
    }
    send_response(
        s,
        json.dumps(payload),
        content_type="application/json; charset=utf-8",
    )


def semantic_filter(s, query, qtype):
    args = {"payload": ""}
    handle_args(args, query, qtype)
    if not args["payload"]:
        send_response(
            s,
            json.dumps({"error": "Missing payload."}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        payload = json.loads(urllib.parse.unquote_plus(args["payload"]))
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Invalid payload.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    concepts = payload.get("concepts", [])
    include = payload.get("include", "")
    exclude = payload.get("exclude", "")
    threshold = payload.get("threshold", 0.18)
    model_name = payload.get(
        "model", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )
    require_gpu = bool(payload.get("require_gpu", False))

    pos_terms = _split_terms(include)
    neg_terms = _split_terms(exclude)

    if not pos_terms:
        send_response(
            s,
            json.dumps({"error": "No include terms provided."}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        threshold = 0.18

    try:
        import torch
        from sentence_transformers import util as st_util
    except Exception as exc:  # pragma: no cover
        send_response(
            s,
            json.dumps({"error": "Missing dependencies.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if require_gpu and device != "cuda":
        device = "cpu"

    try:
        model = _get_semantic_model(model_name, device)
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to load model.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    if not concepts:
        send_response(
            s,
            json.dumps({"error": "No concepts provided."}),
            content_type="application/json; charset=utf-8",
        )
        return

    pos_emb = model.encode(
        pos_terms, convert_to_tensor=True, normalize_embeddings=True
    ).mean(dim=0, keepdim=True)
    pos_emb = st_util.normalize_embeddings(pos_emb)

    if neg_terms:
        neg_emb = model.encode(
            neg_terms, convert_to_tensor=True, normalize_embeddings=True
        ).mean(dim=0, keepdim=True)
        neg_emb = st_util.normalize_embeddings(neg_emb)
    else:
        neg_emb = None

    batch_size = 256 if device == "cuda" else 64
    chunk_size = 5000 if device == "cuda" else 2000
    hard_excludes = [t.lower() for t in neg_terms if t]
    kept = []
    kept_scores = []

    for i in range(0, len(concepts), chunk_size):
        chunk = concepts[i:i + chunk_size]
        concept_embs = model.encode(
            chunk,
            convert_to_tensor=True,
            normalize_embeddings=True,
            batch_size=batch_size,
            show_progress_bar=False,
        )

        scores = st_util.cos_sim(concept_embs, pos_emb).squeeze(1)
        if neg_emb is not None:
            scores = scores - st_util.cos_sim(concept_embs, neg_emb).squeeze(1)

        for concept, score in zip(chunk, scores.cpu().tolist()):
            low = concept.lower()
            if hard_excludes and any(t in low for t in hard_excludes):
                continue
            if score >= threshold:
                kept.append(concept)
                kept_scores.append(score)

    response = {
        "concepts": kept,
        "threshold": threshold,
        "device": device,
        "gpu_available": device == "cuda",
        "total": len(concepts),
        "kept": len(kept),
    }
    send_response(
        s,
        json.dumps(response),
        content_type="application/json; charset=utf-8",
    )


def orthography_tokenize(s, query, qtype):
    args = {"payload": ""}
    handle_args(args, query, qtype)
    payload = _parse_payload(args)
    if not payload:
        send_response(
            s,
            json.dumps({"error": "Missing payload."}),
            content_type="application/json; charset=utf-8",
        )
        return

    profile_text = payload.get("profile", "")
    values = payload.get("values", [])
    column = payload.get("column", "Grapheme")
    if not profile_text or not values:
        send_response(
            s,
            json.dumps({"error": "Missing profile or values."}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        from segments.tokenizer import Tokenizer
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Tokenizer unavailable.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    tmp_path = None
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", suffix=".tsv", delete=False
        ) as fp:
            fp.write(profile_text)
            tmp_path = fp.name

        tk = Tokenizer(tmp_path)
        out = []
        for item in values:
            idx = None
            val = ""
            if isinstance(item, (list, tuple)):
                if len(item) >= 2:
                    idx, val = item[0], item[1]
                elif len(item) == 1:
                    idx = item[0]
            elif isinstance(item, dict):
                idx = item.get("id")
                val = item.get("value", "")
            else:
                val = item
            tok = tk(str(val or ""), column=column)
            out.append([idx, tok])
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Tokenizer failed.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return
    finally:
        if tmp_path and Path(tmp_path).exists():
            os.remove(tmp_path)

    send_response(
        s,
        json.dumps({"tokens": out, "column": column, "count": len(out)}),
        content_type="application/json; charset=utf-8",
    )


def _parse_payload(args):
    if not args.get("payload"):
        return {}
    try:
        return json.loads(urllib.parse.unquote_plus(args["payload"]))
    except Exception:
        return {}


def _split_sem_terms(text):
    if not text:
        return []
    text = text.replace("\n", ";")
    parts = []
    for part in text.split(";"):
        part = part.strip()
        if part:
            parts.append(part)
    return parts


def _safe_upload_name(name, fallback="upload.xlsx"):
    if not name:
        return fallback
    name = Path(name).name
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name or fallback


def upload_semantic_file(s, post_data_bytes, headers):
    content_type = headers.get("Content-Type", "")
    if "multipart/form-data" not in content_type:
        send_response(
            s,
            json.dumps({"error": "Expected multipart form data."}),
            content_type="application/json; charset=utf-8",
        )
        return

    msg_bytes = (
        b"Content-Type: " + content_type.encode("utf-8") +
        b"\r\nMIME-Version: 1.0\r\n\r\n" + post_data_bytes
    )
    msg = BytesParser(policy=email_default).parsebytes(msg_bytes)
    file_item = None
    for part in msg.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue
        if part.get_param("name", header="content-disposition") == "file":
            file_item = part
            break
    if file_item is None:
        send_response(
            s,
            json.dumps({"error": "Missing file."}),
            content_type="application/json; charset=utf-8",
        )
        return

    upload_dir = Path.cwd().joinpath("uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_upload_name(file_item.get_filename())
    suffix = Path(safe_name).suffix or ".xlsx"
    stem = Path(safe_name).stem or "upload"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = upload_dir.joinpath(f"{stem}-{stamp}{suffix}")
    with open(target, "wb") as out:
        out.write(file_item.get_payload(decode=True) or b"")

    send_response(
        s,
        json.dumps({"path": str(target)}),
        content_type="application/json; charset=utf-8",
    )


def _compute_suffix_penalty(text):
    """Return a small penalty if the string looks like suffixal/bleached usage."""
    if not isinstance(text, str):
        return 0.0
    penalty = 0.0
    lower = text.lower()
    if any(k in lower for k in ("suffix", "affix", "classifier", "particle", "diminutive")):
        penalty = max(penalty, 0.25)
    suffix_chars = {"头", "首", "元", "颅", "儿", "兒", "子"}
    non_head_roots = {"芋", "藤", "骨", "念"}
    for idx, ch in enumerate(text):
        if ch in suffix_chars and idx > 0:
            penalty = max(penalty, 0.25)
            break
    if any(root in text for root in non_head_roots):
        penalty = max(penalty, 0.2)
    return penalty


def semantic_batch(s, query, qtype):
    """
    Run semantic filtering headless (Excel in, TSV out, optional load).
    """
    args = {"payload": ""}
    handle_args(args, query, qtype)
    payload = _parse_payload(args)
    if not payload:
        send_response(
            s,
            json.dumps({"error": "Missing payload."}),
            content_type="application/json; charset=utf-8",
        )
        return

    path_str = payload.get("file") or payload.get("path")
    if not path_str:
        send_response(
            s,
            json.dumps({"error": "Missing file path."}),
            content_type="application/json; charset=utf-8",
        )
        return
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        path = Path.cwd().joinpath(path)
    if not path.exists():
        send_response(
            s,
            json.dumps({"error": "File not found.", "detail": str(path)}),
            content_type="application/json; charset=utf-8",
        )
        return

    gloss_col_name = payload.get("gloss_col_name", "").strip()
    gloss_col_index = payload.get("gloss_col_index", None)
    try:
        gloss_col_index = int(gloss_col_index) if gloss_col_index not in (None, "", False) else 4
    except Exception:
        gloss_col_index = 4
    include_text = payload.get("include", "") or ""
    exclude_text = payload.get("exclude", "") or ""
    head_chars = payload.get("head_chars", "") or ""
    try:
        threshold = float(payload.get("threshold", 0.18) or 0.18)
    except Exception:
        threshold = 0.18
    require_gpu = bool(payload.get("require_gpu", False))

    pos_terms = _split_sem_terms(include_text)
    neg_terms = _split_sem_terms(exclude_text)
    if not pos_terms:
        send_response(
            s,
            json.dumps({"error": "Include terms are required."}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        import pandas as pd
        import torch
        from sentence_transformers import SentenceTransformer, util as st_util
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Missing dependencies.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        df = pd.read_excel(path)
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to read Excel.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    if gloss_col_name:
        if gloss_col_name not in df.columns:
            send_response(
                s,
                json.dumps({"error": "Gloss column not found.", "detail": gloss_col_name}),
                content_type="application/json; charset=utf-8",
            )
            return
        gloss_col = gloss_col_name
    else:
        if gloss_col_index < 0 or gloss_col_index >= len(df.columns):
            send_response(
                s,
                json.dumps({"error": "Gloss column index out of range."}),
                content_type="application/json; charset=utf-8",
            )
            return
        gloss_col = df.columns[gloss_col_index]

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
        send_response(
            s,
            json.dumps({"error": "CUDA is not available on this system."}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        model = SentenceTransformer(
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", device=device
        )
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to load model.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    pos_emb = model.encode(pos_terms, convert_to_tensor=True, normalize_embeddings=True).mean(
        dim=0, keepdim=True
    )
    pos_emb = st_util.normalize_embeddings(pos_emb)
    if neg_terms:
        neg_emb = model.encode(neg_terms, convert_to_tensor=True, normalize_embeddings=True).mean(
            dim=0, keepdim=True
        )
        neg_emb = st_util.normalize_embeddings(neg_emb)
    else:
        neg_emb = None

    gloss_texts = df_candidates[gloss_col].fillna("").astype(str).tolist()
    batch_size = 256 if device == "cuda" else 64
    gloss_embs = model.encode(
        gloss_texts,
        convert_to_tensor=True,
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )
    sim_pos = st_util.cos_sim(gloss_embs, pos_emb).squeeze(1)
    if neg_emb is not None:
        sim_neg = st_util.cos_sim(gloss_embs, neg_emb).squeeze(1)
        semantic_score = (sim_pos - sim_neg).cpu().numpy()
    else:
        semantic_score = sim_pos.cpu().numpy()

    df["semantic_score"] = None
    df["suffix_penalty"] = None
    df["final_score"] = None

    df.loc[candidate_rows, "semantic_score"] = semantic_score
    df.loc[candidate_rows, "suffix_penalty"] = df_candidates[gloss_col].apply(
        _compute_suffix_penalty
    )
    df.loc[candidate_rows, "final_score"] = (
        df.loc[candidate_rows, "semantic_score"] - df.loc[candidate_rows, "suffix_penalty"]
    )

    df["maybe_head_semantics"] = False
    df.loc[candidate_rows, "maybe_head_semantics"] = (
        df.loc[candidate_rows, "final_score"] >= threshold
    )

    stem = path.stem
    scored_path = path.with_name(f"{stem}_semantic_scored.xlsx")
    filtered_path_xlsx = path.with_name(f"{stem}_semantic_filtered.xlsx")
    filtered_path_tsv = path.with_name(f"{stem}_semantic_filtered.tsv")
    try:
        df.to_excel(scored_path, index=False)
        df[df["maybe_head_semantics"]].to_excel(filtered_path_xlsx, index=False)
    except Exception:
        pass

    filtered_df = df[df["maybe_head_semantics"]]
    try:
        filtered_df.to_csv(filtered_path_tsv, sep="\t", index=False)
    except Exception:
        filtered_path_tsv = ""

    tsv_content = filtered_df.to_csv(sep="\t", index=False)

    kept = int(df["maybe_head_semantics"].sum())
    total = int(candidate_rows.sum())
    response = {
        "kept": kept,
        "total": total,
        "threshold": threshold,
        "device": device,
        "tsv_path": str(filtered_path_tsv),
        "scored_path": str(scored_path),
        "filtered_xlsx": str(filtered_path_xlsx),
        "header": list(filtered_df.columns),
        "tsv_content": tsv_content,
    }
    send_response(
        s,
        json.dumps(response),
        content_type="application/json; charset=utf-8",
    )


def _read_tsv_header(path):
    with codecs.open(path, "r", "utf-8") as f:
        line = f.readline()
    if not line:
        return []
    return line.rstrip("\n\r").split("\t")


def _iter_tsv_rows(path, header_len):
    with codecs.open(path, "r", "utf-8") as f:
        _ = f.readline()
        for line in f:
            cells = line.rstrip("\n\r").split("\t")
            if len(cells) < header_len:
                cells += [""] * (header_len - len(cells))
            elif len(cells) > header_len:
                cells = cells[:header_len]
            yield cells


def server_page(s, query, qtype):
    """
    Stream a page of rows from a TSV without loading everything into memory.
    """
    args = {"payload": ""}
    handle_args(args, query, qtype)
    payload = _parse_payload(args)
    if not payload:
        send_response(
            s,
            json.dumps({"error": "Missing payload."}),
            content_type="application/json; charset=utf-8",
        )
        return

    path_str = payload.get("file") or payload.get("path")
    if not path_str:
        send_response(
            s,
            json.dumps({"error": "Missing file path."}),
            content_type="application/json; charset=utf-8",
        )
        return

    path = Path(path_str).expanduser()
    if not path.is_absolute():
        path = Path.cwd().joinpath(path)
    if not path.exists():
        send_response(
            s,
            json.dumps({"error": "File not found.", "detail": str(path)}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        header = _read_tsv_header(path)
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to read header.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    limit = int(payload.get("limit", 50) or 50)
    offset = int(payload.get("offset", 0) or 0)
    columns = payload.get("columns") or []
    columns = [c.strip() for c in columns if c and str(c).strip()]
    column_map = {name.upper(): idx for idx, name in enumerate(header)}
    col_indices = [column_map.get(c.upper()) for c in columns] if columns else list(range(len(header)))
    col_indices = [idx for idx in col_indices if idx is not None]

    # simple filters: doculects, concepts; match case-insensitively
    doculects = set([d.lower() for d in payload.get("doculects", []) if d])
    concepts = set([c.lower() for c in payload.get("concepts", []) if c])

    def match(row):
        if doculects:
            tidx = column_map.get("DOCULECT")
            if tidx is None or row[tidx].lower() not in doculects:
                return False
        if concepts:
            cidx = column_map.get("CONCEPT")
            if cidx is None or row[cidx].lower() not in concepts:
                return False
        return True

    total = 0
    rows = []
    try:
        for cells in _iter_tsv_rows(path, len(header)):
            if not match(cells):
                continue
            if total >= offset and len(rows) < limit:
                rows.append([cells[i] for i in col_indices])
            total += 1
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to stream rows.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    response = {
        "header": [header[i] for i in col_indices],
        "rows": rows,
        "total": total,
        "offset": offset,
        "limit": limit,
        "file": str(path),
    }
    send_response(
        s,
        json.dumps(response),
        content_type="application/json; charset=utf-8",
    )


def server_export(s, query, qtype):
    """
    Export filtered TSV (server-side) without loading in front-end.
    Supports optional offset/limit to export only a slice of rows.
    """
    args = {"payload": ""}
    handle_args(args, query, qtype)
    payload = _parse_payload(args)
    if not payload:
        send_response(
            s,
            json.dumps({"error": "Missing payload."}),
            content_type="application/json; charset=utf-8",
        )
        return

    path_str = payload.get("file") or payload.get("path")
    if not path_str:
        send_response(
            s,
            json.dumps({"error": "Missing file path."}),
            content_type="application/json; charset=utf-8",
        )
        return

    path = Path(path_str).expanduser()
    if not path.is_absolute():
        path = Path.cwd().joinpath(path)
    if not path.exists():
        send_response(
            s,
            json.dumps({"error": "File not found.", "detail": str(path)}),
            content_type="application/json; charset=utf-8",
        )
        return

    try:
        header = _read_tsv_header(path)
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to read header.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    columns = payload.get("columns") or []
    columns = [c.strip() for c in columns if c and str(c).strip()]
    column_map = {name.upper(): idx for idx, name in enumerate(header)}
    col_indices = [column_map.get(c.upper()) for c in columns] if columns else list(range(len(header)))
    col_indices = [idx for idx in col_indices if idx is not None]

    doculects = set([d.lower() for d in payload.get("doculects", []) if d])
    concepts = set([c.lower() for c in payload.get("concepts", []) if c])

    offset = int(payload.get("offset", 0) or 0)
    export_limit = payload.get("export_limit", None)
    if export_limit is None:
        export_limit = payload.get("limit", None)
    export_limit = int(export_limit) if export_limit not in (None, "", False) else None

    def match(row):
        if doculects:
            tidx = column_map.get("DOCULECT")
            if tidx is None or row[tidx].lower() not in doculects:
                return False
        if concepts:
            cidx = column_map.get("CONCEPT")
            if cidx is None or row[cidx].lower() not in concepts:
                return False
        return True

    lines = []
    header_out = [header[i] for i in col_indices]
    lines.append("\t".join(header_out))
    matched = 0
    try:
        for cells in _iter_tsv_rows(path, len(header)):
            if not match(cells):
                continue
            if matched < offset:
                matched += 1
                continue
            if export_limit is not None and (matched - offset) >= export_limit:
                break
            matched += 1
            lines.append("\t".join([cells[i] for i in col_indices]))
    except Exception as exc:
        send_response(
            s,
            json.dumps({"error": "Failed to export.", "detail": str(exc)}),
            content_type="application/json; charset=utf-8",
        )
        return

    content = "\n".join(lines)
    send_response(
        s,
        content,
        content_type="text/plain; charset=utf-8",
        content_disposition='attachment; filename="filtered.tsv"',
    )


def triples(s, query, qtype, conf):
    """
    Basic access to the triple storage storing data in SQLITE.
    """
    args = dict(
        remote_dbase='',
        file='',
        columns='',
        concepts='',
        doculects='',
    )
    handle_args(args, query, qtype)

    if conf.get("remote") and args["remote_dbase"] in conf["remote"]:  # pragma: no cover
        print("EDICTOR loading remote TSV file.")
        info = conf["remote"][args["remote_dbase"]]["triples.py"]
        req = urllib.request.Request(
            info["url"],
            data=bytes(info["data"], "utf-8"))
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        req.get_method = lambda: 'POST'
        data = urllib.request.urlopen(req).read()
        send_response(
            s,
            data,
            encode=False,
            content_type="text/plain; charset=utf-8",
            content_disposition='attachment; filename="triples.tsv"'
        )
        return

    db, cursor = opendb(args["remote_dbase"], conf)

    # get unique columns
    if not args['columns']:
        cols = get_columns(cursor, args['file'])
    else:
        cols = args['columns'].split('%7C')

    text = 'ID\t' + '\t'.join(cols) + '\n'

    # if neither concepts or doculects are passed from the args, all ids are
    # selected from the database
    if not args['concepts'] and not args['doculects']:
        idxs = [line[0] for line in cursor.execute(
            'select distinct ID from ' + args['file'] + ';')]
    else:
        # we evaluate the concept string
        if args['concepts']:
            cstring = 'COL = "CONCEPT" and VAL in ("' + \
                      '","'.join(args['concepts'].split('%7C')) + '")'
        else:
            cstring = ''
        if args['doculects']:
            dstring = 'COL = "DOCULECT" and VAL in ("' + \
                      '","'.join(args['doculects'].split('%7C')) + '")'
        else:
            dstring = ''

        if cstring:
            cidxs = [line[0] for line in cursor.execute(
                'select distinct ID from ' + args['file'] + ' where ' + cstring)]
        else:
            cidxs = []
        if dstring:
            didxs = [line[0] for line in cursor.execute(
                'select distinct ID from ' + args['file'] + ' where ' + dstring)]
        else:
            didxs = []

        if cidxs and didxs:
            idxs = [idx for idx in cidxs if idx in didxs]
        else:
            idxs = cidxs or didxs

    # make the dictionary
    D = {}
    for a, b, c in cursor.execute('select * from ' + args['file'] + ';'):
        if c not in ['-', '']:
            try:
                D[a][b] = c
            except KeyError:
                D[a] = {b: c}

    # make object
    for idx in idxs:
        txt = str(idx)
        for col in cols:
            try:
                txt += '\t' + D[idx][col]
            except IndexError:
                txt += '\t'
            except ValueError:
                txt += "\t"
            except KeyError:
                txt += "\t"
        text += txt + "\n"
    send_response(s, text, content_type="text/plain; charset=utf-8",
                  content_disposition='attachment; filename="triples.tsv"')


# noinspection SqlDialectInspection,SqlNoDataSourceInspection,SqlResolve
def modifications(s, post, qtype, conf):
    """
    Check for remote modifications in the data, done in another application.
    
    Note
    ----
    This operation is not only useful when working with many people, but also
    when working on a local host but with multiple windows open. The call
    checks for recently modified data in the database and inserts them into the
    wordlist, if modifications are detected. It is triggered in certain
    intervals, but mostly dependent on the use of the Wordlist Panel of the
    EDICTOR.
    """
    now = str(datetime.now()).split('.')[0]
    args = {}
    handle_args(args, post, qtype)

    if not "remote_dbase" in args:
        return

    if conf.get("remote") and args["remote_dbase"] in conf["remote"]:  # pragma: no cover
        print("EDICTOR checking for modifications in remote data.")
        info = conf["remote"][args["remote_dbase"]]["modifications.py"]
        data = info["data"] + "&date=" + args["date"]
        req = urllib.request.Request(
            info["url"],
            data=bytes(info["data"], "utf-8"))
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        req.get_method = lambda: 'POST'
        data = urllib.request.urlopen(req).read()
        send_response(
            s,
            data,
            encode=False,
            content_type="text/plain; charset=utf-8",
            content_disposition='attachment; filename="triples.tsv"'
        )
        return

    db, cursor = opendb(args["remote_dbase"], conf)
    cursor.execute(
        'select ID, COL from backup where FILE="' + args['file'] + '"' +
        ' and DATE > ' + args['date'] +
        ' group by ID,COL limit 100;')
    lines = cursor.fetchall()
    data = dict([((a, b), c) for a, b, c in cursor.execute(
        'select * from ' + args['file'] + ';'
    )])
    message = ""
    for line in lines:
        try:
            val = data[line[0], line[1]].encode('utf-8')
            message += '{0}\t{1}\t{2}\n'.format(line[0], line[1], val)
        except KeyError:
            pass
    send_response(s, message)


# noinspection SqlResolve
def update(s, post, qtype, conf):
    """
    Update data on local or remote SQLite file.
    
    Note
    ----
    The update routine is carried out with a post-request that is sent to the
    local host, or by sending a get request to the remote host (which must be
    specified in the configuration file). 
    """

    now = str(datetime.now()).split('.')[0]
    args = {}
    handle_args(args, post, qtype)

    if conf.get("remote") and args["remote_dbase"] in conf["remote"]:  # pragma: no cover
        print("send remote data")
        info = conf["remote"][args["remote_dbase"]]["update.py"]
        url = info["url"]
        data = info["data"]
        if "update" in args:
            data += "&ID=" + args["ids"].replace("%7C%7C%7C", "|||")
            data += "&COL=" + args["cols"].replace("%7C%7C%7C", "|||")
            data += "&VAL=" + args["vals"].replace("%7C%7C%7C", "|||")
            data += "&update=true"
        elif "delete" in args:
            data += "&ID=" + args["ID"] + "&delete=true"

        passman = urllib.request.HTTPPasswordMgrWithDefaultRealm()
        passman.add_password(None, url, conf["user"], conf["pw"])

        authhandler = urllib.request.HTTPBasicAuthHandler(passman)
        opener = urllib.request.build_opener(authhandler)
        urllib.request.install_opener(opener)

        req = urllib.request.Request(
            info["url"],
            data=bytes(data, "utf-8"))
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        req.get_method = lambda: 'POST'
        res = urllib.request.urlopen(req)
        message = res.read()
        send_response(s, message, encode=False)
        return

    db, cursor = opendb(args["remote_dbase"], conf)

    if "update" in args:
        idxs = urllib.parse.unquote(args['ids']).split("|||")
        cols = urllib.parse.unquote(args['cols']).split("|||")
        vals = urllib.parse.unquote(args['vals']).split("|||")

        # iterate over the entries
        if len(idxs) == len(cols) == len(vals):
            pass
        else:
            print('ERROR: wrong values submitted')
            return
        for idx, col, val in zip(idxs, cols, vals):

            # unquote the value
            val = urllib.parse.unquote(val)

            # check for quote characters
            if '"' in val:
                val = val.replace('"', '""')

            # get original data value
            try:
                orig_val = [x for x in cursor.execute(
                    'select VAL from ' + args['file'] + ' where ID=' + \
                    idx + ' and COL like "' + col + '";')][0][0]

                qstring = 'update ' + args[
                    'file'] + ' set VAL="' + val + '" where ID=' + idx + ' and COL="' + col + '";'
                cursor.execute(
                    qstring
                )

                message = 'UPDATE: Modification successful replace "{0}" with "{1}" on {2}.'.format(
                    orig_val.encode('utf-8'),
                    val,
                    now)

            except IndexError:
                orig_val = '!newvalue!'

                # create new datum if value has not been retrieved
                cursor.execute(
                    'insert into ' + args['file'] + ' values(' +
                    idx + ',"' + col + '","' +
                    val + '");')
                message = 'INSERTION: Successfully inserted {0} on {1}'.format(
                    val, now)

            # modify original value with double quotes for safety
            if '"' in orig_val:
                orig_val = orig_val.replace('"', '""')

            # insert the backup line
            try:
                # noinspection SqlDialectInspection,SqlResolve
                cursor.execute(
                    'insert into backup values(?,?,?,?,strftime("%s","now"),?);',
                    (
                        args['file'],
                        idx,
                        col,
                        orig_val,
                        conf["user"]
                    ))
            except Exception as e:
                print(e)
                message = 'ERROR'

        db.commit()

    elif "delete" in args:
        lines = [line for line in cursor.execute(
            'select * from ' + args['file'] + ' where ID=' + args['ID'] + ';'
        )]
        for idx, col, val in lines:
            cursor.execute(
                'insert into backup values(?,?,?,?,strftime("%s","now"),?);',
                (args['file'], idx, col, val, conf["user"]))
            cursor.execute(
                'delete from ' + args['file'] + ' where ID=' + args['ID'] + ';')
        db.commit()
        message = 'DELETION: Successfully deleted all entries for ID {0} on {1}.'.format(
            args['ID'],
            now)
    send_response(s, message)


def quit(s):
    """
    Exit the application.

    :param s: server
    :return:
    """
    send_response(s, "Terminated the application.")
    os.kill(os.getpid(), signal.SIGTERM)


