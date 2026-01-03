var SND = {
  data: null,
  concept: "",
  segments: {},
  pairs: {},
  langPairs: {},
  langPairDetails: {},
  langCounts: {},
  wordForms: []
};

SND._clear = function () {
  SND.data = null;
  SND.concept = "";
  SND.segments = {};
  SND.pairs = {};
  SND.langPairs = {};
  SND.langPairDetails = {};
  SND.langCounts = {};
  SND.wordForms = [];
};

SND._collectConceptIndices = function (concept) {
  if (!WLS || !WLS.concepts || !concept) { return []; }
  if (WLS.concepts.hasOwnProperty(concept)) {
    return WLS.concepts[concept].slice();
  }
  return [];
};

SND._getAlignParts = function (idx) {
  var alIdx = CFG._alignments;
  var raw = "";
  if (typeof alIdx === "number" && alIdx > -1 && WLS[idx][alIdx]) {
    raw = String(WLS[idx][alIdx]).trim();
  } else {
    var segIdx = CFG._segments;
    if (typeof segIdx === "number" && segIdx > -1 && WLS[idx][segIdx]) {
      raw = String(WLS[idx][segIdx]).trim();
    }
  }
  if (!raw) { return []; }
  var parts = raw.split(/\s+\+\s+/);
  if (parts.length === 1) { parts = [raw]; }
  return parts.map(function (part) {
    return part.split(/\s+/).filter(function (t) { return t && t !== "+"; });
  });
};

SND._getCogidParts = function (idx, cogIdx) {
  if (typeof cogIdx !== "number" || cogIdx < 0) { return []; }
  var raw = WLS[idx][cogIdx];
  if (raw === undefined || raw === null) { return []; }
  var text = String(raw).trim();
  if (!text) { return []; }
  if (text.indexOf("+") > -1) {
    return text.split(/\s*\+\s*/).filter(function (p) { return p; });
  }
  return text.split(/\s+/).filter(function (p) { return p; });
};

SND._getAlignTokens = function (idx) {
  var alIdx = CFG._alignments;
  if (typeof alIdx === "number" && alIdx > -1 && WLS[idx][alIdx]) {
    return String(WLS[idx][alIdx]).trim().split(/\s+/).filter(function (t) {
      return t && t !== "+";
    });
  }
  var segIdx = CFG._segments;
  if (typeof segIdx === "number" && segIdx > -1 && WLS[idx][segIdx]) {
    return String(WLS[idx][segIdx]).trim().split(/\s+/).filter(function (t) {
      return t && t !== "+";
    });
  }
  return [];
};

SND._addCount = function (obj, key, inc) {
  if (!obj.hasOwnProperty(key)) { obj[key] = 0; }
  obj[key] += (inc || 1);
};

SND._pairKey = function (a, b) {
  return (a <= b) ? (a + "||" + b) : (b + "||" + a);
};

SND._langKey = function (a, b) {
  return (a <= b) ? (a + "||" + b) : (b + "||" + a);
};

SND._compute = function (indices, cogIdx, mode) {
  var groups = {};
  for (var i = 0; i < indices.length; i += 1) {
    var idx = indices[i];
    if (mode === "partial") {
      var parts = SND._getCogidParts(idx, cogIdx);
      for (var p = 0; p < parts.length; p += 1) {
        var pid = parts[p];
        if (!pid) { continue; }
        if (!groups.hasOwnProperty(pid)) { groups[pid] = []; }
        groups[pid].push({ idx: idx, partIndex: p });
      }
    } else {
      var cog = WLS[idx][cogIdx];
      if (cog === undefined || cog === null) { continue; }
      var cogid = String(cog).split(/\s+/)[0];
      if (!groups.hasOwnProperty(cogid)) { groups[cogid] = []; }
      groups[cogid].push({ idx: idx, partIndex: 0 });
    }
  }

  for (var key in groups) {
    var rows = groups[key];
    if (rows.length < 2) { continue; }
    var entries = [];
    var maxLen = 0;
    for (var j = 0; j < rows.length; j += 1) {
      var idx = rows[j].idx;
      var partIndex = rows[j].partIndex || 0;
      var lang = WLS[idx][CFG._taxa];
      var toks = [];
      if (mode === "partial") {
        var partsTokens = SND._getAlignParts(idx);
        toks = (partIndex < partsTokens.length) ? partsTokens[partIndex] : [];
      } else {
        toks = SND._getAlignTokens(idx);
      }
      if (!toks.length) { continue; }
      maxLen = Math.max(maxLen, toks.length);
      entries.push({ lang: lang, tokens: toks });
      SND._addCount(SND.langCounts, lang, 1);
    }
    if (entries.length < 2 || maxLen === 0) { continue; }

    for (var pos = 0; pos < maxLen; pos += 1) {
      var col = [];
      for (var k = 0; k < entries.length; k += 1) {
        var tok = entries[k].tokens[pos] || "-";
        col.push({ lang: entries[k].lang, tok: tok });
      }
      for (var a = 0; a < col.length; a += 1) {
        var ta = col[a].tok;
        if (!ta || ta === "-") { continue; }
        SND._addCount(SND.segments, ta, 1);
        for (var b = a + 1; b < col.length; b += 1) {
          var tb = col[b].tok;
          if (!tb || tb === "-") { continue; }
          var pkey = SND._pairKey(ta, tb);
          SND._addCount(SND.pairs, pkey, 1);

          var lkey = SND._langKey(col[a].lang, col[b].lang);
          SND._addCount(SND.langPairs, lkey, 1);
          if (!SND.langPairDetails[lkey]) { SND.langPairDetails[lkey] = {}; }
          SND._addCount(SND.langPairDetails[lkey], pkey, 1);
        }
      }
    }
  }
};

