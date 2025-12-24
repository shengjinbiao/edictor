var SND = {
  data: null,
  concept: "",
  segments: {},
  pairs: {},
  langPairs: {},
  langPairDetails: {},
  langCounts: {}
};

SND._clear = function () {
  SND.data = null;
  SND.concept = "";
  SND.segments = {};
  SND.pairs = {};
  SND.langPairs = {};
  SND.langPairDetails = {};
  SND.langCounts = {};
};

SND._collectConceptIndices = function (concept) {
  if (!WLS || !WLS.concepts || !concept) { return []; }
  if (WLS.concepts.hasOwnProperty(concept)) {
    return WLS.concepts[concept].slice();
  }
  return [];
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

SND._compute = function (indices, cogIdx) {
  var groups = {};
  for (var i = 0; i < indices.length; i += 1) {
    var idx = indices[i];
    var cog = WLS[idx][cogIdx];
    if (cog === undefined || cog === null) { continue; }
    var cogid = String(cog).split(/\s+/)[0];
    if (!groups.hasOwnProperty(cogid)) { groups[cogid] = []; }
    groups[cogid].push(idx);
  }

  for (var key in groups) {
    var rows = groups[key];
    if (rows.length < 2) { continue; }
    var entries = [];
    var maxLen = 0;
    for (var j = 0; j < rows.length; j += 1) {
      var idx = rows[j];
      var lang = WLS[idx][CFG._taxa];
      var toks = SND._getAlignTokens(idx);
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

SND._renderParams = function (topN, minCount, indices) {
  var params = document.getElementById("soundchange_params");
  if (!params) { return; }
  var al = (typeof CFG._alignments === "number" && CFG._alignments > -1) ? WLS.header[CFG._alignments] : "TOKENS";
  var tok = (typeof CFG._segments === "number" && CFG._segments > -1) ? WLS.header[CFG._segments] : "-";
  var cog = (typeof CFG._cognates === "number" && CFG._cognates > -1) ? WLS.header[CFG._cognates] : "-";
  params.innerHTML = ""
    + "<div>概念 / Concept: " + SND.concept + "</div>"
    + "<div>行数 / Rows: " + indices.length + "</div>"
    + "<div>COGID 列: " + cog + "</div>"
    + "<div>ALIGNMENT 列: " + al + "</div>"
    + "<div>TOKENS 列: " + tok + "</div>"
    + "<div>Top N 音段: " + topN + "</div>"
    + "<div>最小计数: " + minCount + "</div>";
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
  var url = 'plugouts/sigma_big.html?' + graphStr;
  var nid = document.createElement('div');
  nid.style.display = '';
  nid.style.zIndex = 2000;
  nid.className = 'editmode';
  nid.id = 'editmode';
  var text = '<div class="iframe-message" style="width:920px" id="scgraph">' +
    '<p style="color:white;font-weight:bold;">' +
    '<span class="main_handle pull-left" style="margin-left:0px;margin-top:2px;" ></span>' +
    title +
    '</p>' +
    '<iframe id="iframe-graph" onload=UTIL.resizeframe(this);" src="' + url + '"' +
    ' style="width:98%;height:82%;min-height:560px;max-height:880px;border:2px solid #2D6CA2;"></iframe>' +
    '<br><div class="btn btn-primary okbutton" onclick="' +
    "$('#editmode').remove(); document.onkeydown = function(event){basickeydown(event)};" +
    '")> OK </div></div>';
  document.body.appendChild(nid);
  nid.innerHTML = text;
  $('#scgraph').draggable({ handle: '.main_handle' }).resizable();
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

SND.run = function () {
  if (!WLS || !WLS.header) {
    SND._setStatus("错误：请先加载 TSV 文件。", true);
    return;
  }
  if (CFG._morphology_mode === "partial") {
    SND._setStatus("错误：当前仅支持 full cognates。请在设置里切换到 FULL 模式。", true);
    return;
  }
  var concept = document.getElementById("soundchange_concept").value.trim();
  if (!concept) {
    SND._setStatus("错误：请输入概念。", true);
    return;
  }
  var cogIdx = CFG._cognates;
  if (typeof cogIdx !== "number" || cogIdx < 0) {
    SND._setStatus("错误：未设置 COGID 列。", true);
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
  SND._appendLog("开始分析概念: " + concept);
  SND._compute(indices, cogIdx);
  SND.data = true;
  var topN = parseInt(document.getElementById("soundchange_topn").value, 10) || 20;
  var minCount = parseInt(document.getElementById("soundchange_mincount").value, 10) || 2;
  SND._renderSummary(indices);
  SND._renderList(minCount);
  SND._renderHeatmap(topN);
  SND._renderParams(topN, minCount, indices);
  SND._renderNotes();
  SND._appendLog("完成统计：对应对数 " + Object.keys(SND.pairs).length);
};

function openSoundChangeModal(event) {
  if (event && event.preventDefault) { event.preventDefault(); }
  if (!WLS || !WLS.concepts) {
    SND._setStatus("错误：请先加载 TSV 文件。", true);
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
