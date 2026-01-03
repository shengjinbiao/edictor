/* Feature-based pipeline (server-side via PanPhon). */

var FEAT = {};
FEAT.columns = {
  vec: "FEAT_VEC",
  align: "FEAT_ALIGN",
  cognates: "FEAT_COGID",
  dist: "FEAT_DIST",
  tree: "FEAT_TREE",
  sound: "FEAT_SNDCHAIN"
};
FEAT.columnAliases = {
  FEAT_VEC: ["FEATVEC"],
  FEAT_ALIGN: ["FEATALIGN"],
  FEAT_COGID: ["FEATCOGID"],
  FEAT_DIST: ["FEATDIST"],
  FEAT_TREE: ["FEATTREE"],
  FEAT_SNDCHAIN: ["FEATSNDCHAIN"]
};

FEAT._requirePython = function () {
  if (!CFG || !CFG.python) {
    fakeAlert("特征计算需要本地 Python 后端（PanPhon）。");
    return false;
  }
  return true;
};

FEAT._ensureTokens = function () {
  if (!WLS || !WLS.header) {
    fakeAlert("请先加载数据。");
    return false;
  }
  if (typeof CFG._segments === "number" && CFG._segments >= 0) {
    return true;
  }
  var tokensIdx = FEAT._getColumnIndex("TOKENS");
  if (tokensIdx !== -1) {
    CFG._segments = tokensIdx;
    CFG.tokens = WLS.header[tokensIdx];
    return true;
  }
  computeTokenizeIPA();
  return (typeof CFG._segments === "number" && CFG._segments >= 0);
};

FEAT._getColumnIndex = function (name) {
  var header = WLS && WLS.header ? WLS.header : [];
  return header.indexOf(name);
};

FEAT._resolveColumnName = function (name) {
  var header = WLS && WLS.header ? WLS.header : [];
  if (header.indexOf(name) !== -1) { return name; }
  var aliases = FEAT.columnAliases[name] || [];
  for (var i = 0; i < aliases.length; i += 1) {
    if (header.indexOf(aliases[i]) !== -1) {
      return aliases[i];
    }
  }
  return name;
};

FEAT._buildWordlist = function (opts) {
  var out = "";
  var rows = 0;
  opts = opts || {};
  if (!FEAT._ensureTokens()) { return null; }
  var cogIdx = -1;
  var almIdx = -1;
  if (opts.cognates) {
    var cogName = FEAT._resolveColumnName(FEAT.columns.cognates);
    cogIdx = FEAT._getColumnIndex(cogName);
    if (cogIdx === -1) {
      fakeAlert("缺少 FEAT_COGID 列，请先运行相似度/同源判定。");
      return null;
    }
  }
  if (opts.alignments) {
    var almName = FEAT._resolveColumnName(FEAT.columns.align);
    almIdx = FEAT._getColumnIndex(almName);
    if (almIdx === -1) {
      fakeAlert("缺少 FEAT_ALIGN 列，请先运行对齐。");
      return null;
    }
  }
  for (var idx in WLS) {
    if (!Object.prototype.hasOwnProperty.call(WLS, idx)) { continue; }
    if (isNaN(idx)) { continue; }
    var doculect = WLS[idx][CFG._taxa];
    var concept = WLS[idx][CFG._concepts];
    var tokens = WLS[idx][CFG._segments];
    if (!doculect || !concept || !tokens) { continue; }
    out += idx + "\t" + doculect + "\t" + concept + "\t" + tokens;
    if (opts.cognates) {
      out += "\t" + (WLS[idx][cogIdx] || "");
    }
    if (opts.alignments) {
      out += "\t" + (WLS[idx][almIdx] || "");
    }
    out += "\n";
    rows += 1;
  }
  if (!rows) {
    fakeAlert("没有可用的分词数据。");
    return null;
  }
  return out;
};

FEAT._applyColumn = function (columnName, values) {
  columnName = FEAT._resolveColumnName(columnName);
  var idx = UTIL.ensureColumn(columnName);
  if (idx === -1) {
    fakeAlert("无法创建列：" + columnName);
    return;
  }
  var ids = [];
  var cols = [];
  var vals = [];
  for (var key in values) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) { continue; }
    if (!WLS[key]) { continue; }
    var v = values[key];
    if (v === null || v === undefined) { v = ""; }
    v = String(v).replace(/[\t\r\n]+/g, " ");
    WLS[key][idx] = v;
    ids.push(key);
    cols.push(idx);
    vals.push(v);
  }
  storeModification(ids, cols, vals, CFG.async);
  showWLS(getCurrent());
};

FEAT._downloadText = function (text, filename) {
  if (!text) { return; }
  var blob = new Blob([text], {type: "text/plain;charset=utf-8"});
  saveAs(blob, filename);
};