SND._renderSummary = function (indices) {
  var summary = document.getElementById("soundchange_summary");
  if (!summary) { return; }
  summary.textContent = "概念: " + SND.concept + " | 行数: " + indices.length +
    " | 对应对数: " + Object.keys(SND.pairs).length +
    " | 语言数: " + Object.keys(SND.langCounts).length;
};

SND._setStatus = function (msg, isError) {
  var summary = document.getElementById("soundchange_summary");
  if (!summary) { return; }
  summary.textContent = msg || "";
  summary.style.color = isError ? "#b94a48" : "#333";
};

SND._appendLog = function (msg) {
  var log = document.getElementById("soundchange_log");
  if (!log) { return; }
  var line = document.createElement("div");
  line.textContent = msg;
  log.appendChild(line);
};

SND._clearLog = function () {
  var log = document.getElementById("soundchange_log");
  if (log) { log.innerHTML = ""; }
};

SND._renderParams = function (topN, minCount, indices, mode) {
  var params = document.getElementById("soundchange_params");
  if (!params) { return; }
  var al = (typeof CFG._alignments === "number" && CFG._alignments > -1) ? WLS.header[CFG._alignments] : "TOKENS";
  var tok = (typeof CFG._segments === "number" && CFG._segments > -1) ? WLS.header[CFG._segments] : "-";
  var cog = "-";
  if (mode === "partial") {
    cog = (typeof CFG._roots === "number" && CFG._roots > -1) ? WLS.header[CFG._roots] : "-";
  } else {
    cog = (typeof CFG._cognates === "number" && CFG._cognates > -1) ? WLS.header[CFG._cognates] : "-";
  }
  var modeLabel = (mode === "partial") ? "PARTIAL" : "FULL";
  params.innerHTML = ""
    + "<div>Mode: " + modeLabel + "</div>"
    + "<div>Concept: " + SND.concept + "</div>"
    + "<div>Rows: " + indices.length + "</div>"
    + "<div>COGID column: " + cog + "</div>"
    + "<div>ALIGNMENT column: " + al + "</div>"
    + "<div>TOKENS column: " + tok + "</div>"
    + "<div>Top N segments: " + topN + "</div>"
    + "<div>Min count: " + minCount + "</div>";
};

SND._renderNotes = function () {
  var notes = document.getElementById("soundchange_notes");
  if (!notes) { return; }
  notes.innerHTML = ""
    + "<p>算法：对指定概念的同源词按列对齐，统计同列音段的两两共现次数。</p>"
    + "<p>如果存在 ALIGNMENT 列则优先使用；否则回退到 TOKENS 列。</p>"
    + "<p>语言网络：基于语言间共现对数构边，并附带最常见的音段对应。</p>";
};

SND._renderList = function (minCount) {
  var container = document.getElementById("soundchange_list");
  if (!container) { return; }
  var items = [];
  for (var key in SND.pairs) {
    if (SND.pairs[key] >= minCount) {
      items.push([key, SND.pairs[key]]);
    }
  }
  items.sort(function (a, b) { return b[1] - a[1]; });
  var html = '<table class="data_table2"><tr><th>Correspondence</th><th>Count</th></tr>';
  for (var i = 0; i < items.length; i += 1) {
    var pair = items[i][0].replace("||", " ~ ");
    html += "<tr><td>" + pair + "</td><td>" + items[i][1] + "</td></tr>";
    if (i > 200) { break; }
  }
  html += "</table>";
  container.innerHTML = html;
};

