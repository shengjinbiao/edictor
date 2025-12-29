/* Distance and tree computations (server-side via LingPy). */

var DIST = {};
DIST.last = null;

DIST._escapeXml = function (value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

DIST._parseNewick = function (newick) {
  var tokens = newick.split(/\s*(;|\(|\)|,|:)\s*/);
  var root = {};
  var current = root;
  var ancestors = [];
  for (var i = 0; i < tokens.length; i += 1) {
    var token = tokens[i];
    if (!token) { continue; }
    if (token === "(") {
      var child = {};
      if (!current.children) { current.children = []; }
      current.children.push(child);
      ancestors.push(current);
      current = child;
    } else if (token === ",") {
      var sibling = {};
      var parent = ancestors[ancestors.length - 1];
      parent.children.push(sibling);
      current = sibling;
    } else if (token === ")") {
      current = ancestors.pop();
    } else if (token === ":") {
      var len = parseFloat(tokens[i + 1]);
      if (!isNaN(len)) { current.length = len; }
      i += 1;
    } else if (token === ";") {
      break;
    } else {
      current.name = token;
    }
  }
  return root;
};

DIST._layoutTree = function (root) {
  var leaves = [];
  var maxDepth = 0;

  function assignY(node) {
    if (!node.children || node.children.length === 0) {
      node.y = leaves.length;
      leaves.push(node);
      return node.y;
    }
    var minY = Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < node.children.length; i += 1) {
      var childY = assignY(node.children[i]);
      minY = Math.min(minY, childY);
      maxY = Math.max(maxY, childY);
    }
    node.y = (minY + maxY) / 2;
    return node.y;
  }

  function assignX(node, depth) {
    node.x = depth;
    if (depth > maxDepth) { maxDepth = depth; }
    if (!node.children) { return; }
    for (var i = 0; i < node.children.length; i += 1) {
      var child = node.children[i];
      var length = (typeof child.length === "number") ? child.length : 1;
      assignX(child, depth + length);
    }
  }

  assignY(root);
  assignX(root, 0);

  return {
    leaves: leaves,
    maxDepth: maxDepth
  };
};

DIST._buildTreeSVG = function (newick, taxaMap) {
  var root;
  try {
    root = DIST._parseNewick(newick);
  } catch (e) {
    fakeAlert("Could not parse Newick tree.");
    return null;
  }
  var layout = DIST._layoutTree(root);
  var leaves = layout.leaves;
  if (!leaves.length) {
    fakeAlert("Tree has no leaves to render.");
    return null;
  }

  var rowHeight = 16;
  var leftPad = 20;
  var rightPad = 20;
  var topPad = 20;
  var bottomPad = 20;
  var labelPad = 8;

  var maxLabel = 0;
  for (var i = 0; i < leaves.length; i += 1) {
    var rawLabel = leaves[i].name || "";
    var label = (taxaMap && taxaMap[rawLabel]) ? taxaMap[rawLabel] : rawLabel;
    if (label.length > maxLabel) { maxLabel = label.length; }
  }

  var scaleX = 80;
  var width = leftPad + layout.maxDepth * scaleX + labelPad + (maxLabel * 7) + rightPad;
  var height = topPad + (leaves.length - 1) * rowHeight + bottomPad;

  function pxX(x) { return leftPad + x * scaleX; }
  function pxY(y) { return topPad + y * rowHeight; }

  var lines = [];
  var labels = [];

  function draw(node) {
    if (!node.children || node.children.length === 0) {
      var rawText = node.name || "";
      var mapped = (taxaMap && taxaMap[rawText]) ? taxaMap[rawText] : rawText;
      var labelText = DIST._escapeXml(mapped);
      var lx = pxX(node.x) + labelPad;
      var ly = pxY(node.y) + 4;
      labels.push('<text x="' + lx + '" y="' + ly + '" font-size="12" font-family="Arial, sans-serif">' + labelText + '</text>');
      return;
    }
    var minY = Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < node.children.length; i += 1) {
      var child = node.children[i];
      minY = Math.min(minY, child.y);
      maxY = Math.max(maxY, child.y);
      lines.push('<line x1="' + pxX(node.x) + '" y1="' + pxY(child.y) + '" x2="' + pxX(child.x) + '" y2="' + pxY(child.y) + '" />');
      draw(child);
    }
    lines.push('<line x1="' + pxX(node.x) + '" y1="' + pxY(minY) + '" x2="' + pxX(node.x) + '" y2="' + pxY(maxY) + '" />');
  }

  draw(root);

  var svg = '';
  svg += '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">';
  svg += '<rect width="100%" height="100%" fill="white"/>';
  svg += '<g stroke="#333" stroke-width="1" fill="none">' + lines.join("") + "</g>";
  svg += '<g fill="#111">' + labels.join("") + "</g>";
  svg += "</svg>";

  return { svg: svg, width: width, height: height };
};

DIST._getValue = function (id, fallback) {
  var el = document.getElementById(id);
  if (!el) { return fallback; }
  return el.value || fallback;
};

DIST._buildWordlist = function () {
  var out = "";
  var rows = 0;
  if (typeof CFG._segments !== "number" || CFG._segments < 0) {
    fakeAlert("No segments column found. Please set TOKENS/SEGMENTS in Settings.");
    return null;
  }
  for (var idx in WLS) {
    if (!WLS.hasOwnProperty(idx)) { continue; }
    if (isNaN(idx)) { continue; }
    var doculect = WLS[idx][CFG._taxa];
    var concept = WLS[idx][CFG._concepts];
    var tokens = WLS[idx][CFG._segments];
    if (!doculect || !concept || !tokens) { continue; }
    out += idx + "\t" + doculect + "\t" + concept + "\t" + tokens + "\n";
    rows += 1;
  }
  if (!rows) {
    fakeAlert("No valid rows found for distance calculation.");
    return null;
  }
  return out;
};

