/* Phonology interface for the edictor
 *
 * author   : Johann-Mattis List
 * email    : mattis.list@lingulist.de
 * created  : 2016-03-20 10:07
 * modified : 2023-11-19 12:22
 *
 */

PHON = {};

PHON.clean_segment = function(segment) {
  if (segment.indexOf("/") == -1) {
    return segment;
  }
  else {
    return segment.split("/")[1];
  }
};

/* desegmentize a sequence with grouped segments */
PHON.desegment = function(sequence) {
  var i, j, segment, new_segments;
  var out = [];
  for (i=0; i<sequence.length; i++) {
    segment = sequence[i];
    if (segment.indexOf(".") == -1) {
      out.push(PHON.clean_segment(segment));
    }
    else {
      new_segments = segment.split('.');
      for (j=0; j<new_segments.length; j++) {
        out.push(PHON.clean_segment(new_segments[j]));
      }
    }
  }
  return out;
};

PHON.showChart = function(url, doculect) {

  var url = 'plugouts/ipa_chart.html?'+url;
  var nid = document.createElement('div');
  nid.style.display = '';
  nid.className = 'editmode';
  var text = '<div class="iframe-message" id="ipachart">' + 
    '<p style="color:white;font-weight:bold;">' +
    '<span class="main_handle pull-left" style="margin-left:0px;margin-top:2px;" ></span>' +
    ' IPA chart for '+ doculect+':</p>' +
    '<iframe onload="UTIL.resizeframe(this)" id="ipaiframe" src="'+url+'" style="width:90%;min-height:600px;border:2px solid #2D6CA2;"></iframe><br><div class="btn btn-primary okbutton" onclick="' + 
    "$('#editmode').remove(); document.onkeydown = function(event){basickeydown(event)};" +
    '")> OK </div></div>';
  nid.id = 'editmode';
  document.body.appendChild(nid);
  nid.innerHTML = text;
  var ipa = document.getElementById('ipachart');
  ipa.style.width = document.getElementById('ipaiframe').contentWindow.document.body.scrollWidth + 'px';
  $(ipa).draggable({handle:'.main_handle'});
}

/* 列查找（不区分大小写），必要时询问用户 */
PHON.findColumn = function (candidates, label) {
  if (!Array.isArray(candidates)) { candidates = [candidates]; }
  var header = WLS.header || [];
  var lowerMap = {};
  header.forEach(function (h, i) {
    var k = h.toLowerCase();
    if (!(k in lowerMap)) { lowerMap[k] = i; }
  });
  for (var i = 0; i < candidates.length; i += 1) {
    var k = String(candidates[i] || "").toLowerCase();
    if (k && (k in lowerMap)) { return lowerMap[k]; }
  }
  var manual = prompt("未找到列，请输入用于 " + label + " 的列名", candidates[0] || "");
  if (!manual) { return -1; }
  var m = manual.toLowerCase();
  return (m in lowerMap) ? lowerMap[m] : -1;
};