SND._renderHeatmap = function (topN) {
  var container = document.getElementById("soundchange_heatmap");
  if (!container) { return; }
  var segs = Object.keys(SND.segments).map(function (s) { return [s, SND.segments[s]]; });
  segs.sort(function (a, b) { return b[1] - a[1]; });
  segs = segs.slice(0, topN).map(function (x) { return x[0]; });
  if (!segs.length) {
    container.innerHTML = "<p>No segments found.</p>";
    return;
  }
  var html = '<table class="data_table2"><tr><th></th>';
  for (var i = 0; i < segs.length; i += 1) {
    html += "<th>" + segs[i] + "</th>";
  }
  html += "</tr>";
  for (var r = 0; r < segs.length; r += 1) {
    html += "<tr><th>" + segs[r] + "</th>";
    for (var c = 0; c < segs.length; c += 1) {
      var key = SND._pairKey(segs[r], segs[c]);
      var val = SND.pairs[key] || 0;
      var shade = val === 0 ? "#f7f7f7" : "#d0e1f2";
      html += '<td style="background:' + shade + '">' + val + "</td>";
    }
    html += "</tr>";
  }
  html += "</table>";
  container.innerHTML = html;
};

SND._getFeatureVector = function (seg) {
  if (typeof getSoundDescription !== "function") { return null; }
  var type = getSoundDescription(seg, "type", true);
  if (!type) { return null; }
  return {
    type: String(type).trim().toLowerCase(),
    place: String(getSoundDescription(seg, "place", true) || "").trim().toLowerCase(),
    manner: String(getSoundDescription(seg, "manner", true) || "").trim().toLowerCase(),
    misc1: String(getSoundDescription(seg, "misc1", true) || "").trim().toLowerCase(),
    misc2: String(getSoundDescription(seg, "misc2", true) || "").trim().toLowerCase()
  };
};

SND._featureDistance = function (a, b) {
  if (!a || !b || a.type !== b.type) { return null; }
  var keys = ["place", "manner", "misc1", "misc2"];
  var diffs = 0;
  for (var i = 0; i < keys.length; i += 1) {
    var k = keys[i];
    if (!a[k] && !b[k]) { continue; }
    if (!a[k] || !b[k]) { diffs += 1; continue; }
    if (a[k] !== b[k]) { diffs += 1; }
  }
  return diffs;
};

SND._featureLabel = function (type, key, aVal, bVal) {
  var label = key;
  if (type === "vowel") {
    if (key === "place") { label = "backness"; }
    else if (key === "manner") { label = "height"; }
    else if (key === "misc1") { label = "rounding"; }
  } else {
    if (key === "misc1") {
      if ((aVal && aVal.indexOf("voice") > -1) || (bVal && bVal.indexOf("voice") > -1)) {
        label = "voicing";
      } else {
        label = "misc1";
      }
    }
  }
  return label;
};

SND._featureDiffLabel = function (a, b) {
  var keys = ["place", "manner", "misc1", "misc2"];
  var out = [];
  for (var i = 0; i < keys.length; i += 1) {
    var k = keys[i];
    if (!a[k] || !b[k] || a[k] === b[k]) { continue; }
    var label = SND._featureLabel(a.type, k, a[k], b[k]);
    out.push(label + ": " + a[k] + " -> " + b[k]);
  }
  return out.join("; ");
};

SND._getFeatureSegments = function (topN) {
  var segs = Object.keys(SND.segments).map(function (s) { return [s, SND.segments[s]]; });
  segs.sort(function (a, b) { return b[1] - a[1]; });
  segs = segs.slice(0, topN);
  return segs;
};

SND._getSoundClassMap = function (model) {
  if (typeof SOUND_CLASS_MODELS !== "undefined" && SOUND_CLASS_MODELS[model]) {
    return SOUND_CLASS_MODELS[model];
  }
  if (model === "dolgo" && typeof DOLGO !== "undefined") {
    return DOLGO;
  }
  return null;
};

SND._getSoundClass = function (seg, model) {
  var map = SND._getSoundClassMap(model);
  if (!map || !seg) { return null; }
  if (map[seg]) { return map[seg]; }
  if (seg.length > 1) {
    var two = seg.slice(0, 2);
    if (map[two]) { return map[two]; }
  }
  if (map[seg.slice(0, 1)]) { return map[seg.slice(0, 1)]; }
  if (seg.length > 2 && map[seg.slice(1, 3)]) { return map[seg.slice(1, 3)]; }
  if (seg.length > 1 && map[seg.slice(1, 2)]) { return map[seg.slice(1, 2)]; }
  return null;
};

SND._featureSortKey = function (seg) {
  var vec = SND._getFeatureVector(seg);
  if (!vec) { return "zzzz-" + seg; }
  return [
    vec.type || "",
    vec.place || "",
    vec.manner || "",
    vec.misc1 || "",
    vec.misc2 || "",
    seg
  ].join("|");
};

