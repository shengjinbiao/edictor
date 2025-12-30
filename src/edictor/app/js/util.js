/* Utility functions
 *
 * author   : Johann-Mattis List
 * email    : mattis.list@lingulist.de
 * created  : 2016-03-20 10:44
 * modified : 2024-06-09 07:07
 *
 */


var UTIL = {};
UTIL.log = {};
UTIL.show_help = function(topic, table, container) {
  container = (typeof container == "undefined") ? topic : container;
  table = (typeof table == 'undefined') ? topic+'_table' : table;
  //-> console.log(UTIL.log);
  if (topic in UTIL.log && UTIL.log[topic]) {
    document.getElementById(table).style.display = '';
    document.getElementById(topic+'_help').style.display = 'none';
    UTIL.log[topic] = false;
  }
  else if (topic in UTIL.log) {
    document.getElementById(table).style.display = 'none';
    document.getElementById(topic+'_help').style.display = '';
    UTIL.log[topic] = true;
  }
  else {
    $.ajax({
      async: true,
      type: "GET",
      url: "help/"+topic+'.html',
      dataType: "text",
      success: function(data) {
        var mid = document.getElementById(table);
        var hid = document.getElementById(topic+'_help');
        var eid = document.getElementById(container);
        hid.innerHTML = data;
        hid.style.width = eid.offsetWidth-50; 
        hid.style.display = '';
        mid.style.display = 'none';
        hid.style.minWidth = '70%';
	UTIL.log[topic] = true;
      }
    });
  }
};

UTIL.randint = function (min, max) {
  return Math.random() * (max - min) + min;
};

UTIL.resizeframe = function (iframe) {
  iframe.height = (10 + iframe.contentWindow.document.body.clientHeight) + 'px';
  iframe.width =  (iframe.contentWindow.document.body.clientWidth) + 'px';
}

/* 数据集覆盖率快速检查：统计每个方言点的有效条目数与概念覆盖率 */
UTIL.checkCoverage = function () {
  if (!WLS || !WLS.header) {
    alert("请先加载一个 TSV 数据集。");
    return;
  }
  var hdr = WLS.header;
  var tIdx = hdr.indexOf("DOCULECT");
  var cIdx = hdr.indexOf("CONCEPT");
  if (tIdx === -1 || cIdx === -1) {
    alert("缺少 DOCULECT 或 CONCEPT 列，无法计算覆盖率。");
    return;
  }
  var formIdx = -1;
  ["TOKENS", "FORM", "IPA"].some(function (name) {
    var idx = hdr.indexOf(name);
    if (idx !== -1) { formIdx = idx; return true; }
    return false;
  });
  if (formIdx === -1) {
    alert("缺少可用的语音列（TOKENS/FORM/IPA），无法计算覆盖率。");
    return;
  }

  var concepts = new Set();
  var stats = {}; // doculect -> {filled:Set, total:Set}
  for (var key in WLS) {
    if (isNaN(key)) { continue; }
    var row = WLS[key];
    var taxon = row[tIdx] || "";
    var concept = row[cIdx] || "";
    var form = row[formIdx] || "";
    if (!taxon || !concept) { continue; }
    concepts.add(concept);
    if (!stats[taxon]) { stats[taxon] = {filled:new Set(), total:new Set()}; }
    stats[taxon].total.add(concept);
    if (form.trim()) { stats[taxon].filled.add(concept); }
  }
  var totalConcepts = concepts.size;
  var messages = [];
  var low = [];
  var sum = 0, n=0;
  for (var taxon in stats) {
    var filled = stats[taxon].filled.size;
    var cov = totalConcepts ? (filled/totalConcepts*100) : 0;
    sum += cov; n += 1;
    if (cov < 50) { low.push(taxon + " (" + cov.toFixed(1) + "%)"); }
  }
  var avg = n ? (sum/n).toFixed(1) : "0.0";
  messages.push("全局平均覆盖率: " + avg + "%（基于列 " + hdr[formIdx] + "，概念数 " + totalConcepts + "）");
  if (low.length) {
    messages.push("覆盖率低于 50% 的方言点: " + low.join(", "));
  } else {
    messages.push("所有方言点覆盖率均在 50% 以上。");
  }
  alert(messages.join("\n"));
  console.log("覆盖率详情", stats);
};

/* 确保某列存在，不存在则创建空列，返回列索引 */
UTIL.semanticFilterDialog = function () {
  if (!CFG || !CFG.python) {
    fakeAlert("Semantic filtering requires the local Python server.");
    return;
  }
  if (document.getElementById("semantic-filter-popup")) {
    return;
  }
  var text = ''
    + '<div class="editmode" id="semantic-filter-popup">'
    + '  <div class="edit_links niceblue" style="width:560px;padding:10px;">'
    + '    <p>Semantic Concept Filter</p>'
    + '    <div class="alignments" style="padding:10px;text-align:left;">'
    + '      <label style="min-width:110px;display:inline-block;">Include</label>'
    + '      <input id="semantic_include" class="form-control textfield" '
    + '        style="width:75%;display:inline-block;" '
    + '        placeholder="head; skull; forehead" /><br><br>'
    + '      <label style="min-width:110px;display:inline-block;">Exclude</label>'
    + '      <input id="semantic_exclude" class="form-control textfield" '
    + '        style="width:75%;display:inline-block;" '
    + '        placeholder="taro; suffix; classifier" /><br><br>'
    + '      <label style="min-width:110px;display:inline-block;">Threshold</label>'
    + '      <input id="semantic_threshold" type="number" step="0.01" '
    + '        class="form-control textfield" style="width:120px;display:inline-block;" value="0.18" />'
    + '      <label style="margin-left:10px;">'
    + '        <input id="semantic_require_gpu" type="checkbox" /> Require GPU'
    + '      </label>'
    + '      <div style="margin-top:12px;">'
    + '        <input class="btn btn-primary submit" type="button" '
    + '          onclick="UTIL.semanticFilterApply();" value="APPLY" /> '
    + '        <input class="btn btn-primary submit" type="button" '
    + '          onclick="UTIL.semanticFilterClose();" value="CLOSE" />'
    + '      </div>'
    + '    </div>'
    + '  </div>'
    + '</div>';
  document.body.insertAdjacentHTML("beforeend", text);
};

UTIL.semanticFilterClose = function () {
  var pop = document.getElementById("semantic-filter-popup");
  if (pop) {
    pop.parentNode.removeChild(pop);
  }
};

UTIL.semanticFilterApply = function () {
  var include = (document.getElementById("semantic_include") || {}).value || "";
  var exclude = (document.getElementById("semantic_exclude") || {}).value || "";
  var threshold = parseFloat((document.getElementById("semantic_threshold") || {}).value);
  var requireGpu = (document.getElementById("semantic_require_gpu") || {}).checked;
  if (!include.trim()) {
    fakeAlert("Please provide include terms.");
    return;
  }
  if (!CFG || !CFG.sorted_concepts || !CFG.sorted_concepts.length) {
    fakeAlert("No concepts found in the current dataset.");
    return;
  }
  if (isNaN(threshold)) {
    threshold = 0.18;
  }

  var payload = {
    concepts: CFG.sorted_concepts,
    include: include,
    exclude: exclude,
    threshold: threshold,
    require_gpu: requireGpu
  };

  $('#popup_background').show();
  $.ajax({
    async: true,
    type: "POST",
    url: "semantic_filter.py",
    dataType: "text",
    data: "payload=" + encodeURIComponent(JSON.stringify(payload)),
    success: function (data) {
      $('#popup_background').fadeOut();
      var out;
      try {
        out = JSON.parse(data);
      } catch (e) {
        fakeAlert("Invalid response from semantic filter.");
        return;
      }
      if (out.error) {
        fakeAlert(out.error);
        return;
      }
      if (!out.concepts || !out.concepts.length) {
        fakeAlert("No concepts matched your semantic filter.");
        return;
      }
      $('#select_concepts').multiselect('deselectAll', false);
      $('#select_concepts').multiselect('select', out.concepts);
      CFG._selected_concepts = out.concepts;
      applyFilter();
      showWLS(1);
      var msg = "Semantic filter kept " + out.kept + " / " + out.total + " concepts.";
      if (out.device && out.device !== "cuda") {
        msg += " GPU not available; ran on CPU.";
      }
      fakeAlert(msg);
      UTIL.semanticFilterClose();
    },
    error: function () {
      $('#popup_background').fadeOut();
      fakeAlert("Semantic filter request failed.");
    }
  });
};

