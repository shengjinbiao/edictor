import json
import locale
import traceback
from collections import defaultdict


def _require_panphon():
    import locale
    prev = locale.getpreferredencoding
    locale.getpreferredencoding = lambda _do_setlocale=True: "utf-8"
    try:
        import panphon  # noqa: F401
    except Exception:
        return False
    finally:
        locale.getpreferredencoding = prev
    return True


def _patch_panphon_utf8(panphon):
    import importlib.resources as resources
    import pandas as pd
    from panphon.featuretable import FeatureTable
    from panphon.segment import Segment

    def _read_bases(self, fn, weights):
        spec_to_int = {"+": 1, "0": 0, "-": -1}
        with resources.files("panphon").joinpath(fn).open(encoding="utf-8") as f:
            df = pd.read_csv(f)
        df["ipa"] = df["ipa"].apply(self.normalize)
        feature_names = list(df.columns[1:])
        df[feature_names] = df[feature_names].map(lambda x: spec_to_int[x])
        segments = [
            (row["ipa"], Segment(feature_names, row[1:].to_dict(), weights=weights))
            for (_, row) in df.iterrows()
        ]
        seg_dict = dict(segments)
        return segments, seg_dict, feature_names

    def _read_weights(self, weights_fn):
        with resources.files("panphon").joinpath(weights_fn).open(encoding="utf-8") as f:
            df = pd.read_csv(f)
        return df.iloc[0].astype(float).tolist()

    FeatureTable._read_bases = _read_bases
    FeatureTable._read_weights = _read_weights


def _feature_table():
    import panphon
    prev = locale.getpreferredencoding
    locale.getpreferredencoding = lambda _do_setlocale=True: "utf-8"
    try:
        try:
            ft = panphon.FeatureTable()
        except UnicodeDecodeError:
            _patch_panphon_utf8(panphon)
            ft = panphon.FeatureTable()
    finally:
        locale.getpreferredencoding = prev
    return ft, ft.names, [0] * len(ft.names)


def _segment_vectors(ft, zero, segs):
    out = []
    s2n = {"+": 1, "0": 0, "-": -1}
    for seg in segs:
        vec = None
        try:
            seg_obj = ft.fts(seg, normalize=True)
        except Exception:
            seg_obj = None
        if seg_obj is None:
            vec = zero[:]
        elif hasattr(seg_obj, "numeric"):
            vec = seg_obj.numeric()
        elif isinstance(seg_obj, dict):
            if not seg_obj:
                vec = zero[:]
            else:
                tmp = []
                for name in ft.names:
                    val = seg_obj.get(name, 0)
                    if isinstance(val, str):
                        val = s2n.get(val, 0)
                    tmp.append(val)
                vec = tmp
        else:
            vec = zero[:]
        out.append(vec)
    return out


def _feature_distance(vec_a, vec_b, names=None):
    if not vec_a or not vec_b:
        return 1.0
    if len(vec_a) != len(vec_b):
        return 1.0
    total = sum(abs(a - b) for a, b in zip(vec_a, vec_b))
    base = total / (2.0 * len(vec_a))
    penalty = 0.0
    if names:
        idx = {name: i for i, name in enumerate(names)}
        def _val(name):
            i = idx.get(name)
            if i is None:
                return 0
            return vec_a[i], vec_b[i]
        cons = _val("cons")
        syl = _val("syl")
        son = _val("son")
        if cons and cons[0] * cons[1] < 0:
            penalty += 0.6
        if syl and syl[0] * syl[1] < 0:
            penalty += 0.4
        if son and son[0] * son[1] < 0:
            penalty += 0.2
    return min(1.5, base + penalty)


def _sequence_distance(seq_a, seq_b, ft, zero):
    if not seq_a and not seq_b:
        return 0.0
    if not seq_a or not seq_b:
        return 1.0
    vecs_a = _segment_vectors(ft, zero, seq_a)
    vecs_b = _segment_vectors(ft, zero, seq_b)
    names = ft.names
    len_a = len(seq_a)
    len_b = len(seq_b)
    dp = [[0.0] * (len_b + 1) for _ in range(len_a + 1)]
    for i in range(1, len_a + 1):
        dp[i][0] = float(i)
    for j in range(1, len_b + 1):
        dp[0][j] = float(j)
    for i in range(1, len_a + 1):
        for j in range(1, len_b + 1):
            sub = _feature_distance(vecs_a[i - 1], vecs_b[j - 1], names)
            dp[i][j] = min(
                dp[i - 1][j] + 1.0,
                dp[i][j - 1] + 1.0,
                dp[i - 1][j - 1] + sub
            )
    return dp[len_a][len_b] / max(len_a, len_b)