SND._renderFeatureList = function (topN) {
  var list = document.getElementById("soundchange_feature_list");
  if (!list) { return; }
  list.innerHTML = "";
  var segs = SND._getFeatureSegments(topN);
  for (var i = 0; i < segs.length; i += 1) {
    var opt = document.createElement("option");
    opt.value = segs[i][0];
    list.appendChild(opt);
  }
};

SND._buildFeatureGraph = function (mode, startSeg, topN, minCount) {
  var segs = SND._getFeatureSegments(topN);
  var features = {};
  var counts = {};
  for (var i = 0; i < segs.length; i += 1) {
    var seg = segs[i][0];
    counts[seg] = segs[i][1];
    var vec = SND._getFeatureVector(seg);
    if (vec) { features[seg] = vec; }
  }
  var nodes = Object.keys(features);
  if (!nodes.length) { return null; }

  if (!startSeg || !features[startSeg]) {
    startSeg = nodes[0];
  }

  if (mode === "class") {
    var classMap = {};
    for (var c0 = 0; c0 < nodes.length; c0 += 1) {
      var seg0 = nodes[c0];
      var cls = SND._getSoundClass(seg0, "sca") || "UNKNOWN";
      if (!classMap[cls]) { classMap[cls] = []; }
      classMap[cls].push(seg0);
    }
    var classNodes = [];
    var idMap = {};
    var nodeIdx = 0;
    for (var clsKey in classMap) {
      classMap[clsKey].sort(function (a, b) {
        var ka = SND._featureSortKey(a);
        var kb = SND._featureSortKey(b);
        if (ka === kb) { return a.localeCompare(b); }
        return ka < kb ? -1 : 1;
      });
      for (var c = 0; c < classMap[clsKey].length; c += 1) {
        var name = classMap[clsKey][c];
        idMap[name] = "seg-" + (nodeIdx++);
        var ctype = features[name].type;
        var color = (ctype === "vowel") ? "#2D6CA2" : (ctype === "consonant" ? "#dc143c" : "#999");
        classNodes.push({
          id: idMap[name],
          label: name,
          x: Math.random() * 10,
          y: Math.random() * 10,
          size: Math.max(1, Math.log((counts[name] || 1) + 1)),
          color: color
        });
      }
    }
    var edges = [];
    var edgeId = 0;
    for (var clsKey2 in classMap) {
      var arr = classMap[clsKey2];
      for (var i1 = 0; i1 < arr.length - 1; i1 += 1) {
        var aName = arr[i1];
        var bName = arr[i1 + 1];
        var pkey = SND._pairKey(aName, bName);
        var count = SND.pairs[pkey] || 0;
        if (typeof minCount === "number" && minCount > 1 && count > 0 && count < minCount) { continue; }
        var label = clsKey2 + (count > 0 ? (" (" + count + ")") : "");
        edges.push({
          id: "fe-" + (edgeId++),
          source: idMap[aName],
          target: idMap[bName],
          size: count > 0 ? Math.max(1, Math.log(count + 1)) : 1,
          label: label,
          color: "#666"
        });
      }
    }

    var classEdges = [];
    var classKeys = Object.keys(classMap);
    for (var i2 = 0; i2 < classKeys.length; i2 += 1) {
      for (var j2 = i2 + 1; j2 < classKeys.length; j2 += 1) {
        var cA = classKeys[i2];
        var cB = classKeys[j2];
        var best = null;
        for (var ai = 0; ai < classMap[cA].length; ai += 1) {
          for (var bi = 0; bi < classMap[cB].length; bi += 1) {
            var sA = classMap[cA][ai];
            var sB = classMap[cB][bi];
            var pkey2 = SND._pairKey(sA, sB);
            var cnt = SND.pairs[pkey2] || 0;
            if (typeof minCount === "number" && minCount > 1 && cnt > 0 && cnt < minCount) { continue; }
            if (!best || cnt > best.count) {
              best = { a: sA, b: sB, count: cnt };
            }
          }
        }
        if (best && best.count > 0) {
          classEdges.push({
            aClass: cA,
            bClass: cB,
            aSeg: best.a,
            bSeg: best.b,
            count: best.count
          });
        }
      }
    }
    classEdges.sort(function (x, y) { return y.count - x.count; });
    var parent = {};
    var find = function (x) {
      if (!parent[x]) { parent[x] = x; }
      if (parent[x] !== x) { parent[x] = find(parent[x]); }
      return parent[x];
    };
    var union = function (a, b) {
      var ra = find(a);
      var rb = find(b);
      if (ra !== rb) { parent[rb] = ra; }
    };
    for (var e = 0; e < classEdges.length; e += 1) {
      var ce = classEdges[e];
      if (find(ce.aClass) === find(ce.bClass)) { continue; }
      union(ce.aClass, ce.bClass);
      edges.push({
        id: "fe-" + (edgeId++),
        source: idMap[ce.aSeg],
        target: idMap[ce.bSeg],
        size: Math.max(1, Math.log(ce.count + 1)),
        label: "link (" + ce.count + ")",
        color: "#999"
      });
    }
    return { nodes: classNodes, edges: edges };
  }

  var adj = {};
  for (var a = 0; a < nodes.length; a += 1) {
    adj[nodes[a]] = {};
  }
  for (var key in SND.pairs) {
    var parts = key.split("||");
    var left = parts[0];
    var right = parts[1];
    if (!adj[left] || !adj[right]) { continue; }
    var count = SND.pairs[key];
    if (typeof minCount === "number" && count < minCount) { continue; }
    var fa = features[left];
    var fb = features[right];
    if (!fa || !fb || fa.type !== fb.type) { continue; }
    var dist = SND._featureDistance(fa, fb);
    if (dist === null) { continue; }
    adj[left][right] = { dist: dist, count: count };
    adj[right][left] = { dist: dist, count: count };
  }

  var idMap = {};
  var graphNodes = [];
  for (var z = 0; z < nodes.length; z += 1) {
    var sname = nodes[z];
    idMap[sname] = "seg-" + z;
    var type = features[sname].type;
    var color = (type === "vowel") ? "#2D6CA2" : (type === "consonant" ? "#dc143c" : "#999");
    graphNodes.push({
      id: idMap[sname],
      label: sname,
      x: Math.random() * 10,
      y: Math.random() * 10,
      size: Math.max(1, Math.log((counts[sname] || 1) + 1)),
      color: color
    });
  }

  var visited = {};
  var edges = [];
  var edgeId = 0;
  if (mode === "chain") {
    var current = startSeg;
    visited[current] = true;
    while (current) {
      var neighbors = [];
      for (var k in adj[current]) {
        if (!visited[k]) {
          neighbors.push({ seg: k, dist: adj[current][k].dist, count: adj[current][k].count });
        }
      }
      if (!neighbors.length) { break; }
      neighbors.sort(function (a1, b1) {
        if (a1.count !== b1.count) { return b1.count - a1.count; }
        if (a1.dist !== b1.dist) { return a1.dist - b1.dist; }
        return (counts[b1.seg] || 1) - (counts[a1.seg] || 1);
      });
      var next = neighbors[0].seg;
      var label = SND._featureDiffLabel(features[current], features[next]);
      label = label ? (label + " (" + adj[current][next].count + ")") : String(adj[current][next].count);
      edges.push({
        id: "fe-" + (edgeId++),
        source: idMap[current],
        target: idMap[next],
        size: 1,
        label: label
      });
      visited[next] = true;
      current = next;
    }
  } else {
    var queue = [startSeg];
    visited[startSeg] = true;
    while (queue.length) {
      var base = queue.shift();
      var neigh = [];
      for (var k2 in adj[base]) {
        if (!visited[k2]) {
          neigh.push({ seg: k2, dist: adj[base][k2].dist, count: adj[base][k2].count });
        }
      }
      neigh.sort(function (a2, b2) {
        if (a2.count !== b2.count) { return b2.count - a2.count; }
        if (a2.dist !== b2.dist) { return a2.dist - b2.dist; }
        return (counts[b2.seg] || 1) - (counts[a2.seg] || 1);
      });
      for (var m = 0; m < neigh.length; m += 1) {
        var child = neigh[m].seg;
        var clabel = SND._featureDiffLabel(features[base], features[child]);
        clabel = clabel ? (clabel + " (" + adj[base][child].count + ")") : String(adj[base][child].count);
        edges.push({
          id: "fe-" + (edgeId++),
          source: idMap[base],
          target: idMap[child],
          size: 1,
          label: clabel
        });
        visited[child] = true;
        queue.push(child);
      }
    }
  }

  return { nodes: graphNodes, edges: edges };
};