/* --- Server-side paging (for very large TSVs) --- */
UTIL._serverPaging = {
  offset: 0,
  limit: 50,
  total: 0,
  payload: {}
};

UTIL._serverPagingClose = function () {
  var pop = document.getElementById("server-paging-popup");
  if (pop) {
    pop.parentNode.removeChild(pop);
  }
};

UTIL._serverPagingRender = function (resp) {
  var info = document.getElementById("server_paging_info");
  var tbl = document.getElementById("server_paging_table");
  if (!resp || resp.error) {
    info.innerText = resp && resp.error ? resp.error : "Failed.";
    tbl.innerHTML = "";
    return;
  }
  UTIL._serverPaging.total = resp.total || 0;
  UTIL._serverPaging.offset = resp.offset || 0;
  UTIL._serverPaging.limit = resp.limit || 50;
  var total = UTIL._serverPaging.total;
  var start = total ? (UTIL._serverPaging.offset + 1) : 0;
  var end = Math.min(total, UTIL._serverPaging.offset + UTIL._serverPaging.limit);
  info.innerText = "Rows " + start + "-" + end + " / " + total;

  var header = resp.header || [];
  var rows = resp.rows || [];
  var html = '<table class="table table-bordered table-condensed" style="width:100%;"><thead><tr>';
  header.forEach(function (h) { html += "<th>" + h + "</th>"; });
  html += "</tr></thead><tbody>";
  rows.forEach(function (r) {
    html += "<tr>";
    for (var i = 0; i < header.length; i++) {
      html += "<td>" + (r[i] || "") + "</td>";
    }
    html += "</tr>";
  });
  html += "</tbody></table>";
  tbl.innerHTML = html;
};

UTIL._serverPagingFetch = function (direction) {
  var file = (document.getElementById("server_paging_file") || {}).value || "";
  var doculects = (document.getElementById("server_paging_doculects") || {}).value || "";
  var concepts = (document.getElementById("server_paging_concepts") || {}).value || "";
  var columns = (document.getElementById("server_paging_columns") || {}).value || "";
  var limit = parseInt((document.getElementById("server_paging_limit") || {}).value, 10);
  if (isNaN(limit) || limit <= 0) { limit = 50; }
  var offset = UTIL._serverPaging.offset;
  if (direction === "next") { offset += limit; }
  else if (direction === "prev") { offset = Math.max(0, offset - limit); }
  else { offset = 0; }

  var payload = {
    file: file.trim(),
    doculects: doculects ? doculects.split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
    concepts: concepts ? concepts.split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
    columns: columns ? columns.split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
    limit: limit,
    offset: offset
  };
  UTIL._serverPaging.payload = payload;
  document.getElementById("server_paging_info").innerText = "Loading...";
  $.ajax({
    async: true,
    type: "POST",
    url: "server_page.py",
    dataType: "text",
    data: "payload=" + encodeURIComponent(JSON.stringify(payload)),
    success: function (data) {
      var resp;
      try {
        resp = JSON.parse(data);
      } catch (e) {
        resp = {error: "Invalid response."};
      }
      UTIL._serverPagingRender(resp);
    },
    error: function () {
      UTIL._serverPagingRender({error: "Request failed."});
    }
  });
};

UTIL.serverPagingExport = function () {};
UTIL.serverPagingDialog = function () {};

/* === 语义预筛（调用后端批处理） === */
UTIL._semanticBatchState = {tsv: null, header: [], filename: "semantic_filtered.tsv"};

UTIL._guessMap = function (header, targets) {
  var upperMap = {};
  header.forEach(function (h) { upperMap[h.toUpperCase()] = h; });
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i].toUpperCase();
    if (upperMap[t]) { return upperMap[t]; }
  }
  return "";
};

UTIL._fillSemanticMapping = function (header) {
  var opts = header.map(function (h) { return '<option value="'+h+'">'+h+'</option>'; }).join("");
  ["sem_map_id","sem_map_doculect","sem_map_concept","sem_map_form"].forEach(function(id){var sel=document.getElementById(id); if(sel){sel.innerHTML='<option value=\"\">(不改名)</option>'+opts;}});
  document.getElementById("sem_map_id").value = UTIL._guessMap(header, ["ID"]);
  document.getElementById("sem_map_doculect").value = UTIL._guessMap(header, ["DOCULECT","TAXON","LANGUAGE"]);
  document.getElementById("sem_map_concept").value = UTIL._guessMap(header, ["CONCEPT","GLOSS","MEANING"]);
  document.getElementById("sem_map_form").value = UTIL._guessMap(header, ["FORM","IPA","TOKENS"]);
};

UTIL._renameHeader = function (tsv, mapping) {
  var lines = tsv.split(/\r?\n/);
  if (!lines.length) { return tsv; }
  var header = lines[0].split("\t");
  Object.keys(mapping).forEach(function (target) {
    var src = mapping[target];
    if (!src) { return; }
    var idx = header.indexOf(src);
    if (idx !== -1) { header[idx] = target; }
  });
  lines[0] = header.join("\t");
  return lines.join("\n");
};

UTIL._loadTsvText = function (text, filename) {
  reset();
  CFG['filename'] = filename || "semantic_filtered.tsv";
  CFG['load_new_file'] = true;
  localStorage.filename = CFG['filename'];
  STORE = text;
  if (typeof resetComputeModalState === 'function') {
    resetComputeModalState('compute_cognates_modal', 'icognates_table', 'icognates_help');
    resetComputeModalState('compute_alignments_modal', 'ialms_table', 'ialms_help');
    resetComputeModalState('compute_patterns_modal', 'ipatterns_table', 'ipatterns_help');
    resetComputeModalState('compute_distances_modal', 'idistances_table', 'idistances_help');
  }
  ['view'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.style.display = 'block'; }
  });
  ['first','previous','next','current'].forEach(function (id) {
    $('#' + id).removeClass('unhidden');
    $('#' + id).addClass('hidden');
  });
  var qlc = document.getElementById('qlc');
  if (qlc) { qlc.innerHTML = ''; }
  var fn = document.getElementById('filename');
  if (fn) { fn.innerHTML = '&lt;' + CFG['filename'] + '&gt;'; }
  try { showWLS(1); } catch (e) { console.error(e); }
};

