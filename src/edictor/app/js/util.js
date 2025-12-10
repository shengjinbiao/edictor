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

/* 根据 profile 对单条字符串分词，返回空格分隔的 tokens */
UTIL.tokenizeWithProfile = function (value, profile) {
  if (!value) { return ""; }
  /* 如果已有空格分词，直接标准化空格 */
  if (value.indexOf(" ") !== -1) {
    return value.trim().split(/\s+/).join(" ");
  }
  var tokens = [];
  var chars = Array.from(value); // 正确处理代理对
  var i = 0;
  while (i < chars.length) {
    var matched = false;
    // 按 profile 中最长的图形匹配
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
      // 若是附加符号（结合符号），附着到前一 token
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

/* 载入正字法文件并对数据分词，写入目标列 */
UTIL.handleOrthoUpload = function (evt) {
  if (!evt.target.files || !evt.target.files.length) { return; }
  var file = evt.target.files[0];
  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    var profile = UTIL.parseOrthographyProfile(text);
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

  // 按空格或“字母+附加符号”聚合成基本单元
  function extractUnits(val) {
    var res = [];
    if (!val) { return res; }
    if (val.indexOf(" ") !== -1) {
      val.trim().split(/\s+/).forEach(function (p) { if (p) { res.push(p); } });
      return res;
    }
    var chars = Array.from(val);
    var cur = "";
    for (var i = 0; i < chars.length; i += 1) {
      var ch = chars[i];
      if (/\p{M}/u.test(ch)) {
        cur = cur ? (cur + ch) : ch;
      } else {
        if (cur) { res.push(cur); }
        cur = ch;
      }
    }
    if (cur) { res.push(cur); }
    return res;
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
    "_morphology_mode"
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
    'sources', 'note', 'proto', 'patterns', 'doculectorder', 'tokens'];
  var entries = {};
  var i, settable;
  var val;
  var defaults, outs, j, def, entry;

  for (i = 0; settable = settables[i]; i += 1) {
    entries[settable] = document.getElementById('settings_'+settable);
  }

  /* start with preview */
  entries['preview'].value = CFG['preview'];
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
    'sources', 'note', 'proto', 'doculectorder', 'tokens', 'patterns'];
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