SND._levenshteinTokens = function (a, b) {
  var n = a.length;
  var m = b.length;
  var dp = [];
  for (var i = 0; i <= n; i += 1) {
    dp[i] = new Array(m + 1);
    dp[i][0] = i;
  }
  for (var j = 0; j <= m; j += 1) {
    dp[0][j] = j;
  }
  for (var i1 = 1; i1 <= n; i1 += 1) {
    for (var j1 = 1; j1 <= m; j1 += 1) {
      var cost = a[i1 - 1] === b[j1 - 1] ? 0 : 1;
      var del = dp[i1 - 1][j1] + 1;
      var ins = dp[i1][j1 - 1] + 1;
      var sub = dp[i1 - 1][j1 - 1] + cost;
      dp[i1][j1] = Math.min(del, ins, sub);
    }
  }
  return dp[n][m];
};

SND._renderWordList = function (forms) {
  var list = document.getElementById("soundchange_word_list");
  if (!list) { return; }
  list.innerHTML = "";
  for (var i = 0; i < forms.length; i += 1) {
    var opt = document.createElement("option");
    opt.value = forms[i].label;
    list.appendChild(opt);
  }
};

SND._buildWordChain = function (forms, startLabel) {
  if (!forms.length) { return null; }
  var idxMap = {};
  for (var i = 0; i < forms.length; i += 1) {
    idxMap[forms[i].label] = i;
  }
  var startIdx = idxMap[startLabel];
  if (typeof startIdx !== "number") { startIdx = 0; }

  var nodes = [];
  var idMap = {};
  for (var i1 = 0; i1 < forms.length; i1 += 1) {
    idMap[i1] = "w-" + i1;
    nodes.push({
      id: idMap[i1],
      label: forms[i1].label,
      x: Math.random() * 10,
      y: Math.random() * 10,
      size: Math.max(1, Math.log(forms[i1].tokens.length + 1)),
      color: "#2D6CA2"
    });
  }

  var clusters = {};
  for (var k = 0; k < forms.length; k += 1) {
    var seq = forms[k].tokens.map(function (t) {
      return SND._getSoundClass(t, "sca") || "?";
    }).join("");
    if (!clusters[seq]) { clusters[seq] = []; }
    clusters[seq].push(k);
  }

  var edges = [];
  var edgeId = 0;
  var reps = [];
  var clusterKeys = Object.keys(clusters);
  for (var c = 0; c < clusterKeys.length; c += 1) {
    var key = clusterKeys[c];
    var items = clusters[key];
    items.sort(function (a, b) {
      var la = forms[a].label;
      var lb = forms[b].label;
      return la.localeCompare(lb);
    });
    var rep = items[0];
    reps.push({ key: key, idx: rep });

    var visited = {};
    var current = rep;
    visited[current] = true;
    while (true) {
      var best = null;
      for (var j = 0; j < items.length; j += 1) {
        var cand = items[j];
        if (visited[cand]) { continue; }
        var dist = SND._levenshteinTokens(forms[current].tokens, forms[cand].tokens);
        if (!best || dist < best.dist) {
          best = { idx: cand, dist: dist };
        }
      }
      if (!best) { break; }
      edges.push({
        id: "we-" + (edgeId++),
        source: idMap[current],
        target: idMap[best.idx],
        size: Math.max(1, Math.log(best.dist + 1)),
        label: String(best.dist),
        color: "#888"
      });
      visited[best.idx] = true;
      current = best.idx;
    }
  }

  var classEdges = [];
  for (var i2 = 0; i2 < reps.length; i2 += 1) {
    for (var j2 = i2 + 1; j2 < reps.length; j2 += 1) {
      var aKey = reps[i2].key.split("");
      var bKey = reps[j2].key.split("");
      var dist = SND._levenshteinTokens(aKey, bKey);
      classEdges.push({
        a: reps[i2],
        b: reps[j2],
        dist: dist
      });
    }
  }
  classEdges.sort(function (x, y) { return x.dist - y.dist; });
  var parent = {};
  var find = function (x) {
    if (!parent[x]) { parent[x] = x; }
    if (parent[x] !== x) { parent[x] = find(parent[x]); }
    return parent[x];
  };
  var union = function (a, b) {
    var ra = find(a);
    var rb = find(b);
    if (ra !== rb) { parent[rb] = ra; }
  };
  for (var e = 0; e < classEdges.length; e += 1) {
    var ce = classEdges[e];
    if (find(ce.a.key) === find(ce.b.key)) { continue; }
    union(ce.a.key, ce.b.key);
    edges.push({
      id: "we-" + (edgeId++),
      source: idMap[ce.a.idx],
      target: idMap[ce.b.idx],
      size: Math.max(1, Math.log(ce.dist + 1)),
      label: "class " + ce.dist,
      color: "#666"
    });
  }

  if (reps.length && typeof startIdx === "number") {
    var startKey = forms[startIdx].tokens.map(function (t) {
      return SND._getSoundClass(t, "sca") || "?";
    }).join("");
    var target = reps.filter(function (r) { return r.key === startKey; })[0];
    if (target) {
      edges.push({
        id: "we-" + (edgeId++),
        source: idMap[startIdx],
        target: idMap[target.idx],
        size: 1,
        label: "start",
        color: "#2D6CA2"
      });
    }
  }

  return { nodes: nodes, edges: edges };
};