UTIL.semanticBatchDialog = function () {
  if (document.getElementById("semantic-batch-popup")) { return; }
  var html = ''
    + '<div class="editmode" id="semantic-batch-popup">'
    + '  <div class="edit_links niceblue" style="width:860px;padding:10px;">'
    + '    <p>语义预筛（Excel → TSV → 可加载）</p>'
    + '    <div class="alignments" style="padding:10px;text-align:left;">'
    + '      <label style="min-width:120px;display:inline-block;">Excel 文件路径</label>'
    + '      <input id="sem_file" class="form-control textfield" style="width:80%;display:inline-block;" placeholder="C:/Users/.../文件.xlsx" />'
    + '      <input class="btn btn-primary submit" type="button" style="margin-left:6px;"'
    + '        onclick="document.getElementById(\'sem_file_upload\').click();" value="Choose File" />'
    + '      <input id="sem_file_upload" type="file" style="display:none"'
    + '        accept=".xlsx,.xls,.csv,.tsv" onchange="UTIL.semanticBatchUpload(event);" />'
    + '      <br><br>'
    + '      <label style="min-width:120px;display:inline-block;">词义列名(可选)</label>'
    + '      <input id="sem_gloss_name" class="form-control textfield" style="width:40%;display:inline-block;" placeholder="" />'
    + '      <label style="min-width:120px;display:inline-block;">词义列序号</label>'
    + '      <input id="sem_gloss_idx" type="number" value="4" class="form-control textfield" style="width:120px;display:inline-block;" />'
    + '      <br><br>'
    + '      <label style="min-width:120px;display:inline-block;">包含词(分号分隔)</label>'
    + '      <input id="sem_include" class="form-control textfield" style="width:80%;display:inline-block;" placeholder="头; 头盖骨; cranium" />'
    + '      <br><br>'
    + '      <label style="min-width:120px;display:inline-block;">排除词(可选)</label>'
    + '      <input id="sem_exclude" class="form-control textfield" style="width:80%;display:inline-block;" placeholder="芋头; 骨头; 念头" />'
    + '      <br><br>'
    + '      <label style="min-width:120px;display:inline-block;">预过滤字符(可选)</label>'
    + '      <input id="sem_head_chars" class="form-control textfield" style="width:40%;display:inline-block;" placeholder="头首元颅" />'
    + '      <label style="min-width:120px;display:inline-block;">阈值</label>'
    + '      <input id="sem_threshold" type="number" step="0.01" value="0.18" class="form-control textfield" style="width:120px;display:inline-block;" />'
    + '      <label style="margin-left:10px;">'
    + '        <input id="sem_require_gpu" type="checkbox" /> 需要 GPU'
    + '      </label>'
    + '      <div style="margin-top:12px;">'
    + '        <input class="btn btn-primary submit" type="button" onclick="UTIL.semanticBatchRun();" value="运行" /> '
    + '        <input class="btn btn-primary submit" type="button" onclick="UTIL.semanticBatchDownload();" value="下载 TSV" /> '
    + '        <input class="btn btn-primary submit" type="button" onclick="UTIL.semanticBatchLoad();" value="加载到 EDICTOR" /> '
    + '        <input class="btn btn-primary submit" type="button" onclick="UTIL.semanticBatchClose();" value="关闭" />'
    + '      </div>'
    + '      <div id="sem_status" style="margin-top:10px;">待运行</div>'
    + '      <div id="sem_mapping" style="margin-top:10px; display:none;">'
    + '        <p>加载时列映射（可选，不改名则保持原列名）：</p>'
    + '        <label style="min-width:100px;display:inline-block;">ID 列</label>'
    + '        <select id="sem_map_id" class="form-control textfield" style="width:200px;display:inline-block;"></select><br>'
    + '        <label style="min-width:100px;display:inline-block;">DOCULECT 列</label>'
    + '        <select id="sem_map_doculect" class="form-control textfield" style="width:200px;display:inline-block;"></select><br>'
    + '        <label style="min-width:100px;display:inline-block;">CONCEPT 列</label>'
    + '        <select id="sem_map_concept" class="form-control textfield" style="width:200px;display:inline-block;"></select><br>'
    + '        <label style="min-width:100px;display:inline-block;">FORM/IPA 列</label>'
    + '        <select id="sem_map_form" class="form-control textfield" style="width:200px;display:inline-block;"></select>'
    + '      </div>'
    + '    </div>'
    + '  </div>'
    + '</div>';
  document.body.insertAdjacentHTML("beforeend", html);
};

UTIL.semanticBatchUpload = function (evt) {
  var file = (evt.target.files || [])[0];
  if (!file) { return; }
  var status = document.getElementById("sem_status");
  if (status) { status.innerText = "Uploading..."; }
  var formData = new FormData();
  formData.append("file", file);
  $.ajax({
    async: true,
    type: "POST",
    url: "upload_semantic.py",
    data: formData,
    processData: false,
    contentType: false,
    success: function (data) {
      var resp;
      if (typeof data === "string") {
        try { resp = JSON.parse(data); } catch (e) { resp = {error: "Invalid response"}; }
      } else {
        resp = data;
      }
      if (resp.error) {
        if (status) { status.innerText = "Upload failed: " + resp.error; }
        return;
      }
      var input = document.getElementById("sem_file");
      if (input) { input.value = resp.path || ""; }
      if (status) { status.innerText = "Uploaded to server: " + (resp.path || ""); }
    },
    error: function () {
      if (status) { status.innerText = "Upload failed."; }
    }
  });
  evt.target.value = "";
};

UTIL.semanticBatchClose = function () {
  var pop = document.getElementById("semantic-batch-popup");
  if (pop) { pop.parentNode.removeChild(pop); }
};

UTIL.semanticBatchRun = function () {
  var payload = {
    file: (document.getElementById("sem_file") || {}).value || "",
    gloss_col_name: (document.getElementById("sem_gloss_name") || {}).value || "",
    gloss_col_index: (document.getElementById("sem_gloss_idx") || {}).value || 4,
    include: (document.getElementById("sem_include") || {}).value || "",
    exclude: (document.getElementById("sem_exclude") || {}).value || "",
    head_chars: (document.getElementById("sem_head_chars") || {}).value || "",
    threshold: (document.getElementById("sem_threshold") || {}).value || 0.18,
    require_gpu: (document.getElementById("sem_require_gpu") || {}).checked
  };
  var status = document.getElementById("sem_status");
  status.innerText = "运行中...";
  $.ajax({
    async: true,
    type: "POST",
    url: "semantic_batch.py",
    dataType: "text",
    data: "payload=" + encodeURIComponent(JSON.stringify(payload)),
    success: function (data) {
      var resp;
      try { resp = JSON.parse(data); } catch (e) { resp = {error: "响应格式错误"}; }
      if (resp.error) { status.innerText = "失败：" + resp.error; return; }
      UTIL._semanticBatchState.tsv = resp.tsv_content || "";
      UTIL._semanticBatchState.header = resp.header || [];
      UTIL._semanticBatchState.filename = (resp.tsv_path && resp.tsv_path.split(/[\\/]/).pop()) || "semantic_filtered.tsv";
      status.innerText = "完成：保留 " + resp.kept + "/" + resp.total + " 行，设备 " + resp.device + "，已生成 " + (resp.tsv_path || "（内存）");
      var mapDiv = document.getElementById("sem_mapping");
      if (mapDiv) { mapDiv.style.display = "block"; }
      UTIL._fillSemanticMapping(UTIL._semanticBatchState.header);
    },
    error: function () {
      status.innerText = "请求失败。";
    }
  });
};

UTIL.semanticBatchDownload = function () {
  if (!UTIL._semanticBatchState.tsv) { alert("暂无可下载数据，请先运行。"); return; }
  var blob = new Blob([UTIL._semanticBatchState.tsv], {type: "text/plain;charset=utf-8"});
  var link = document.createElement("a");
  var url = window.URL.createObjectURL(blob);
  link.href = url;
  link.download = UTIL._semanticBatchState.filename || "semantic_filtered.tsv";
  document.body.appendChild(link);
  link.click();
  setTimeout(function () {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 0);
};

UTIL.semanticBatchLoad = function () {
  if (!UTIL._semanticBatchState.tsv) { alert("暂无可加载数据，请先运行。"); return; }
  var mapping = {
    "ID": (document.getElementById("sem_map_id") || {}).value || "",
    "DOCULECT": (document.getElementById("sem_map_doculect") || {}).value || "",
    "CONCEPT": (document.getElementById("sem_map_concept") || {}).value || "",
    "FORM": (document.getElementById("sem_map_form") || {}).value || ""
  };
  var text = UTIL._renameHeader(UTIL._semanticBatchState.tsv, mapping);
  UTIL._loadTsvText(text, UTIL._semanticBatchState.filename || "semantic_filtered.tsv");
  alert("已加载到 EDICTOR，可继续分词/对齐/同源检测。");
};

UTIL.ensureColumn = function (name) {
  name = (name || "").trim();
  if (!name) { return -1; }
  var upper = name.toUpperCase().replace(/_/g, '');

  /* 已存在则直接返回 */
  if (WLS.columns && WLS.columns.hasOwnProperty(upper)) {
    return WLS.columns[upper];
  }

  /* 创建新列（基于 addColumn 的逻辑精简版） */
  for (var idx in WLS) {
    if (!isNaN(idx)) {
      WLS[idx].push("");
    }
  }
  WLS.header.push(upper);
  WLS.column_names[upper] = upper;
  WLS.columns[upper] = WLS.header.length - 1;
  if (CFG.basics.indexOf(upper) === -1) {
    CFG.basics.push(upper);
  }
  return WLS.columns[upper];
};

/* 读取正字法表头（如果有），返回列名数组 */
UTIL.getOrthographyHeader = function (text) {
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line) { continue; }
    var parts = line.split(/\t/).map(function (cell) {
      return cell.replace(/^\uFEFF/, "").trim();
    });
    if (parts[0] && parts[0].toLowerCase().indexOf("grapheme") !== -1) {
      return parts;
    }
    break;
  }
  return [];
};