def _align_pair(seq_a, seq_b, ft, zero):
    len_a = len(seq_a)
    len_b = len(seq_b)
    vecs_a = _segment_vectors(ft, zero, seq_a)
    vecs_b = _segment_vectors(ft, zero, seq_b)
    names = ft.names
    dp = [[0.0] * (len_b + 1) for _ in range(len_a + 1)]
    back = [[None] * (len_b + 1) for _ in range(len_a + 1)]
    for i in range(1, len_a + 1):
        dp[i][0] = float(i)
        back[i][0] = "del"
    for j in range(1, len_b + 1):
        dp[0][j] = float(j)
        back[0][j] = "ins"
    back[0][0] = "end"
    for i in range(1, len_a + 1):
        for j in range(1, len_b + 1):
            sub = dp[i - 1][j - 1] + _feature_distance(vecs_a[i - 1], vecs_b[j - 1], names)
            dele = dp[i - 1][j] + 1.0
            ins = dp[i][j - 1] + 1.0
            best = min(sub, dele, ins)
            dp[i][j] = best
            if best == sub:
                back[i][j] = "sub"
            elif best == dele:
                back[i][j] = "del"
            else:
                back[i][j] = "ins"
    i = len_a
    j = len_b
    alm_a = []
    alm_b = []
    while not (i == 0 and j == 0):
        step = back[i][j]
        if step == "sub":
            alm_a.append(seq_a[i - 1])
            alm_b.append(seq_b[j - 1])
            i -= 1
            j -= 1
        elif step == "del":
            alm_a.append(seq_a[i - 1])
            alm_b.append("-")
            i -= 1
        else:
            alm_a.append("-")
            alm_b.append(seq_b[j - 1])
            j -= 1
    alm_a.reverse()
    alm_b.reverse()
    return alm_a, alm_b


def _multi_align(seqs, ft, zero):
    if not seqs:
        return []
    idx = max(range(len(seqs)), key=lambda i: len(seqs[i]))
    reference = seqs[idx]
    gaps = [0] * (len(reference) + 1)
    alignments = [None] * len(seqs)
    for i, seq in enumerate(seqs):
        if i == idx:
            continue
        alm_a, alm_b = _align_pair(reference, seq, ft, zero)
        alignments[i] = (alm_a, alm_b)
        counter = 0
        gcount = 0
        for seg in alm_a:
            if seg == "-":
                gcount += 1
                if gcount > gaps[counter]:
                    gaps[counter] = gcount
            else:
                counter += 1
                gcount = 0
    gapped = []
    for i, gap in enumerate(gaps):
        if i < len(reference):
            if gap == 0:
                gapped.append(1)
            else:
                gapped.extend([0] * gap)
                gapped.append(1)
        else:
            if gap > 0:
                gapped.extend([0] * gap)
    out = []
    for i in range(len(seqs)):
        if i == idx:
            alm_out = []
            counter = 0
            for g in gapped:
                if g == 1:
                    alm_out.append(reference[counter])
                    counter += 1
                else:
                    alm_out.append("-")
            out.append(alm_out)
        else:
            alm_a, alm_b = alignments[i]
            alm_out = []
            counter = 0
            for g in gapped:
                if g == 1:
                    alm_out.append(alm_b[counter] if counter < len(alm_b) else "-")
                    counter += 1
                else:
                    if counter < len(alm_a) and alm_a[counter] == "-":
                        alm_out.append(alm_b[counter] if counter < len(alm_b) else "-")
                        counter += 1
                    else:
                        alm_out.append("-")
            out.append(alm_out)
    return out


def _parse_wordlist(wordlist, with_cognates=False, with_alignments=False):
    rows = []
    for line in wordlist.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        idx = parts[0]
        doculect = parts[1]
        concept = parts[2]
        tokens = parts[3].split(" ") if parts[3] else []
        row = {
            "idx": idx,
            "doculect": doculect,
            "concept": concept,
            "tokens": tokens
        }
        cursor = 4
        if with_cognates:
            row["cogid"] = parts[cursor] if cursor < len(parts) else ""
            cursor += 1
        if with_alignments:
            row["alignment"] = parts[cursor].split(" ") if cursor < len(parts) and parts[cursor] else []
        rows.append(row)
    return rows