SND._buildSegmentGraph = function (topN, minCount) {
  var segs = Object.keys(SND.segments).map(function (s) { return [s, SND.segments[s]]; });
  segs.sort(function (a, b) { return b[1] - a[1]; });
  segs = segs.slice(0, topN);
  var nodes = [];
  var nodeMap = {};
  for (var i = 0; i < segs.length; i += 1) {
    var s = segs[i][0];
    nodeMap[s] = true;
    nodes.push({
      id: "seg-" + i,
      label: s,
      x: Math.random() * 10,
      y: Math.random() * 10,
      size: Math.max(1, Math.log(segs[i][1] + 1)),
      color: "#2D6CA2"
    });
  }
  var edges = [];
  var edgeId = 0;
  for (var key in SND.pairs) {
    var parts = key.split("||");
    if (!nodeMap[parts[0]] || !nodeMap[parts[1]]) { continue; }
    var count = SND.pairs[key];
    if (count < minCount) { continue; }
    edges.push({
      id: "e-" + (edgeId++),
      source: "seg-" + segs.findIndex(function (x) { return x[0] === parts[0]; }),
      target: "seg-" + segs.findIndex(function (x) { return x[0] === parts[1]; }),
      size: Math.max(1, Math.log(count + 1)),
      color: "#999"
    });
  }
  return { nodes: nodes, edges: edges };
};