/* Resolve slash-separated choices per grapheme, prompting once per grapheme. */
UTIL.resolveOrthographyChoices = function (text) {
  var lines = text.split(/\r?\n/);
  var choices = {};
  var out = [];
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i];
    if (!line.trim()) { out.push(line); continue; }
    var parts = line.split(/\t/);
    if (parts[0] && parts[0].toLowerCase().indexOf("grapheme") !== -1) {
      out.push(line);
      continue;
    }
    if (parts.length < 2 || parts[1].indexOf("/") === -1) {
      out.push(line);
      continue;
    }
    var grapheme = parts[0].trim();
    var options = parts[1].split("/").map(function (opt) {
      return opt.trim();
    }).filter(function (opt) { return opt; });
    if (!options.length) {
      out.push(line);
      continue;
    }
    if (!choices.hasOwnProperty(grapheme)) {
      var msg = "Multiple mappings for " + grapheme + ":\n";
      for (var j = 0; j < options.length; j += 1) {
        msg += (j + 1) + ") " + options[j] + "\n";
      }
      var pick = prompt(msg + "Choose 1-" + options.length, "1");
      if (pick === null) { return null; }
      var idx = parseInt(pick, 10);
      if (!idx || idx < 1 || idx > options.length) { idx = 1; }
      choices[grapheme] = options[idx - 1];
    }
    parts[1] = choices[grapheme];
    out.push(parts.join("\t"));
  }
  return out.join("\n");
};

/* 解析正字法文件文本，返回 {grapheme: ipa} 映射 */
UTIL.parseOrthographyProfile = function (text) {
  var lines = text.split(/\r?\n/);
  var mapping = [];
  lines.forEach(function (line) {
    if (!line.trim()) { return; }
    var parts = line.split(/\t/);
    if (parts[0].toLowerCase().indexOf("grapheme") !== -1) { return; }
    var g = parts[0].trim();
    var ipa = (parts[1] || g).trim();
    if (g) {
      mapping.push([g, ipa]);
    }
  });
  /* 按长度降序，便于最长匹配 */
  mapping.sort(function (a, b) { return b[0].length - a[0].length; });
  return mapping;
};

/* 粗移植 lingpy.sequence.sound_classes.ipa2tokens，支持半附加符组合 */
UTIL.ipaToTokens = function (sequence, opts) {
  opts = opts || {};
  if (!sequence) { return []; }
  if (sequence.indexOf(" ") !== -1) {
    return sequence.trim().split(/\s+/);
  }
  var vowels = opts.vowels || "ṍʯεaeiouyáãæíõøúĩıœũūǒǝȇȗɐɑɒɔɘəɚɛɜɞɤɨɪɯɵɶɷɿʅʉʊʌʏᴀᴇᴜẽỹṳ";
  var diacritics = opts.diacritics || "!:|¯ʰʱʲʳʴʵʶʷʸʹʺʻʼʽʾʿˀˀ ˁ˂˃˄˅ˆˈˉˊˋˌˍˎˏːˑ˒˓˔˕˖˗˞˟ˠˡˢˣˤˬ˭ˮ˯˰˱˲˳˴˵˶˷˸˹˺˻˼˽˾˿̴̵̶̷̸̡̢̧̨̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̹̺̻̼͇͈͉͍͎̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̽̾̿̀́͂̓̈́͆͊͋͌̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛ͣͤͥͦͧͨͩͪͫͬͭͮͯ҃҄҅҆҇͘͟͢͝͞͠҈҉ՙٰܑٖ߲߫߬߭߮߯߰߱߳ᴬᴭᴮᴯᴰᴱᴲᴳᴴᴵᴶᴷᴸᴹᴺᴻᴼᴽᴾᴿᵀᵁᵂᵃᵄᵅᵆᵇᵈᵉᵊᵋᵌᵍᵎᵏᵐᵑᵒᵓᵔᵕᵖᵗᵘᵙᵚᵛᵜᵝᵞᵟᵠᵡᵢᵣᵤᵥᵦᵧᵨᵩᵪᵸᶛᶜᶝᶞᶟᶠᶡᶢᶣᶤᶥᶦᶧᶨᶩᶪᶫᶬᶭᶮᶯᶰᶱᶲᶳᶴᶵᶶᶷᶸᶹᶺᶻᶼᶽᶾᶿ᷎᷂᷊᷏᷽᷿᷀᷁᷃᷄᷅᷆᷇᷈᷉᷋᷌ᷓᷔᷕᷖᷗᷘᷙᷚᷛᷜᷝᷞᷟᷠᷡᷢᷣᷤᷥᷦ᷾᷼᷍ⁱ⁺⁻⁼⁽⁾ⁿ₊₋₌₍₎ₐₑₒₓₔₕₖₗₘₙₚₛₜ⃒⃓⃘⃙⃚⃥⃦⃪⃫⃨⃬⃭⃮⃯⃐⃑⃔⃕⃖⃗⃛⃜⃧⃩⃰→⇒⨧ⱼⱽⵯ゙゚ⷠⷡⷢⷣⷤⷥⷦⷧⷨⷩⷪⷫⷬⷭⷮⷯⷰⷱⷲⷳⷴⷵⷶⷷⷸⷹⷺⷻⷼⷽⷾⷿ꙯꙼꙽ꚜꚝꜛꜜꜝꜞꜟꞈ꞉꞊꣠꣡꣢꣣꣤꣥꣦꣧꣨꣩꣪꣫꣬꣭꣮꣯꣰꣱ꩰꭜꭞ︠︡︢︣︤︥︦̲";
  var stress = opts.stress || "ˈˌ'";
  var tones = opts.tones || "¹²³⁴⁵⁶⁷⁸⁹⁰₁₂₃₄₅₆₇₈₉₀0123456789˥˦˧˨˩˪˫-꜈-꜉-꜊-꜋-꜌-꜍-꜎-꜏-꜐-꜑-꜒-꜓-꜔-꜕-꜖-ꜗ-ꜘ-ꜙ-ꜚ-꜀-꜁-꜂-꜃-꜄-꜅-꜆-꜇";
  var combiners = opts.combiners || "͜͡";
  var breaks = opts.breaks || ".-";
  var semi = typeof opts.semi_diacritics === "string" ? opts.semi_diacritics : "hsʃ̢ɕʂʐʑʒw";
  var mergeVowels = opts.merge_vowels !== false;
  var mergeGeminates = opts.merge_geminates !== false;
  var out = [];
  var vowel = false;
  var tone = false;
  var merge = false;
  var start = true;
  for (var idx = 0; idx < sequence.length; idx += 1) {
    var ch = sequence[idx];
    if (breaks.indexOf(ch) !== -1) {
      start = true; vowel = false; tone = false; merge = false; continue;
    }
    if (combiners.indexOf(ch) !== -1) {
      if (!out.length) { out.push("\u2205" + ch); }
      else { out[out.length - 1] += ch; }
      merge = false; continue;
    }
    if (stress.indexOf(ch) !== -1) {
      out.push(ch); merge = true; tone = false; vowel = false; start = false; continue;
    }
    if (merge) {
      out[out.length - 1] += ch;
      if (vowels.indexOf(ch) !== -1) { vowel = true; }
      merge = false; continue;
    }
    if (diacritics.indexOf(ch) !== -1) {
      if (!start) { out[out.length - 1] += ch; }
      else { out.push(ch); start = false; merge = true; }
      continue;
    }
    if (vowels.indexOf(ch) !== -1) {
      if (vowel && mergeVowels) { out[out.length - 1] += ch; }
      else { out.push(ch); }
      vowel = true; start = false; tone = false; continue;
    }
    if (tones.indexOf(ch) !== -1) {
      if (tone) { out[out.length - 1] += ch; }
      else { out.push(ch); }
      tone = true; start = false; vowel = false; continue;
    }
    if (semi.indexOf(ch) !== -1 && !start && !vowel && !tone && out.length && ["_", "◦", "+"].indexOf(out[out.length - 1]) === -1) {
      out[out.length - 1] += ch;
      continue;
    }
    out.push(ch);
    start = false; tone = false; vowel = false;
  }
  if (!mergeGeminates || !out.length) { return out; }
  var merged = [out[0]];
  for (var j = 0; j < out.length - 1; j += 1) {
    var a = out[j];
    var b = out[j + 1];
    if (a === b) { merged[merged.length - 1] += b; }
    else { merged.push(b); }
  }
  return merged;
};