FEAT._request = function (action, onSuccess) {
  if (!FEAT._requirePython()) { return; }
  var opts = {};
  if (action === "align") { opts.cognates = true; }
  if (action === "soundchange") { opts.alignments = true; }
  var wordlist = FEAT._buildWordlist(opts);
  if (!wordlist) { return; }
  $('#popup_background').show();
  $.ajax({
    async: true,
    type: "POST",
    url: "feature.py",
    dataType: "text",
    data: {
      action: action,
      wordlist: wordlist
    },
    success: function (data) {
      $('#popup_background').fadeOut();
      var parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        fakeAlert("特征后端返回无效响应。");
        return;
      }
      if (parsed.error) {
        if (parsed.detail) {
          console.error(parsed.detail);
        }
        fakeAlert(parsed.error);
        return;
      }
      if (typeof onSuccess === "function") {
        onSuccess(parsed);
      }
      if (parsed.column && parsed.values) {
        FEAT._applyColumn(parsed.column, parsed.values);
      }
      if (parsed.columns && parsed.columns.length) {
        for (var i = 0; i < parsed.columns.length; i += 1) {
          FEAT._applyColumn(parsed.columns[i].name, parsed.columns[i].values || {});
        }
      }
      if (parsed.downloads) {
        for (var name in parsed.downloads) {
          if (!Object.prototype.hasOwnProperty.call(parsed.downloads, name)) { continue; }
          FEAT._downloadText(parsed.downloads[name], name);
        }
      }
      if (parsed.message) {
        fakeAlert(parsed.message);
      }
    },
    error: function () {
      $('#popup_background').fadeOut();
      fakeAlert("特征计算失败。");
    }
  });
};

FEAT.tokenize = function () {
  if (typeof computeTokenizeIPA !== "function") {
    fakeAlert("未找到分词函数。");
    return;
  }
  computeTokenizeIPA();
};

FEAT.vectorize = function () {
  FEAT._request("vectorize");
};

FEAT.align = function () {
  FEAT._request("align");
};

FEAT.cognates = function () {
  FEAT._request("cognates");
};

FEAT.distances = function () {
  FEAT._request("distances", function (data) {
    FEAT._renderDistances(data);
    FEAT._showDistancesModal();
  });
};

FEAT.soundchange = function () {
  FEAT._request("soundchange", function (data) {
    FEAT._renderSoundchange(data);
    FEAT._showSoundchangeModal();
  });
};

FEAT._showDistancesModal = function () {
  var modal = document.getElementById("feature_distances_modal");
  if (modal) { $('#feature_distances_modal').modal('show'); }
};

FEAT._showSoundchangeModal = function () {
  var modal = document.getElementById("feature_soundchange_modal");
  if (modal) { $('#feature_soundchange_modal').modal('show'); }
};

FEAT._renderDistances = function (data) {
  var heatmap = document.getElementById("feat_distances_heatmap");
  var treeBox = document.getElementById("feat_distances_tree");
  var info = document.getElementById("feat_distances_info");
  if (!heatmap || !treeBox || !info) { return; }
  var taxa = data.taxa || [];
  var matrix = data.matrix || [];
  var html = '<table class="data_table2">';
  html += '<tr><th>Taxa</th><th>' + taxa.length + '</th></tr>';
  html += '<tr><th>Tree</th><th>' + (data.tree ? 'Yes' : 'No') + '</th></tr>';
  html += '</table>';
  info.innerHTML = html;
  heatmap.innerHTML = FEAT._buildHeatmap(taxa, matrix);
  treeBox.innerHTML = "";
  if (data.tree && typeof DIST !== "undefined" && DIST._buildTreeSVG) {
    var built = DIST._buildTreeSVG(data.tree, null, {scaleX: 160, rowHeight: 18});
    if (built && built.svg) {
      treeBox.innerHTML = built.svg;
    }
  } else if (data.ascii) {
    treeBox.innerHTML = '<pre style="white-space:pre-wrap">' + data.ascii + '</pre>';
  } else {
    treeBox.innerHTML = '<div style="color:#777">No tree available.</div>';
  }
};

FEAT._buildHeatmap = function (taxa, matrix) {
  if (!taxa.length || !matrix.length) {
    return '<div style="color:#777">No distance matrix.</div>';
  }
  var max = 0;
  for (var i = 0; i < matrix.length; i += 1) {
    for (var j = 0; j < matrix[i].length; j += 1) {
      if (matrix[i][j] > max) { max = matrix[i][j]; }
    }
  }
  if (max === 0) { max = 1; }
  var out = '<table class="data_table2" style="border-collapse:collapse">';
  out += '<tr><th></th>';
  for (var t = 0; t < taxa.length; t += 1) {
    out += '<th style="font-size:11px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + taxa[t] + '</th>';
  }
  out += '</tr>';
  for (var r = 0; r < taxa.length; r += 1) {
    out += '<tr><th style="font-size:11px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + taxa[r] + '</th>';
    for (var c = 0; c < taxa.length; c += 1) {
      var val = matrix[r][c] || 0;
      var alpha = Math.min(0.85, 0.15 + (val / max) * 0.7);
      var bg = 'rgba(30, 120, 180,' + alpha.toFixed(2) + ')';
      var textColor = val > (max * 0.6) ? '#fff' : '#111';
      out += '<td style="background:' + bg + ';color:' + textColor + ';text-align:center;font-size:11px;padding:2px 4px">' + val.toFixed(3) + '</td>';
    }
    out += '</tr>';
  }
  out += '</table>';
  return out;
};