SND._buildLanguageGraph = function (minCount) {
  var langs = Object.keys(SND.langCounts);
  var nodes = [];
  var idxMap = {};
  for (var i = 0; i < langs.length; i += 1) {
    idxMap[langs[i]] = i;
    nodes.push({
      id: "lang-" + i,
      label: langs[i],
      x: Math.random() * 10,
      y: Math.random() * 10,
      size: Math.max(1, Math.log(SND.langCounts[langs[i]] + 1)),
      color: "#dc143c"
    });
  }
  var edges = [];
  var edgeId = 0;
  for (var key in SND.langPairs) {
    var count = SND.langPairs[key];
    if (count < minCount) { continue; }
    var parts = key.split("||");
    var label = "";
    var detail = SND.langPairDetails[key] || {};
    var detailItems = Object.keys(detail).map(function (k) { return [k, detail[k]]; });
    detailItems.sort(function (a, b) { return b[1] - a[1]; });
    if (detailItems.length) {
      label = detailItems.slice(0, 3).map(function (d) {
        return d[0].replace("||", "~") + "(" + d[1] + ")";
      }).join(", ");
    }
    edges.push({
      id: "le-" + (edgeId++),
      source: "lang-" + idxMap[parts[0]],
      target: "lang-" + idxMap[parts[1]],
      size: Math.max(1, Math.log(count + 1)),
      label: label,
      color: "#666"
    });
    if (edgeId > 400) { break; }
  }
  return { nodes: nodes, edges: edges };
};

SND.showGraph = function (graph, title) {
  var graphStr = JSURL.stringify(graph);
  var url = 'plugouts/sigma_big.html?';
  if (graphStr.length > 1800 && window.localStorage) {
    var key = "edictor_graph_" + Date.now();
    try {
      localStorage.setItem(key, graphStr);
      url += "storage=" + encodeURIComponent(key);
    } catch (e) {
      url += graphStr;
    }
  } else {
    url += graphStr;
  }
  var nid = document.createElement('div');
  nid.style.display = '';
  nid.style.zIndex = 2000;
  nid.className = 'editmode';
  nid.id = 'editmode';
  var text = '<div class="iframe-message" style="position:fixed;top:5vh;left:5vw;width:90vw;height:88vh;max-width:95vw;max-height:92vh;margin:0;" id="scgraph">' +
    '<p style="color:white;font-weight:bold;">' +
    '<span class="main_handle pull-left" style="margin-left:0px;margin-top:2px;" ></span>' +
    title +
    '</p>' +
    '<iframe id="iframe-graph" onload=UTIL.resizeframe(this);" src="' + url + '"' +
    ' style="width:98%;height:calc(100% - 60px);min-height:360px;border:2px solid #2D6CA2;"></iframe>' +
    '<div class="btn btn-primary okbutton" onclick="' +
    "$('#editmode').remove(); document.onkeydown = function(event){basickeydown(event)};" +
    '")> OK </div></div>';
  document.body.appendChild(nid);
  nid.innerHTML = text;
  $('#scgraph').draggable({ handle: '.main_handle' }).resizable({
    handles: 'all',
    minWidth: 600,
    minHeight: 420
  });
};

SND.showSegmentGraph = function () {
  if (!SND.data) { fakeAlert("请先运行分析。"); return; }
  var topN = parseInt(document.getElementById("soundchange_topn").value, 10) || 20;
  var minCount = parseInt(document.getElementById("soundchange_mincount").value, 10) || 2;
  var graph = SND._buildSegmentGraph(topN, minCount);
  SND.showGraph(graph, "Segment Correspondence Graph");
};