/* 根据 profile 对单条字符串分词，返回空格分隔的 tokens */
UTIL.tokenizeWithProfile = function (value, profile) {
  if (!value) { return ""; }
  // Remove whitespace before matching against the profile to avoid early returns
  value = value.trim().replace(/\s+/g, "");
  if (!value) { return ""; }
  var tokens = [];
  var chars = Array.from(value);
  var i = 0;
  while (i < chars.length) {
    var matched = false;
    for (var k = 0; k < profile.length; k += 1) {
      var g = profile[k][0];
      var glen = Array.from(g).length;
      var slice = chars.slice(i, i + glen).join("");
      if (slice === g) {
        tokens.push(profile[k][1]);
        i += glen;
        matched = true;
        break;
      }
    }
    if (!matched) {
      var ch = chars[i];
      if (/\p{M}/u.test(ch) && tokens.length > 0) {
        tokens[tokens.length - 1] += ch;
      } else {
        tokens.push(ch);
      }
      i += 1;
    }
  }
  return tokens.join(" ");
};

/* 提取最简单的字母正字法单元：跳过空格，连字符单独，附加符号跟在前一个字母后 */
UTIL.extractSimpleGraphemes = function (value) {
  if (!value) { return []; }
  var tokens = [];
  var chars = Array.from(value);
  chars.forEach(function (ch) {
    if (/\s/.test(ch)) { return; }
    if (ch === "-") { tokens.push(ch); return; }
    if (/[\p{M}\p{Lm}\p{Sk}\p{No}]/u.test(ch)) {
      if (tokens.length) { tokens[tokens.length - 1] += ch; }
      else { tokens.push(ch); }
      return;
    }
    tokens.push(ch);
  });
  return tokens;
};


/* 载入正字法文件并对数据分词，写入目标列 */
UTIL.handleOrthoUpload = function (evt) {
  if (!evt.target.files || !evt.target.files.length) { return; }
  var file = evt.target.files[0];
  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    var textForProfile = text;
    if (text.indexOf("/") !== -1) {
      var choose = confirm("正字法文件含有“/”多候选映射，是否为每个 grapheme 选择一个结果并应用到全表？");
      if (choose) {
        var resolved = UTIL.resolveOrthographyChoices(text);
        if (resolved === null) { return; }
        textForProfile = resolved;
      }
    }
    var profile = UTIL.parseOrthographyProfile(textForProfile);
    var profileHeader = UTIL.getOrthographyHeader(textForProfile);
    if (!profile.length) {
      alert("正字法文件为空或格式不符（需 TSV: Grapheme\\tIPA）");
      return;
    }

    /* 选择源列与目标列 */
    var header = WLS.header || [];
    var defaultSrc = "FORM";
    if (typeof CFG._segments !== "undefined" && CFG._segments > -1) {
      defaultSrc = header[CFG._segments];
    } else if (header.indexOf("IPA") !== -1) {
      defaultSrc = "IPA";
    }
    var src = prompt("选择分词的源列名", defaultSrc);
    if (!src) { return; }
    var srcIdx = header.indexOf(src);
    if (srcIdx === -1) {
      alert("找不到列：" + src + "。请检查列名。");
      return;
    }
    var dest = prompt("分词结果写入的目标列名（默认 TOKENS）", "TOKENS");
    if (!dest) { return; }
    var destIdx = UTIL.ensureColumn(dest);

    if (CFG && CFG.python) {
      var tokColumn = "Grapheme";
      if (profileHeader.length > 1) {
        tokColumn = profileHeader.indexOf("IPA") !== -1 ? "IPA" : profileHeader[1];
      }
      var tokPrompt = prompt("Tokenizer 输出列名（正字法文件表头）", tokColumn);
      if (!tokPrompt) { return; }
      tokColumn = tokPrompt;
      var items = [];
      for (var key in WLS) {
        if (!isNaN(key)) {
          items.push([key, WLS[key][srcIdx] || ""]);
        }
      }
      $.ajax({
        async: true,
        type: "POST",
        url: "orthography_tokenize.py",
        dataType: "json",
        data: {
          payload: JSON.stringify({
            profile: textForProfile,
            values: items,
            column: tokColumn
          })
        },
        success: function (resp) {
          if (!resp || resp.error) {
            alert("Tokenizer 失败：" + (resp && resp.error ? resp.error : "unknown"));
            return;
          }
          var changed = 0;
          resp.tokens.forEach(function (pair) {
            var idx = pair[0];
            var tok = pair[1] || "";
            if (typeof WLS[idx] !== "undefined") {
              WLS[idx][destIdx] = tok;
              changed += 1;
            }
          });

          /* 更新 tokens 索引 */
          CFG._segments = destIdx;
          CFG.tokens = header[destIdx];
          showWLS(getCurrent());
          var msg = "分词完成（Tokenizer），写入列 " + dest + "，共处理 " + changed + " 行。";
          var saveNow = confirm(msg + "\n\n选择“确定”立即覆盖保存当前文件（需要本地运行并使用本地文件）；选择“取消”保留内存结果，稍后可用下载按钮导出。");
          if (saveNow) {
            if (typeof saveFileInPython === "function") {
              saveFileInPython();
            } else {
              alert("未找到本地保存函数，请用浏览器下载按钮手动保存。");
            }
          } else {
            alert("已保留内存结果，可用下载/保存按钮手动导出。");
          }
        },
        error: function (xhr, status, err) {
          alert("Tokenizer 请求失败：" + (err || status || "unknown"));
        }
      });
      return;
    }

    var changed = 0;
    for (var key in WLS) {
      if (!isNaN(key)) {
        var val = WLS[key][srcIdx] || "";
        var tok = UTIL.tokenizeWithProfile(val, profile);
        WLS[key][destIdx] = tok;
        changed += 1;
      }
    }

    /* 更新 tokens 索引 */
    CFG._segments = destIdx;
    CFG.tokens = header[destIdx];
    showWLS(getCurrent());
    var msg = "分词完成，写入列 " + dest + "，共处理 " + changed + " 行。";
    var saveNow = confirm(msg + "\n\n选择“确定”立即覆盖保存当前文件（需要本地运行并使用本地文件）；选择“取消”保留内存结果，稍后可用下载按钮导出。");
    if (saveNow) {
      if (typeof saveFileInPython === "function") {
        saveFileInPython();
      } else {
        alert("未找到本地保存函数，请用浏览器下载按钮手动保存。");
      }
    } else {
      alert("已保留内存结果，可用下载/保存按钮手动导出。");
    }
  };
  reader.readAsText(file, "utf-8");
  /* 重置 input，方便重复选择同一文件 */
  evt.target.value = "";
};

/* 生成正字法文件：从指定列提取符号，输出 Grapheme\tIPA 供校对 */
UTIL.generateOrthography = function () {
  if (!WLS || !WLS.header) {
    alert("请先加载一个 TSV 数据集。");
    return;
  }

  // 选择默认列：优先 Tokens，其次 IPA，再次 FORM
  var header = WLS.header;
  var defaultCol = null;
  if (typeof CFG._segments !== 'undefined' && CFG._segments > -1) {
    defaultCol = header[CFG._segments];
  } else if (header.indexOf("IPA") !== -1) {
    defaultCol = "IPA";
  } else if (header.indexOf("FORM") !== -1) {
    defaultCol = "FORM";
  } else {
    defaultCol = header[header.length - 1];
  }

  var col = prompt("用于生成正字法的列名（默认 " + defaultCol + "）", defaultCol);
  if (!col) { return; }
  var idx = header.indexOf(col);
  if (idx === -1) {
    alert("找不到列：" + col + "。请确认列名大小写一致。");
    return;
  }

  // 按空格或 IPA 分词（含半附加符号）聚合成基本单元
  function extractUnits(val) {
    if (!val) { return []; }
    return UTIL.extractSimpleGraphemes(val);
  }

  var units = new Set();
  for (var key in WLS) {
    if (!isNaN(key)) {
      var val = WLS[key][idx];
      if (!val) { continue; }
      var parts = extractUnits(val);
      parts.forEach(function (p) { if (p) { units.add(p); } });
    }
  }

  if (units.size === 0) {
    alert("未提取到任何符号，请检查列内容。");
    return;
  }

  var lines = ["Grapheme\tIPA"];
  Array.from(units).sort().forEach(function (u) {
    lines.push(u + "\t" + u);
  });

  var text = lines.join("\n");
  var blob = new Blob([text], {type: 'text/tab-separated-values;charset=utf-8'});
  var fname = (CFG.filename || "orthography") + "_profile.tsv";
  saveAs(blob, fname);
  alert("已生成正字法文件（" + fname + "），请校对后再用于分词。");
};