FEAT._renderSoundchange = function (data) {
  var table = document.getElementById("feat_soundchange_table");
  var chain = document.getElementById("feat_soundchange_chain");
  if (!table || !chain) { return; }
  FEAT._lastSoundchange = data;
  var edges = data.edges || [];
  FEAT._buildWordForms();
  FEAT._renderWordList();
  if (!edges.length) {
    table.innerHTML = '<div style="color:#777">No soundchange edges.</div>';
    chain.innerHTML = "";
    return;
  }
  var rows = '<table class="data_table2"><tr><th>Source</th><th>Target</th><th>Count</th></tr>';
  for (var i = 0; i < Math.min(edges.length, 200); i += 1) {
    rows += '<tr><td>' + edges[i][0] + '</td><td>' + edges[i][1] + '</td><td>' + edges[i][2] + '</td></tr>';
  }
  rows += '</table>';
  table.innerHTML = rows;
  chain.innerHTML = FEAT._buildSoundchangeChain(edges);
};

FEAT._buildSoundchangeChain = function (edges) {
  var startInput = document.getElementById("feat_soundchange_start");
  var start = startInput ? startInput.value.trim() : "";
  if (!start) {
    return '<div style="color:#777">输入起点音段以生成音变链。</div>';
  }
  var outgoing = {};
  for (var i = 0; i < edges.length; i += 1) {
    var src = edges[i][0];
    if (!outgoing[src]) { outgoing[src] = []; }
    outgoing[src].push(edges[i]);
  }
  var chain = [start];
  var current = start;
  var visited = {};
  visited[start] = true;
  for (var step = 0; step < 10; step += 1) {
    var opts = outgoing[current] || [];
    if (!opts.length) { break; }
    opts.sort(function (a, b) { return b[2] - a[2]; });
    var next = null;
    for (var j = 0; j < opts.length; j += 1) {
      if (!visited[opts[j][1]]) {
        next = opts[j][1];
        break;
      }
    }
    if (!next) { break; }
    chain.push(next);
    visited[next] = true;
    current = next;
  }
  if (chain.length === 1) {
    return '<div style="color:#777">未找到后续音变。</div>';
  }
  return '<div style="font-size:14px">' + chain.join(" → ") + "</div>";
};

FEAT.updateSoundchangeChain = function () {
  if (!FEAT._lastSoundchange) { return; }
  var chain = document.getElementById("feat_soundchange_chain");
  if (!chain) { return; }
  chain.innerHTML = FEAT._buildSoundchangeChain(FEAT._lastSoundchange.edges || []);
};

FEAT._buildWordForms = function () {
  FEAT._wordForms = [];
  if (!WLS || !WLS.header) { return; }
  var segIdx = CFG._segments;
  if (typeof segIdx !== "number" || segIdx < 0) { return; }
  var almName = FEAT._resolveColumnName(FEAT.columns.align);
  var almIdx = FEAT._getColumnIndex(almName);
  for (var key in WLS) {
    if (!Object.prototype.hasOwnProperty.call(WLS, key)) { continue; }
    if (isNaN(key)) { continue; }
    var lang = WLS[key][CFG._taxa];
    var raw = "";
    if (almIdx !== -1 && WLS[key][almIdx]) {
      raw = String(WLS[key][almIdx]).trim();
    } else {
      raw = String(WLS[key][segIdx] || "").trim();
    }
    if (!raw) { continue; }
    var tokens = raw.split(/\s+/).filter(function (t) { return t && t !== "+"; });
    if (!tokens.length) { continue; }
    var label = lang + ": " + tokens.join(" ");
    FEAT._wordForms.push({ idx: key, label: label, tokens: tokens });
  }
};

FEAT._renderWordList = function () {
  var list = document.getElementById("feat_soundchange_word_list");
  if (!list) { return; }
  list.innerHTML = "";
  for (var i = 0; i < FEAT._wordForms.length; i += 1) {
    var opt = document.createElement("option");
    opt.value = FEAT._wordForms[i].label;
    list.appendChild(opt);
  }
};

FEAT.showWordChain = function () {
  if (!FEAT._wordForms || !FEAT._wordForms.length) {
    fakeAlert("没有可用的词形数据。");
    return;
  }
  if (typeof SND === "undefined" || typeof SND._buildWordChain !== "function") {
    fakeAlert("词变链功能不可用。");
    return;
  }
  var startInput = document.getElementById("feat_soundchange_word_start");
  var startLabel = startInput ? startInput.value.trim() : "";
  var graph = SND._buildWordChain(FEAT._wordForms, startLabel);
  if (!graph || !graph.nodes.length) {
    fakeAlert("无法构建词变链。");
    return;
  }
  if (typeof SND.showGraph === "function") {
    SND.showGraph(graph, "Feature Word Chain");
  }
};