SND.showLanguageGraph = function () {
  if (!SND.data) { fakeAlert("请先运行分析。"); return; }
  var minCount = parseInt(document.getElementById("soundchange_mincount").value, 10) || 2;
  var graph = SND._buildLanguageGraph(minCount);
  SND.showGraph(graph, "Language Correspondence Graph");
};

SND.showFeatureGraph = function () {
  if (!SND.data) { fakeAlert("请先运行分析。"); return; }
  if (typeof getSoundDescription !== "function") {
    fakeAlert("未找到音段特征数据。");
    return;
  }
  var modeSel = document.getElementById("soundchange_feature_mode");
  var mode = modeSel ? modeSel.value : "tree";
  var startInput = document.getElementById("soundchange_feature_start");
  var startSeg = startInput ? startInput.value.trim() : "";
  var topN = parseInt(document.getElementById("soundchange_topn").value, 10) || 20;
  var minCount = parseInt(document.getElementById("soundchange_mincount").value, 10) || 2;
  var graph = SND._buildFeatureGraph(mode, startSeg, topN, minCount);
  if (!graph || !graph.nodes.length) {
    fakeAlert("没有可用的特征节点。");
    return;
  }
  var title = (mode === "chain") ? "Feature Chain" : "Feature Tree";
  if (mode === "class") { title = "Feature Class Graph"; }
  SND.showGraph(graph, title);
};

SND.showWordChain = function () {
  if (!SND.data) { fakeAlert("请先运行分析。"); return; }
  if (!SND.wordForms || !SND.wordForms.length) {
    fakeAlert("没有可用的词形数据。");
    return;
  }
  var startInput = document.getElementById("soundchange_word_start");
  var startLabel = startInput ? startInput.value.trim() : "";
  var graph = SND._buildWordChain(SND.wordForms, startLabel);
  if (!graph || !graph.nodes.length) {
    fakeAlert("无法构建词变链。");
    return;
  }
  SND.showGraph(graph, "Word Form Chain");
};

SND.run = function () {
  if (!WLS || !WLS.header) {
    SND._setStatus("错误：请先加载TSV文件。", true);
    return;
  }
  var concept = document.getElementById("soundchange_concept").value.trim();
  if (!concept) {
    SND._setStatus("错误：请输入概念。", true);
    return;
  }
  var mode = (CFG._morphology_mode === "partial") ? "partial" : "full";
  var cogIdx = (mode === "partial") ? CFG._roots : CFG._cognates;
  if (typeof cogIdx !== "number" || cogIdx < 0) {
    var missingMsg = (mode === "partial")
      ? "错误：缺少 PARTIALIDS/COGIDS 列。"
      : "错误：缺少 COGID 列。";
    SND._setStatus(missingMsg, true);
    return;
  }
  var indices = SND._collectConceptIndices(concept);
  if (!indices.length) {
    SND._setStatus("错误：未找到该概念。", true);
    return;
  }
  SND._clear();
  SND._clearLog();
  SND.concept = concept;
  SND._appendLog("Start sound change analysis: " + concept + " (" + mode + ")");
  SND._compute(indices, cogIdx, mode);
  SND.data = true;
  SND.wordForms = [];
  for (var i = 0; i < indices.length; i += 1) {
    var idx = indices[i];
    var tokens = SND._getAlignTokens(idx);
    if (!tokens.length) { continue; }
    var lang = WLS[idx][CFG._taxa];
    var label = lang + ": " + tokens.join(" ");
    SND.wordForms.push({ idx: idx, label: label, tokens: tokens });
  }
  var topN = parseInt(document.getElementById("soundchange_topn").value, 10) || 20;
  var minCount = parseInt(document.getElementById("soundchange_mincount").value, 10) || 2;
  SND._renderSummary(indices);
  SND._renderList(minCount);
  SND._renderHeatmap(topN);
  SND._renderParams(topN, minCount, indices, mode);
  SND._renderNotes();
  SND._renderFeatureList(topN);
  SND._renderWordList(SND.wordForms);
  SND._appendLog("完成统计：对应对数 " + Object.keys(SND.pairs).length);
};

function openSoundChangeModal(event) {
  if (event && event.preventDefault) { event.preventDefault(); }
  if (!WLS || !WLS.concepts) {
    SND._setStatus("错误：请先加载TSV文件。", true);
    return;
  }
  SND._clearLog();
  SND._renderNotes();
  var list = document.getElementById("soundchange_concept_list");
  if (list) {
    list.innerHTML = "";
    var keys = Object.keys(WLS.concepts);
    keys.sort();
    for (var i = 0; i < keys.length; i += 1) {
      var opt = document.createElement("option");
      opt.value = keys[i];
      list.appendChild(opt);
    }
  }
  $('#soundchange_modal').modal('show');
}