UTIL.settings = {
  'remote_databases' : ['germanic', 'huber1992', 'burmish', 'sinotibetan', 'tukano'],
  'triple_path' : 'triples/triples.py',
  'summary_path' : 'triples/summary.py',
  'basics' : ['DOCULECT', 'GLOSS', 'CONCEPT', 'IPA', 'TOKENS', 'COGID', 
    'TAXON', 'TAXA', 'PROTO', 'PROTO_TOKENS', 'ETYMONID', 'CHINESE', 'CONCEPTLIST',
    'ORTHOGRAPHY','WORD','TRANSCRIPTION','SEGMENTS', 'PARTIALIDS', 'NOTE'],
  'preview': 10,
  'noid': false, 
  'sorting': false, 
  'formatter': false, 
  'root_formatter' : false,
  '_alignment':false,
  '_patterns':-1, /* patterns of sound correspondences */
  'highlight': ['TOKENS','ALIGNMENT', 'SEGMENTS'],
  'sampa' : ['IPA','TOKENS', 'SEGMENTS', 'TRANSCRIPTION'],
  'sound_class_model': 'dolgo',
  'css': ["menu:show","database:hide"],
  'status' : {},
  'server_side_files' : [],
  'server_side_bases' : [],
  'storable' : false,
  'last_time' : false, 
  'parsed' : false,
  'doculects' : false,
  'concepts' : false,
  'columns' : false,
  'remote_dbase' : 'triples.sqlite3',
  '_cpentry' : false,
  '_almcol' : 'ALIGNMENT',
  'template' : false,
  'update_mode' : "save",
  'align_all_words' : true,
  'async' : false,
  'tone_marks' : '⁰¹²³⁴⁵⁶₀₁₂₃₄₅₆',
  'morpheme_marks' : '+_◦←→',
  'navbar' : true,
  'gap_marker' : '-',
  'missing_marker' : 'Ø',
  'morpheme_separator' : '+',
  'check_remote_intervall' : 10,
  '_proto' : false,
  '_note' : 'NOTE',
  'separator': "\t",
  'comment': '#',
  'proto' : -1,
  '_morphology_mode': 'full',
  '_recompute_patterns': false,
  'display': ['filedisplay'],
  'quintiles': 'QUINTILES',
  'python': false,
  'lingpy': false,
  'with_lingpy': false,
  'loaded_files': ['filedisplay', 'settings']
}

UTIL.apply_sound_class_model = function(model) {
  if (typeof SOUND_CLASS_MODELS === "undefined") {
    return;
  }
  var selected = model || 'dolgo';
  if (!(selected in SOUND_CLASS_MODELS)) {
    selected = 'dolgo';
  }
  var mapping = SOUND_CLASS_MODELS[selected];
  if (!mapping) {
    return;
  }
  var merged = {};
  if (typeof SOUND_CLASS_META !== "undefined") {
    merged._tones = SOUND_CLASS_META._tones;
    merged._diacritics = SOUND_CLASS_META._diacritics;
    merged._vowels = SOUND_CLASS_META._vowels;
  }
  for (var key in mapping) {
    if (Object.prototype.hasOwnProperty.call(mapping, key)) {
      merged[key] = mapping[key];
    }
  }
  DOLGO = merged;
  CFG.sound_class_model = selected;
};

UTIL.settable = {
  "lists" : [
    "highlight", 
    "sampa",
    "css",
    "basics",
    "_selected_doculects",
    "_selected_concepts",
    "sorted_taxa",
    "sorted_concepts",
    "display"
  ],
  "items" : [
    "missing_marker",
    "separator",
    "gap_marker",
    "formatter",
    "root_formatter",
    "note_formatter",
    "pattern_formatter",
    "publish",
    "_almcol",
    "filename",
    "navbar",
    "_morphology_mode",
    "sound_class_model"
  ],
  "integers" : [
    "preview"
  ],
  "bools" : [
    "publish",
    "navbar"
  ],
  "dicts" : [
  ]
};

UTIL.open_remote_dbase = function(dbase, frame) {
  var idx = document.getElementById(dbase);
  for (var i=0,option; option=idx.options[i]; i++) {
    if (option.selected) {
      _fr = option.value.split('.');
      file = _fr[1];
      remote = _fr[0];
      //-> console.log(file, remote, _fr, option.value);
      var url = UTIL.settings.summary_path +"?file="+file+'&remote_dbase='+remote+'&summary=summary';
      document.getElementById(frame).src = url;
      break;
    }
  }
}


UTIL.load_settings = function() {

  var settables = ['preview', 'cognates', 'alignments', 'morphemes', 'roots', 'highlight', 'sampa',
    'sound_class_model', 'sources', 'note', 'proto', 'patterns', 'doculectorder', 'tokens'];
  var entries = {};
  var i, settable;
  var val;
  var defaults, outs, j, def, entry;

  for (i = 0; settable = settables[i]; i += 1) {
    entries[settable] = document.getElementById('settings_'+settable);
  }

  /* start with preview */
  entries['preview'].value = CFG['preview'];
  if (entries['sound_class_model']) {
    entries['sound_class_model'].value = CFG['sound_class_model'] || 'dolgo';
  }
  console.log("entries here", entries);

  /* now add cognates for fun */
  if (typeof CFG._fidx != 'undefined') {
    entries['cognates'].value = (CFG['_fidx'] != -1) 
      ? WLS['header'][CFG['_fidx']]
      : ''
      ;
  }
  entries['tokens'].value = (CFG['_segments'] != -1) 
    ? WLS['header'][CFG['_segments']]
    : ''
    ;

  entries['roots'].value = (CFG['_roots'] != -1) 
    ? WLS['header'][CFG['_roots']]
    : ''
    ;
  entries['alignments'].value = (CFG['_alignments'] != -1) 
    ? WLS['header'][CFG['_alignments']]
    : ''
    ;
  entries['morphemes'].value = (CFG['_morphemes'] != -1) 
    ? WLS['header'][CFG['_morphemes']]
    : ''
    ;

  entries['patterns'].value = (CFG['_patterns'] != -1)
    ? WLS['header'][CFG['_patterns']]
    : '';
  
  for (i = 0; val = ['highlight', 'sampa'][i]; i += 1) {
    defaults = CFG[val];
    outs = [];
    for (j = 0; def = defaults[j]; j += 1) {
      if (WLS.header.indexOf(def) != -1) {
	      outs.push(def);
      }
    }
    entries[val].value = outs.join(',');
  }
      
  for (i = 0; entry = ['patterns', 'cognates', 'alignments', 'morphemes', 'roots', 'note'][i]; i++) {
    $(entries[entry]).autocomplete({
        source: WLS.header});
  }
  $(entries['proto']).autocomplete({source: CFG.sorted_taxa});
  $(entries['doculectorder']).autocomplete({source: CFG.sorted_taxa});
  entries['doculectorder'].value = CFG.sorted_taxa.join(',');
  /* check if lingpy is set to true */
};

UTIL.isValidHeader = function(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code == 95))
        //!(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;  
  }
  return true;
};