def _vectorize(rows):
    ft, names, zero = _feature_table()
    values = {}
    for row in rows:
        vecs = _segment_vectors(ft, zero, row["tokens"])
        values[row["idx"]] = json.dumps(vecs, ensure_ascii=False)
    return {"column": "FEAT_VEC", "values": values, "features": names}


def _cognates(rows):
    ft, _names, zero = _feature_table()
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["concept"]].append(row)
    next_id = 1
    values = {}
    for _concept, items in grouped.items():
        parent = list(range(len(items)))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra = find(a)
            rb = find(b)
            if ra != rb:
                parent[rb] = ra

        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                dist = _sequence_distance(items[i]["tokens"], items[j]["tokens"], ft, zero)
                if dist <= 0.45:
                    union(i, j)

        clusters = {}
        for i in range(len(items)):
            root = find(i)
            if root not in clusters:
                clusters[root] = next_id
                next_id += 1
            values[items[i]["idx"]] = str(clusters[root])
    return {"column": "FEAT_COGID", "values": values}


def _align(rows):
    ft, _names, zero = _feature_table()
    groups = defaultdict(list)
    for row in rows:
        cogid = row.get("cogid", "")
        if not cogid:
            continue
        groups[cogid].append(row)
    values = {}
    for _cogid, items in groups.items():
        seqs = [row["tokens"] for row in items]
        alms = _multi_align(seqs, ft, zero)
        for row, alm in zip(items, alms):
            values[row["idx"]] = " ".join(alm)
    return {"column": "FEAT_ALIGN", "values": values}


def _distances(rows):
    ft, _names, zero = _feature_table()
    by_concept = defaultdict(dict)
    taxa = []
    if not rows:
        return {"error": "No rows available for distances."}
    for row in rows:
        taxon = row["doculect"]
        concept = row["concept"]
        if taxon not in taxa:
            taxa.append(taxon)
        if taxon not in by_concept[concept]:
            by_concept[concept][taxon] = row["tokens"]
    n = len(taxa)
    matrix = [[0.0] * n for _ in range(n)]
    empty_pairs = 0
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dists = []
            for concept, entries in by_concept.items():
                if taxa[i] in entries and taxa[j] in entries:
                    dists.append(_sequence_distance(entries[taxa[i]], entries[taxa[j]], ft, zero))
            if dists:
                matrix[i][j] = sum(dists) / len(dists)
            else:
                matrix[i][j] = 1.0
                empty_pairs += 1
    newick = ""
    ascii_tree = ""
    taxa_map = {}
    try:
        from lingpy.algorithm.clustering import neighbor, upgma
        from lingpy.convert.strings import matrix2dst
        from lingpy import Tree
        tree_method = "neighbor"
        safe_taxa, taxa_map = _sanitize_taxa(taxa)
        if tree_method == "neighbor":
            newick = neighbor(matrix, safe_taxa)
        else:
            newick = upgma(matrix, safe_taxa)
        if newick:
            ascii_tree = Tree(newick).asciiArt()
        phylip = matrix2dst(matrix, taxa)
    except Exception:
        phylip = _matrix_to_phylip(matrix, taxa)
        if not newick:
            safe_taxa, taxa_map = _sanitize_taxa(taxa)
            newick = _upgma_newick(matrix, safe_taxa)
    downloads = {"feat_distances.dst": phylip}
    if newick:
        downloads["feat_tree.nwk"] = newick
        downloads["feat_tree.txt"] = ascii_tree
    first_idx = rows[0]["idx"]
    columns = [
        {"name": "FEAT_DIST", "values": {first_idx: "feat_distances.dst"}}
    ]
    if newick:
        columns.append({"name": "FEAT_TREE", "values": {first_idx: newick}})
    payload = {
        "matrix": matrix,
        "taxa": taxa,
        "tree": newick,
        "ascii": ascii_tree,
        "downloads": downloads,
        "columns": columns,
        "message": "Feature distances computed."
    }
    return payload