/* 填充方言下拉 */
PHON.populateDoculects = function () {
  var sel = document.getElementById('phonology_doculects');
  if (!sel || !WLS) { return; }
  var current = sel.value;
  sel.innerHTML = "";
  var taxa = [];
  // 优先直接从 DOCULECT 列收集去重值（避免筛选残留）
  var tIdx = PHON.findColumn(["DOCULECT","doculect","LANGUAGE","language"], "DOCULECT");
  if (tIdx !== -1) {
    var set = new Set();
    for (var k in WLS) {
      if (isNaN(k)) { continue; }
      var val = WLS[k][tIdx];
      if (val) { set.add(val); }
    }
    taxa = Array.from(set).sort();
  }
  // 若仍为空，再用已有的排序/筛选列表
  if (!taxa.length && WLS.sorted_taxa && WLS.sorted_taxa.length) {
    taxa = WLS.sorted_taxa;
  } else if (!taxa.length && WLS.taxa) {
    taxa = Object.keys(WLS.taxa);
  } else if (!taxa.length && WLS._selected_doculects) {
    taxa = WLS._selected_doculects;
  }
  if (!taxa.length) { return; }
  taxa.forEach(function (t) {
    var opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
  if (current && taxa.indexOf(current) !== -1) {
    sel.value = current;
  } else if (taxa.length) {
    sel.value = taxa[0];
  }
};

/* 频次与同音组摘要 */
PHON.summaryBy = function (field, label) {
  if (!WLS || !WLS.header) {
    fakeAlert("请先加载数据。");
    return;
  }
  var sel = document.getElementById('phonology_doculects');
  var onlyTaxon = (sel && sel.value) ? sel.value : null;
  var idx = PHON.findColumn([field, field.toLowerCase(), field.toUpperCase()], label);
  var tIdx = PHON.findColumn(["DOCULECT","doculect","LANGUAGE","language"], "DOCULECT");
  var cIdx = PHON.findColumn(["CONCEPT","concept","GLOSS","gloss"], "CONCEPT");
  if (idx === -1) { fakeAlert("缺少列：" + label); return; }
  if (tIdx === -1 || cIdx === -1) { fakeAlert("缺少 DOCULECT 或 CONCEPT 列。"); return; }
  var stats = {}; // doculect -> value -> {count, concepts:Set}
  var sortOrder = null;
  if (label === "声母") {
    sortOrder = ["p","pʰ","m","f","t","tʰ","n","l","ts","tsʰ","s","tʂ","tʂʰ","ʂ","ʐ","tɕ","tɕʰ","ɕ","k","kʰ","ŋ","x","h"].map(function(x){return x.toLowerCase();});
  }
  for (var key in WLS) {
    if (isNaN(key)) { continue; }
    var row = WLS[key];
    var taxon = row[tIdx] || "";
    var val = row[idx] || "";
    var concept = row[cIdx] || "";
    if (onlyTaxon && taxon !== onlyTaxon) { continue; }
    if (!taxon || !val) { continue; }
    if (!stats[taxon]) { stats[taxon] = {}; }
    if (!stats[taxon][val]) { stats[taxon][val] = {count:0, concepts:new Set()}; }
    stats[taxon][val].count += 1;
    if (concept) { stats[taxon][val].concepts.add(concept); }
  }
  var html = `<h4>${label} 频次</h4><table class="data_table2"><tr><th>DOCULECT</th><th>${label}</th><th>Count</th><th>Concepts</th></tr>`;
  for (var taxon in stats) {
    var entries = Object.keys(stats[taxon]);
    if (sortOrder) {
      entries.sort(function(a,b){
        var ai = sortOrder.indexOf(String(a).toLowerCase());
        var bi = sortOrder.indexOf(String(b).toLowerCase());
        if (ai === -1 && bi === -1) { return a.localeCompare(b); }
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    } else {
      entries.sort();
    }
    for (var i=0; i<entries.length; i+=1) {
      var v = entries[i];
      var s = stats[taxon][v];
      html += `<tr><td>${taxon}</td><td>${v}</td><td>${s.count}</td><td>${Array.from(s.concepts).slice(0,10).join(", ")}${s.concepts.size>10?" …":""}</td></tr>`;
    }
  }
  html += "</table>";
  var box = document.getElementById('phonology_table');
  box.style.display = '';
  box.innerHTML = html;
};

PHON.homophones = function (mode) {
  if (!WLS || !WLS.header) {
    fakeAlert("请先加载数据。");
    return;
  }
  var sel = document.getElementById('phonology_doculects');
  var onlyTaxon = (sel && sel.value) ? sel.value : null;
  var tIdx = PHON.findColumn(["DOCULECT","doculect","LANGUAGE","language"], "DOCULECT");
  var cIdx = PHON.findColumn(["CONCEPT","concept","GLOSS","gloss"], "CONCEPT");
  var formIdx = PHON.findColumn(["FORM","Tokens","TOKENS","IPA"], "FORM/TOKENS/IPA");
  var iIdx = PHON.findColumn(["Initial","initial","shengmu","SHENGMU"], "声母");
  var fIdx = PHON.findColumn(["Final","final","yunmu","YUNMU"], "韵母");
  var toneIdx = PHON.findColumn(["Tone","tone","SHENGDIAO","shengdiao"], "声调");
  if ([tIdx,cIdx].includes(-1)) { fakeAlert("缺少 DOCULECT 或 CONCEPT 列。"); return; }
  var baseIdx = formIdx !== -1 ? formIdx : -1;
  var stats = {}; // doculect -> key -> concepts
  for (var key in WLS) {
    if (isNaN(key)) { continue; }
    var row = WLS[key];
    var taxon = row[tIdx] || "";
    var concept = row[cIdx] || "";
    if (onlyTaxon && taxon !== onlyTaxon) { continue; }
    if (!taxon) { continue; }
    var ini = iIdx !== -1 ? row[iIdx] : "";
    var fin = fIdx !== -1 ? row[fIdx] : "";
    var tone = toneIdx !== -1 ? row[toneIdx] : "";
    var keystr;
    if (mode === "syllable") {
      keystr = [ini,fin].filter(Boolean).join(" ");
    } else {
      keystr = [ini,fin,tone].filter(Boolean).join(" ");
    }
    if (!keystr && baseIdx !== -1) { keystr = row[baseIdx] || ""; }
    if (!keystr) { continue; }
    if (!stats[taxon]) { stats[taxon] = {}; }
    if (!stats[taxon][keystr]) { stats[taxon][keystr] = new Set(); }
    if (concept) { stats[taxon][keystr].add(concept); }
  }
  var title = mode === "syllable" ? "同音表（声韵）" : "同音表（声韵调）";
  var html = `<h4>${title}</h4><table class="data_table2"><tr><th>DOCULECT</th><th>${mode==="syllable"?"声韵":"声韵调"}</th><th>概念数</th><th>概念示例</th></tr>`;
  for (var taxon in stats) {
    var entries = Object.keys(stats[taxon]).sort();
    for (var i=0;i<entries.length;i+=1){
      var k = entries[i];
      var set = stats[taxon][k];
      html += `<tr><td>${taxon}</td><td>${k}</td><td>${set.size}</td><td>${Array.from(set).slice(0,10).join(", ")}${set.size>10?" …":""}</td></tr>`;
    }
  }
  html += "</table>";
  var box = document.getElementById('phonology_table');
  box.style.display = '';
  box.innerHTML = html;
};

/* function shows the occurrences of phonemes in the data */
function showPhonology (event, doculect, sort, direction) {
  // 先填充下拉并自动选择
  if (typeof PHON.populateDoculects === "function") {
    PHON.populateDoculects();
    var inp = document.getElementById('phonology_doculects');
    if (!doculect && inp && inp.value) {
      doculect = inp.value;
    }
  }
  if (event) {
    if (event.keyCode != 13) {
      return;
    }
  }
  if (!doculect) {
    fakeAlert("请选择一个方言点。");
    return;
  }
  var i, j, k, idx;
  var tokens, _tokens, token;
  var segment, segments;
  
  /* get current height of the window in order to determine maximal height of
   * the div */
  var heightA = 600; //document.getElementById('filedisplay').offsetHeight - 50;
  var heightB = window.innerHeight - 50;
  var cheight = (heightB-heightA > 500) ? heightB : heightA;

  document.getElementById('phonology_table').style.maxHeight =  cheight +'px';
  document.getElementById('phonology_help').style.display = 'none';

  if (typeof sort == 'undefined') {
    sort = 'alphabetic';
    direction = 1;
  }
  else if (typeof direction == 'undefined') {
    direction = 1;
  }
  
  //->console.log(doculect);

  /* create an object in which the data will be stored */
  var occs = {};
  var phonemes = [];

  /* get all indices of the taxa */
  var idxs = WLS['taxa'][doculect];

  /* get index of tokens and concepts*/
  var tidx = CFG['_segments']; 
  var c = CFG['_cidx'];

  /* define symbols we do not want to trace */
  var dontrace = ['∼', '◦', "Ø", "+"];
  
  /* iterate over the data */
  for (i=0; idx=idxs[i]; i++) {
    /* first check for valid alignments */
    if (WLS[idx][tidx] != 'undefined' && WLS[idx][tidx]) {
      tokens = PHON.desegment(WLS[idx][tidx].split(" "));
    }
    for (j=0; token=tokens[j]; j++) {
      if (dontrace.indexOf(token) == -1) {
	      try {
      	  occs[token].push(idx);
      	}
      	catch (e) {
      	  occs[token] = [idx];
      	  phonemes.push(token);
      	}
      }
    }
  }

  /* go for the sorting stuff */
  function get_sorter (sort, direction) {
    var a, b, sorter;
    if (sort == 'alphabetic') {
      var sorter = function (x,y) {
        return x.charCodeAt(0) - y.charCodeAt(0);
      };
    }
    else if (sort == 'phoneme') {
      var sorter = function (x,y) {
        var a = getSoundClass(x).charCodeAt(0);
        var b = getSoundClass(y).charCodeAt(0);
	      if (a == b) {
	        return x.localeCompare(y);
        }
        return a - b;
      };
    }
    else if (sort == 'occurrences') {
      var sorter = function (x,y) { 
        return occs[x].length - occs[y].length; 
      };
    }
    else if (sort == 'type' || sort == 'place' || sort == 'manner' || sort == 'misc1' || sort == 'misc2') {
      sorter = function(x,y) {
	      a = getSoundDescription(x, sort, true);
	      b = getSoundDescription(y, sort, true);
	      if (!a && !b) {return 0}
	      if (!a && b) {return -1}
	      if (!b && a) {return 1}
	      return a.localeCompare(b);
      };
    }
    if (direction == 1) {
      return function (x,y) { return sorter(x,y) };
    }
    else {
      return function (x,y) { return sorter(y,x) };
    }
  }

  /* define featueres for convenience */
  var features = ['place', 'manner', 'type', 'misc1', 'misc2'];

  /* change selection for the current sorting scheme */
  if (sort == 'phoneme') {
    var p_dir = (direction == 1) ? 0 : 1;
    var o_dir = 1;
    var f_dir = 1;
    var pclass = 'sorted';
    var oclass = 'unsorted';
  }
  else if (sort == 'occurrences') {
    var p_dir = 1;
    var o_dir = (direction == 1) ? 0 : 1;
    var f_dir = 1;
    var pclass = 'unsorted';
    var oclass = 'sorted';
  }
  else if (features.indexOf(sort) != -1) {
    var f_dir = (direction == 1) ? 0 : 1;
    var p_dir = 1;
    var o_dir = 1;
    var pclass = 'unsorted';
    var oclass = 'unsorted';
  }
  else {
    var p_dir = 1;
    var o_dir = 1;
    var f_dir = 1;
    var pclass = 'unsorted';
    var oclass = 'unsorted';
  }

  /* create the text, first not really sorted */
  phonemes.sort(get_sorter(sort, direction));
  var text = '<table class="data_table"><tr>' + 
    '<th title="double click to sort" ondblclick="showPhonology(false,\''+doculect+'\')">No.</th>' +
    '<th title="double click to sort" class="'+ pclass + '" ' + 
    'ondblclick="showPhonology(false,\''+doculect+'\',\'phoneme\',\''+p_dir+'\')">SOUND</th>' + 
    '<th title="double click to sort" class="'+ oclass + '" ' + 
    'ondblclick="showPhonology(false,\''+doculect+'\',\'occurrences\',\''+o_dir+'\')">FREQ</th>' + 
    '<th ondblclick="showPhonology(false,\''+doculect+'\',\'type\','  +f_dir+')" title="double click to sort" class="features '+((sort == 'type') ? 'sorted' :  'unsorted')+'" >TYPE</th>' + 
    '<th ondblclick="showPhonology(false,\''+doculect+'\',\'manner\','+f_dir+')" title="double click to sort" class="features '+((sort == 'manner') ? 'sorted' :'unsorted')+'" >MANNER (HEIGHT)</th>' +
    '<th ondblclick="showPhonology(false,\''+doculect+'\',\'place\',' +f_dir+')" title="double click to sort" class="features '+((sort == 'place') ? 'sorted' : 'unsorted')+'" >PLACE (COLOR)</th>' +
   '<th ondblclick="showPhonology(false,\''+doculect+'\',\'misc1\',' +f_dir+')" title="double click to sort" class="features '+((sort == 'misc1') ? 'sorted' : 'unsorted')+'" >SECONDARY</th>' +
    '<th>Concepts</th>' + 
    '</tr>';
    //'<th ondblclick="showPhonology(false,\''+doculect+'\',\'misc1\',' +f_dir+')" title="double click to sort" class="features '+((sort == 'misc1') ? 'sorted' : 'unsorted')+'" >VOICE (NASAL)</th>' +
 
  var r, phoneme, noc, keys, concepts, concept, cids, normalized_sound, description, sound_list, st;

  var normalized_sounds = [];
  for (i=0; phoneme=phonemes[i]; i++) {
    noc = occs[phoneme].length;
    keys = occs[phoneme];
    
    /* create concepts */
    concepts = [];
    cids = [];
    //->console.log('c2i',WLS.c2i);
    for (j=0; idx=keys[j]; j++) {
      concept = WLS[idx][c];
      if (concepts.indexOf(concept) == -1) {
       concepts.push(concept);
       cids.push(WLS.c2i[concept]);
      }
      concepts.sort();
    }
    text += '<tr>';
    text += '<td>' + (i+1) + '</td>';
    text += '<td>' + 
      plotWord(phoneme, 'span') + '</td>';
    text += '<td>' + noc + '</td>';
    normalized_sound = normalize_ipa(phoneme);
    if (normalized_sounds.indexOf(normalized_sound) == -1) {
      normalized_sounds.push(normalized_sound);
    }
    description = getSoundDescription(normalized_sound);
    if (description) {
      text += '<td class="features">'+description.join('</td><td class="features">')+'</td>'; // TODO no inline css!
    }
    else {
      text += '<td></td><td></td><td></td><td></td>';
    }
    text += '<td onclick="filterOccurrences(\''+doculect+'\',\''+cids.join(',')+'\')" class="concepts pointed" title="click to filter the occurrences of this phoneme">' + concepts.join(', ') + '</td>';
    text += '</tr>';
  }
  text += '</table>';

  /* make url for link */
  sound_list = normalized_sounds.join(',');
  st = {'¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁰': '0'};
  for (r in st) {
    rg = new RegExp(r, 'g') 
    sound_list = sound_list.replace(rg, st[r]);
  }
  sound_list = 'doculect='+encodeURIComponent(doculect)+'&sound_list='+encodeURIComponent(sound_list);
  var link = 'phonobank.html?'+sound_list;
  var url = sound_list; 
  var ipa_chars = document.getElementById('ipa_charts');
  ipa_charts.style.display="inline";
  ipa_charts.onclick = function() {PHON.showChart(url, doculect)};

  var did = document.getElementById('phonology_table');
  did.innerHTML = text;
  did.style.display = '';
}