UTIL.upload_submit = function() {
  var i, j, row, key, entry;
  var text = document.getElementById("upload_text");
  var lines = text.value.split(/\n|\r\n/);
  var data = {};

  /* get new identifier */
  var new_url = "triples/triples.py";
  var postdata = {"file": CFG['filename'], remote_dbase: CFG["remote_dbase"], "new_ID": true}
  var newIdx = 0;
  $.ajax({
    async: false,
    type: "POST",
    data: postdata,
    contentType: "application/text; charset=utf-8",
    url: new_url,
    dataType: "text",
    success: function(data) {
	    newIdx = parseInt(data);
    },
    error: function() {
      fakeAlert('data could not be stored');
    }
  });
  
  if (newIdx == 0 || typeof newIdx != "number" || newIdx == NaN || ""+newIdx+"" == "NaN") {
    var keys = [];
    for (key in WLS) {
      if (""+parseInt(key) != "NaN") {
        keys.push(parseInt(key));
      }
    }
    keys.sort(function(x, y){return x-y});
    var max_key = keys[keys.length-1];
    console.log(keys, max_key);
    newIdx = max_key+1
  }

  if (lines.length >= 2) {
    var header = lines[0].split(/\t|\|\|/);
    for (i=0; i<header.length; i++) {
      if (!(UTIL.isValidHeader(header[i]))) {
        fakeAlert("Problem with the header «"+header[i]+"»");
        return;
      }
    }
  }
  else {
    fakeAlert("no data were submitted");
    return;
  }
  if (header.indexOf("DOCULECT") == -1 || header.indexOf("CONCEPT") == -1) {
    fakeAlert("Header missing information on DOCULECT or CONCEPT");
    return;
  }
  for (i=1; i<lines.length; i++) {
    row = lines[i].split(/\t|\|\|/);
    if (row.length != header.length) {
      fakeAlert("row "+i+" has a different length than the header");
      return;
    }
    data[newIdx] = {}
    for (j=0; j<header.length; j++) {
      data[newIdx][header[j]] = row[j];
    }
    if ("NOTE" in data[newIdx]) {
      data[newIDX]["NOTE"] = "[N] "+data["NOTE"];
    }
    else {
      data[newIdx]["NOTE"] = "[N]";
    }
    newIdx += 1;
  }
  WLS.rows = [];
  for (key in data) {
    /* check if doculect is in taxa and concept is in concepts */
    if (data[key]["DOCULECT"] in WLS.taxa && data[key]["CONCEPT"] in WLS.concepts) {
      WLS[key] = [];
      WLS.taxa[data[key]["DOCULECT"]].push(parseInt(key));
      WLS.concepts[data[key]["CONCEPT"]].push(parseInt(key));
      WLS._trows.push(parseInt(key));
      WLS.rows.push(parseInt(key));
      for (i=0; i<WLS.header.length; i++) {
        entry = data[key][WLS.header[i]];
        if (typeof entry == "undefined") {
          entry = "";
        }
        WLS[key].push(entry);
      }
    }
    else {
      fakeAlert("doculect "+data[key]["DOCULECT"]+" or concept "+data[key]["CONCEPT"]+" undefined");
    }
  }
  console.log(data);
  text.value = "";
  showWLS(1);
};

UTIL.refresh_settings = function() {

  var settables = ['preview', 'cognates', 'alignments', 'morphemes', 'roots', 'highlight', 'sampa',
    'sound_class_model', 'sources', 'note', 'proto', 'doculectorder', 'tokens', 'patterns'];
  var entries = {};
  var i, settable;
  var stax, names;
  var entry, this_entry, idx;
  var j, vals, new_vals;

  for (i = 0; settable = settables[i]; i += 1) {
    entries[settable] = document.getElementById('settings_'+settable);
  }

  CFG['preview'] = parseInt(entries['preview'].value);
  CFG['proto'] = (entries['proto'].value != '') ? entries['proto'].value : -1;
  if (CFG['sorted_taxa'].value != '') {
    stax = [];
    names = entries['doculectorder'].value.split(',');
    for (i = 0; i < names.length; i += 1) {
      if (LIST.has(CFG.sorted_taxa, names[i])) {
        stax.push(names[i]);
      }  
    }
    if (stax.length == CFG.sorted_taxa.length) {
      CFG.sorted_taxa = stax;
    }
    else {
      fakeAlert('The doculects you selected do not match with the names in your data!');
      entries['doculectorder'].value = CFG.sorted_taxa.join(',');
    }
  }
  
  for (i = 0; entry = ['cognates', 'alignments', 'morphemes', 'roots', 'sources', 'note', "patterns"][i]; i += 1) {
    if (entry == 'cognates') {
      this_entry = '_fidx';
    }
    else {
      this_entry = '_'+entry;
    }
    if (entries[entry].value) {
      idx = WLS.header.indexOf(entries[entry].value);
      CFG[this_entry] = (idx != -1)
        ? idx
        : -1;
      if (entry == 'cognates' && CFG[this_entry] != -1) {
        resetFormat(entries[entry].value);
      }
      if (entry == 'roots' && CFG[this_entry] != -1) {
        resetRootFormat(entries[entry].value);
      }
      if (entry == 'note' && CFG[this_entry] != -1) {
        CFG['note_formatter'] = WLS.header[CFG['_note']];
      }
      if (entry == 'patterns' && CFG[this_entry] != -1) {
        CFG['pattern_formatter'] = WLS.header[CFG['_patterns']];
      }

    }
    else {
      CFG[this_entry] = -1;
      if (entry == 'cognates') {
        resetFormat(false);
      }
      if (entry == 'roots') {
        resetRootFormat(false);
      }
    }
  }

  for (i = 0; entry=['highlight', 'sampa'][i]; i += 1) {
    vals = entries[entry].value.split(',');
    new_vals = [];
    for (j = 0; j < vals.length; j += 1) {
      if (WLS.header.indexOf(vals[j]) != -1) {
        new_vals.push(vals[j]);
      }
    }
    CFG[entry] = new_vals;
    entries[entry].value = new_vals.join(',');
  }
  if (entries['sound_class_model']) {
    UTIL.apply_sound_class_model(entries['sound_class_model'].value || 'dolgo');
  }
  showWLS(getCurrent());
};


UTIL.filter_by_concept = function(concept) {
  $('#select_concepts').multiselect('deselectAll', false);
  $('#select_concepts').multiselect('select', concept);
  if (document.getElementById('cognates_select_concepts') != null) {
    $('#cognates_select_concepts').multiselect('deselectAll', false);
    $('#cognates_select_concepts').multiselect('select', concept);
    display_cognates(concept);
  }
  if (document.getElementById('partial_select_concepts') != null) {
    $('#partial_select_concepts').multiselect('deselectAll', false);
    $('#partial_select_concepts').multiselect('select', concept);
    PART.display_partial(concept);
  }
  applyFilter();
  showWLS(1);
};

UTIL.display_next_concept = function() {
  if (typeof CFG._current_concept == 'undefined') {
    CFG._current_concept = WLS.c2i[1];
  }
  var ccon = CFG._current_concept;
  var ncon = CFG.sorted_concepts[(CFG.sorted_concepts.indexOf(ccon)+1)];
  if (typeof ncon == 'undefined') {
    ncon = CFG.sorted_concepts[0];
  }
  this.filter_by_concept(ncon);
  CFG['_current_concept'] = ncon;
  /* check whether cognate panel is also active */
};

UTIL.display_previous_concept = function() {
  if (typeof CFG._current_concept == 'undefined') {
    CFG._current_concept = WLS.c2i[1];
  }
  var ccon = CFG._current_concept;
  var ncon = CFG.sorted_concepts[(CFG.sorted_concepts.indexOf(ccon)-1)];
  if (typeof ncon == 'undefined') {
    ncon = CFG.sorted_concepts[(CFG.sorted_concepts.length-1)];
  }
  this.filter_by_concept(ncon);
  CFG['_current_concept'] = ncon;
};