def _matrix_to_phylip(matrix, taxa):
    lines = [str(len(taxa))]
    for name, row in zip(taxa, matrix):
        label = (name[:10]).ljust(10)
        lines.append(label + " " + " ".join(f"{v:.4f}" for v in row))
    return "\n".join(lines)


def _sanitize_taxa(names):
    forbidden = set("():;,")
    safe = []
    mapping = {}
    for name in names:
        cleaned = "".join("_" if ch in forbidden else ch for ch in name)
        mapping[cleaned] = name
        safe.append(cleaned)
    return safe, mapping


def _upgma_newick(matrix, taxa):
    if not taxa or len(taxa) < 2:
        return ""
    n = len(taxa)
    clusters = {}
    for i in range(n):
        clusters[i] = {
            "name": taxa[i],
            "size": 1,
            "height": 0.0
        }
    dist = {}
    for i in range(n):
        for j in range(i + 1, n):
            dist[(i, j)] = float(matrix[i][j])
    next_id = n
    while len(clusters) > 1:
        pair = min(dist, key=dist.get)
        i, j = pair
        dij = dist[pair]
        ci = clusters[i]
        cj = clusters[j]
        new_height = dij / 2.0
        bi = max(0.0, new_height - ci["height"])
        bj = max(0.0, new_height - cj["height"])
        new_name = f"({ci['name']}:{bi:.4f},{cj['name']}:{bj:.4f})"
        new_size = ci["size"] + cj["size"]
        new_id = next_id
        next_id += 1
        clusters[new_id] = {"name": new_name, "size": new_size, "height": new_height}
        keys = list(clusters.keys())
        for k in keys:
            if k in (i, j, new_id):
                continue
            dk = dist[(min(i, k), max(i, k))]
            djk = dist[(min(j, k), max(j, k))]
            dnew = (dk * ci["size"] + djk * cj["size"]) / new_size
            dist[(min(new_id, k), max(new_id, k))] = dnew
        dist = {k: v for k, v in dist.items() if i not in k and j not in k}
        del clusters[i]
        del clusters[j]
    return list(clusters.values())[0]["name"] + ";"


def _soundchange(rows):
    counts = defaultdict(int)
    groups = defaultdict(list)
    if not rows:
        return {"error": "No rows available for soundchange."}
    for row in rows:
        alm = row.get("alignment", [])
        if not alm:
            continue
        groups[row["concept"]].append((row["doculect"], alm))
    for _concept, items in groups.items():
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                alm_a = items[i][1]
                alm_b = items[j][1]
                for a, b in zip(alm_a, alm_b):
                    if a == "-" or b == "-" or a == b:
                        continue
                    counts[(a, b)] += 1
                    counts[(b, a)] += 1
    edges = sorted(
        ((src, tgt, count) for (src, tgt), count in counts.items()),
        key=lambda x: (-x[2], x[0], x[1])
    )
    lines = ["SOURCE\tTARGET\tCOUNT"]
    for src, tgt, count in edges:
        lines.append(f"{src}\t{tgt}\t{count}")
    first_idx = rows[0]["idx"]
    return {
        "downloads": {"feat_soundchange.tsv": "\n".join(lines)},
        "columns": [{"name": "FEAT_SNDCHAIN", "values": {first_idx: str(len(counts))}}],
        "edges": edges,
        "message": "Soundchange table generated."
    }


def handle_feature_request(args):
    """
    Handle feature-based requests from the front-end.

    Expected args:
      - action: pipeline action name
      - wordlist: TSV payload
    """
    try:
        action = (args.get("action") or "").strip().lower()
        if not _require_panphon():
            return {"error": "PanPhon is not available in this Python environment."}
        wordlist = args.get("wordlist") or ""
        if not wordlist.strip():
            return {"error": "Missing wordlist."}
        if action == "vectorize":
            rows = _parse_wordlist(wordlist)
            return _vectorize(rows)
        if action == "cognates":
            rows = _parse_wordlist(wordlist)
            return _cognates(rows)
        if action == "align":
            rows = _parse_wordlist(wordlist, with_cognates=True)
            return _align(rows)
        if action == "distances":
            rows = _parse_wordlist(wordlist)
            return _distances(rows)
        if action == "soundchange":
            rows = _parse_wordlist(wordlist, with_alignments=True)
            return _soundchange(rows)
        return {"error": "Unknown action: " + action}
    except Exception:
        return {
            "error": "Feature backend error.",
            "detail": traceback.format_exc()
        }