DIST._render = function (data) {
  var target = document.getElementById("idistances_table");
  if (!target) { return; }

  var treeInfo = data.tree ? "Yes" : "No";
  var html = '<table class="data_table2">';
  html += '<tr><th>Parameter</th><th>Setting</th></tr>';
  html += '<tr><td>Method</td><td>' + data.method + '</td></tr>';
  html += '<tr><td>Mode</td><td>' + data.mode + '</td></tr>';
  html += '<tr><td>Tree Method</td><td>' + data.tree_method + '</td></tr>';
  html += '<tr><td>Taxa</td><td>' + data.taxa.length + '</td></tr>';
  html += '<tr><td>Tree</td><td>' + treeInfo + '</td></tr>';
  if (typeof data.empty_pairs === 'number') {
    html += '<tr><td>Empty Pairs</td><td>' + data.empty_pairs + '</td></tr>';
  }
  html += '</table>';

  html += '<div style="margin-top:10px"><strong>Phylip</strong></div>';
  html += '<textarea id="dist_phylip" class="form-control" style="height:140px;">' + data.phylip + '</textarea>';
  html += '<button class="btn btn-primary submit3 mright" style="margin-top:5px" onclick="DIST.savePhylip();">Download .dst</button>';

  if (data.tree) {
    html += '<div style="margin-top:10px"><strong>Newick</strong></div>';
    html += '<textarea id="dist_newick" class="form-control" style="height:80px;">' + data.tree + '</textarea>';
    html += '<button class="btn btn-primary submit3 mright" style="margin-top:5px" onclick="DIST.saveNewick();">Download .nwk</button>';
    html += '<button class="btn btn-primary submit3 mright" style="margin-top:5px" onclick="DIST.downloadTreeSVG();">Download Tree SVG</button>';
    html += '<button class="btn btn-primary submit3 mright" style="margin-top:5px" onclick="DIST.downloadTreePNG();">Download Tree PNG</button>';
    html += '<div style="margin-top:10px"><strong>ASCII Tree</strong></div>';
    html += '<pre id="dist_ascii" style="white-space:pre-wrap">' + data.ascii + '</pre>';
    if (data.taxa_map && Object.keys(data.taxa_map).length) {
      html += '<div style="margin-top:10px"><strong>Taxa Name Mapping</strong></div>';
      html += '<textarea id="dist_taxa_map" class="form-control" style="height:120px;">';
      for (var key in data.taxa_map) {
        if (Object.prototype.hasOwnProperty.call(data.taxa_map, key)) {
          html += key + '\\t' + data.taxa_map[key] + '\\n';
        }
      }
      html += '</textarea>';
    }
  }

  target.innerHTML = html;
};

DIST.saveNewick = function () {
  if (!DIST.last || !DIST.last.tree) { return; }
  var blob = new Blob([DIST.last.tree], {type: 'text/plain;charset=utf-8'});
  saveAs(blob, 'tree.nwk');
};

DIST.savePhylip = function () {
  if (!DIST.last || !DIST.last.phylip) { return; }
  var blob = new Blob([DIST.last.phylip], {type: 'text/plain;charset=utf-8'});
  saveAs(blob, 'distances.dst');
};

DIST.downloadTreeSVG = function () {
  if (!DIST.last || !DIST.last.tree) { return; }
  var built = DIST._buildTreeSVG(DIST.last.tree, DIST.last.taxa_map);
  if (!built) { return; }
  var blob = new Blob([built.svg], {type: 'image/svg+xml;charset=utf-8'});
  saveAs(blob, 'tree.svg');
};

DIST.downloadTreePNG = function () {
  if (!DIST.last || !DIST.last.tree) { return; }
  var built = DIST._buildTreeSVG(DIST.last.tree, DIST.last.taxa_map);
  if (!built) { return; }

  var svgBlob = new Blob([built.svg], {type: 'image/svg+xml;charset=utf-8'});
  var url = URL.createObjectURL(svgBlob);
  var img = new Image();
  img.onload = function () {
    var canvas = document.createElement('canvas');
    canvas.width = built.width;
    canvas.height = built.height;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(function (blob) {
      if (blob) { saveAs(blob, 'tree.png'); }
    }, 'image/png');
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    fakeAlert("Failed to render PNG. Please try SVG instead.");
  };
  img.src = url;
};

function submitComputeDistances() {
  if (!CFG || !CFG.with_lingpy) {
    fakeAlert("Distance computation requires the local server (LingPy).");
    return;
  }
  var wordlist = DIST._buildWordlist();
  if (!wordlist) { return; }

  var method = DIST._getValue("compute_distance_method", "edit-dist");
  var mode = DIST._getValue("compute_distance_mode", "overlap");
  var tree = DIST._getValue("compute_tree_method", "neighbor");

  $('#popup_background').show();
  $.ajax({
    async: true,
    type: "POST",
    url: "distances.py",
    dataType: "text",
    data: {
      wordlist: wordlist,
      method: method,
      mode: mode,
      tree: tree
    },
    success: function (data) {
      $('#popup_background').fadeOut();
      var parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        fakeAlert("Invalid response from distance server.");
        return;
      }
      if (parsed.error) {
        fakeAlert(parsed.error);
        return;
      }
      DIST.last = parsed;
      DIST._render(parsed);
    },
    error: function () {
      $('#popup_background').fadeOut();
      fakeAlert("Distance calculation failed.");
    }
  });
}