UTIL.show_quintuples = function(event, widx) {
  event.preventDefault();
  var entry = WLS[widx][WLS.header.indexOf(CFG.quintiles)];
  var segments = entry.split(' ');
  var i, j, quint, start, content;
  var text = '';
  var sdata = [];
  var tds = {};
  var bleft, bright;

  var morphemes = MORPH.get_morphemes(segments);
  text += '<tr>';
  for (i=0; i<morphemes.length; i++) {
    if (i != 0) {
      text += '<th></th>';
    }
    if (CFG.root_formatter) {
      content = CFG.root_formatter+': '+WLS[widx][CFG._roots].split(' ')[i];
    }
    else {
      content = '---';
    }
    text += '<th style="color:white;padding:6px;border-top:5px solid black;border-left:5px solid black;border-right:5px solid black;" colspan="'+morphemes[i].length+'">'+content+'</th>';
  }
  text += '</tr>';
  text += '<tr>';
  var tokens = MORPH.get_morphemes(WLS[widx][CFG._alignments].split(' '));
  for (i=0; i<morphemes.length; i++) {
    if (i!=0) {
      text += '<td></td>';
    }
    if (morphemes[i].length == 1) {
      text += '<td style="border:5px solid black;">'+plotWord(tokens[i].join(' '))+'</td>';
    }
    else {
      for (j=0; j<tokens[i].length; j++) {
        text += '<td style="border:5px solid black;">'+plotWord(tokens[i][j])+'</td>';
      }
    }
  }
  text += '</tr>';
  
  for (j=0; j<6; j++) {
    text += '<tr>';
    for (i=0; i<segments.length; i++) {
      quint = segments[i].split('|');
      if (quint.length == 1) {
        if (quint == CFG.morpheme_separator) {
                text += '<td style="border: 5px transparent white;border-right: 5px solid black;">';
              }
              else if (j == 0) {
                text += '<td style="border-right:5px solid black;border-left:5px solid black;">';
              }
              else if (j == 4 || j == 5) {
                text += '<td style="border-bottom:5px solid black;border-right:5px solid black;border-left:5px solid black;">';
              }
              else {
                text += '<td style="border-bottom:5px solid white;border-right:5px solid black;border-left:5px solid black;border-top:5px solid white;">';
              }
      }
      else if (j == 5) {
              text += '<td style="text-align:center;border-bottom:5px solid black;border-right:5px solid black;border-left:5px solid black;border-top:5px solid black;">';
      }
      else if (quint[j-1] != quint[j] && j > 0 && segments[i] != "+" && segments[i] != "?") {
              if (j != 4) {
                text += '<td style="border-bottom:5px transparent white;border-right:5px solid black;border-left:5px solid black;border-top:5px solid black;">';
              }
              else {
                text += '<td style="border-bottom:5px solid black;border-right:5px solid black;border-left:5px solid black;border-top:5px solid black;">';
              }
      }
      else if (j == 0) {
              text += '<td style="border-bottom:5px transparent white;border-right:5px solid black;border-left:5px solid black;border-top:5px solid black;">';
      }
      else if (j == 4) {
              text += '<td style="border-bottom:5px solid black;border-right:5px solid black;border-left:5px solid black;border-top:5px solid white;">';
      }
      else {
              text += '<td style="border-bottom:5px transparent black;border-right:5px solid black;border-left:5px solid black;border-top:5px solid white;">';
      }
      
      if (j == 5 && typeof quint[j] != 'undefined') {
              text += '<span style="color:white;font-weight:normal;">'+quint[j]+'</span>';
      }
      else if (j == 5) {
        text += ' ';
      }
      else if (typeof quint[j] != 'undefined' && quint != CFG.morpheme_separator && quint != "?") {
              text += plotWord(quint[j], span='span');
      }
      else if (quint == CFG.morpheme_separator) {
        text += ' ';
      }
      else if (quint == '?' || typeof quint[j] == 'undefined' || quint.length == 1) {
              text += '<span style="color:white">Ø</span>';
      }
      else {
              text += plotWord(quint[0], span='span');
      }
    }
    text += '</td></tr>';
  }
  //text += '<tr><td style="border-bottom:4px solid black;" colspan="'+segments.length+'"></td>';
  text = '<div style="padding:5px;border:6px solid white;"><table style="padding:20px;">'+text+'</table></div>';
  text = '<div class="edit_links niceblue" id="quintuple-popup" data-value="'+widx+'">'+
    '<span class="main_handle pull-left" style="margin-left:5px;margin-top:2px;"></span>' +
    '<p>Probability representation of «'+widx+'»:</p>' + text;
  text += '<input class="btn btn-primary submit" type="button" onclick="$(\'#quintuple-overview\').remove();basickeydown(event);" value="CLOSE" />' + 
    '</div><br><br></div>';
  var popup = document.createElement('div');
  popup.id = 'quintuple-overview';
  popup.className = 'editmode';
  document.body.appendChild(popup);
  popup.innerHTML = text;
  $('#quintuple-popup').draggable({handle:'.main_handle'}).resizable();
};


UTIL.subgroups = [
  '<sup class="ball" style="background-color:#a6cee3">FFF</sup>', 
  '<sup class="ball" style="background-color:#1f78b4">FFF</sup>', 
  '<sup class="ball" style="background-color:#b2df8a">FFF</sup>', 
  '<sup class="ball" style="background-color:#33a02c">FFF</sup>', 
  '<sup class="ball" style="background-color:#fb9a99">FFF</sup>', 
  '<sup class="ball" style="background-color:#e31a1c">FFF</sup>', 
  '<sup class="ball" style="background-color:#fdbf6f">FFF</sup>', 
  '<sup class="ball" style="background-color:#ff7f00">FFF</sup>', 
  '<sup class="ball" style="background-color:#cab2d6">FFF</sup>', 
  '<sup class="ball" style="background-color:#6a3d9a">FFF</sup>', 
  '<sup class="ball" style="background-color:#ffff99">FFF</sup>', 
  '<sup class="ball" style="background-color:#b15928">FFF</sup>',
  '<sup class="ball" style="color:#a6cee3">FFF</sup>', 
  '<sup class="ball" style="color:#1f78b4">FFF</sup>', 
  '<sup class="ball" style="color:#b2df8a">FFF</sup>', 
  '<sup class="ball" style="color:#33a02c">FFF</sup>', 
  '<sup class="ball" style="color:#fb9a99">FFF</sup>', 
  '<sup class="ball" style="color:#e31a1c">FFF</sup>', 
  '<sup class="ball" style="color:#fdbf6f">FFF</sup>', 
  '<sup class="ball" style="color:#ff7f00">FFF</sup>', 
  '<sup class="ball" style="color:#cab2d6">FFF</sup>', 
  '<sup class="ball" style="color:#6a3d9a">FFF</sup>', 
  '<sup class="ball" style="color:#ffff99">FFF</sup>', 
  '<sup class="ball" style="color:#b15928">FFF</sup>' 
]; 

/* Function links tokens and alignemnts with each other by making sure they have the same content
 * apart from brackets and gaps.
 */
UTIL.tokens2alignment = function(tokens, alignment){
  var i;
  var new_alm = [];
  var sidx = 0;
  for (i=0; i<alignment.length; i++) {
    next_alm = alignment[i];
    if ("(-)".indexOf(next_alm) == -1) {
      new_alm.push(tokens[sidx]);
      sidx += 1;
    }
    else {
      new_alm.push(next_alm);
    }
  }
  if (sidx != tokens.length) {
    new_alm = tokens.join(" ");
  }
  else {
    new_alm = new_alm.join(" ");
  }
  return new_alm
};
  


var ALIAS = {
  'doculect': ['TAXON', 'LANGUAGE', 'DOCULECT', 'DOCULECTS', 'TAXA', 'LANGUAGES', 'CONCEPTLIST'],
  'concept': ['CONCEPT', 'GLOSS'],
  'segments' : ['SEGMENTS', 'TOKENS'],
  'alignment' : ['ALIGNMENT'],
  "subgroup": ["SUBGROUP"],
  'morphemes' : ['MORPHEMES'],
  'transcription' : ['IPA', 'TRANSCRIPTION'],
  'cognates' : ['COGID'],
  'roots' : ['PARTIALIDS', 'COGIDS'],
  'alignments' : ['ALIGNMENT'],
  'glottolog' : ['GLOTTOLOG', 'GLOTTOCODE'],
  'concepticon' : ['CONCEPTICON', 'CONCEPTICONID'],
  'sources' : ['SOURCE', "REFERENCE", "SOURCES"],
  'note' : ['NOTE', 'COMMENT', 'NOTES', 'COMMENTS'],
  'patterns' : ['PATTERNS']
}

/* text object stores text-related functions */
var TEXT = {};

/* make sure that no bad characters are mistakenly displayed when rendering
 * html or other markup */
TEXT.encodeComments = function(text) {
  var subs = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#039;',
    '<': '&lt;',
    '>': '&gt;'
  };
  
  var out = '';
  for (var i=0,c; c=text[i]; i++) {
    if (c in subs) {
      out += subs[c];
    }
    else {
      out += c;
    }
  }
  return out;
};

/* function replaces quotes in text by the Finnish ones, to avoid problems here */
TEXT.escapeValue = function(text) {
  var out = '';
  if (typeof text != 'string') {
    text = ''+text;
  }
  for (var i=0,c; c=text[i]; i++) {
    if (c == '"') {
      out += '”';
    }
    else {
      out += c;
    }
  }
  return out;
};


var LIST = {};
LIST.count = function(x, y){
  var count = 0;
  for(var i = 0; i < x.length; ++i){
      if(x[i] == y)
          count++;
  }
  return count;
};
LIST.has = function(x, y){
  if (x.indexOf(y) != -1){
    return true;
  }
  return false;
};
LIST.sum = function(x) {
  /* https://stackoverflow.com/questions/3762589/fastest-javascript-summation */
  return x.reduce(function(pv, cv) { return pv + cv; }, 0);
};
