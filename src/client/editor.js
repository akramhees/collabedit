var editorState = {
  isConnected: false,
  roomId: 'default',
  lastContent: '',
  ws: null,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  drawColor: '#9CDBD0',
  drawSize: 4,
  isDrawMode: false,
  isRemoteUpdate: false,
  drawHistory: [],
  historyIndex: -1,
  isUndoing: false,
  isEraser: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 20,
  userName: 'Guest',
  canvas: null,
  ctx: null
};

var currentStroke = [];

function connect(roomId) {
  roomId = roomId || 'default';
  editorState.roomId = roomId;
  
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var host = window.location.hostname || 'localhost';
  var port = window.location.port || (window.location.protocol === 'https:' ? '' : ':3000');
  var wsUrl = protocol + '//' + host + port + '/' + roomId;
  console.log('Connecting to WebSocket:', wsUrl);
  
  try {
    editorState.ws = new WebSocket(wsUrl);
    editorState.ws.onopen = function() {
      editorState.isConnected = true;
      editorState.reconnectAttempts = 0;
      updateStatus(true);
      updateCursorInfo(1);
      sendUserInfo();
    };
    editorState.ws.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        handleMessage(data);
      } catch (e) {
        console.error('Message parse error:', e);
      }
    };
    editorState.ws.onclose = function() {
      editorState.isConnected = false;
      updateStatus(false);
      updateCursorInfo(0);
      reconnect();
    };
    editorState.ws.onerror = function(error) {
      console.error('WebSocket error:', error);
    };
  } catch (e) {
    console.error('Connection error:', e);
    reconnect();
  }
}

function reconnect() {
  if (editorState.reconnectAttempts < 20) {
    editorState.reconnectAttempts++;
    var delay = Math.min(1000 * Math.pow(2, editorState.reconnectAttempts), 30000);
    setTimeout(function() {
      connect(editorState.roomId);
    }, delay);
  }
}

function sendUserInfo() {
  if (editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    editorState.ws.send(JSON.stringify({
      type: 'user_info',
      userName: editorState.userName
    }));
  }
}

function handleMessage(data) {
  var editor = document.getElementById('editor');
  var canvas = document.getElementById('drawCanvas');
  var ctx = canvas.getContext('2d');
  
  if (data.type === 'sync') {
    editorState.isRemoteUpdate = true;
    editor.innerText = data.content || '';
    editorState.lastContent = editor.innerText;
    editorState.isRemoteUpdate = false;
    updateStats();
    if (data.history) {
      editorState.drawHistory = data.history;
      editorState.historyIndex = data.historyIndex !== undefined ? data.historyIndex : editorState.drawHistory.length - 1;
      replayDrawHistory();
    }
    if (data.drawing) {
      var img = new Image();
      img.onload = function() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = data.drawing;
    }
  } else if (data.type === 'update') {
    editorState.isRemoteUpdate = true;
    var currentText = editor.innerText;
    if (currentText !== data.content) {
      editor.innerText = data.content;
      editorState.lastContent = data.content;
      updateStats();
    }
    editorState.isRemoteUpdate = false;
  } else if (data.type === 'draw') {
    if (data.drawData && !editorState.isUndoing) {
      drawRemoteStroke(data.drawData);
      editorState.drawHistory.push(data.drawData);
      editorState.historyIndex = editorState.drawHistory.length - 1;
    }
  } else if (data.type === 'clear_drawing') {
    if (!editorState.isUndoing) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      editorState.drawHistory.push({ type: 'clear' });
      editorState.historyIndex = editorState.drawHistory.length - 1;
    }
  } else if (data.type === 'undo_draw') {
    editorState.isUndoing = true;
    editorState.historyIndex = data.historyIndex;
    replayDrawHistory();
    editorState.isUndoing = false;
  } else if (data.type === 'redo_draw') {
    editorState.isUndoing = true;
    editorState.historyIndex = data.historyIndex;
    replayDrawHistory();
    editorState.isUndoing = false;
  } else if (data.type === 'erase_draw') {
    if (!editorState.isUndoing) {
      eraseRemoteStroke(data.eraseData);
      editorState.drawHistory.push({ type: 'erase', data: data.eraseData });
      editorState.historyIndex = editorState.drawHistory.length - 1;
    }
  }
}

function replayDrawHistory() {
  var canvas = document.getElementById('drawCanvas');
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (var i = 0; i <= editorState.historyIndex && i < editorState.drawHistory.length; i++) {
    var entry = editorState.drawHistory[i];
    if (entry.type === 'clear') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else if (entry.type === 'erase') {
      continue;
    } else if (entry.points && entry.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(entry.points[0].x, entry.points[0].y);
      for (var j = 1; j < entry.points.length; j++) {
        ctx.lineTo(entry.points[j].x, entry.points[j].y);
      }
      ctx.strokeStyle = entry.color || '#9CDBD0';
      ctx.lineWidth = entry.size || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }
  for (var k = 0; k <= editorState.historyIndex && k < editorState.drawHistory.length; k++) {
    var entry2 = editorState.drawHistory[k];
    if (entry2.type === 'erase' && entry2.data) {
      eraseRemoteStroke(entry2.data);
    }
  }
}

function drawRemoteStroke(strokeData) {
  var canvas = document.getElementById('drawCanvas');
  var ctx = canvas.getContext('2d');
  var points = strokeData.points;
  if (!points || points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = strokeData.color || '#9CDBD0';
  ctx.lineWidth = strokeData.size || 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function eraseRemoteStroke(eraseData) {
  var canvas = document.getElementById('drawCanvas');
  var ctx = canvas.getContext('2d');
  var points = eraseData.points;
  if (!points || points.length < 2) return;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineWidth = eraseData.size || 20;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function sendUpdate(content) {
  if (editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    editorState.ws.send(JSON.stringify({ type: 'update', content: content }));
  }
}

function sendDrawStroke(points, color, size) {
  if (editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    var drawData = { points: points, color: color, size: size };
    editorState.ws.send(JSON.stringify({ type: 'draw', drawData: drawData, drawing: JSON.stringify(drawData) }));
  }
}

function sendEraseStroke(points, size) {
  if (editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    editorState.ws.send(JSON.stringify({ type: 'erase_draw', eraseData: { points: points, size: size } }));
  }
}

function sendClearDrawing() {
  if (editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    editorState.ws.send(JSON.stringify({ type: 'clear_drawing' }));
  }
}

function undoDraw() {
  if (editorState.historyIndex >= 0 && editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    editorState.ws.send(JSON.stringify({ type: 'undo_draw' }));
  }
}

function redoDraw() {
  if (editorState.historyIndex < editorState.drawHistory.length - 1 && editorState.ws && editorState.ws.readyState === WebSocket.OPEN) {
    editorState.ws.send(JSON.stringify({ type: 'redo_draw' }));
  }
}

function disconnect() {
  if (editorState.ws) editorState.ws.close();
}

function initCanvas() {
  var canvas = document.getElementById('drawCanvas');
  var container = document.getElementById('editor-container');
  
  canvas.width = container.offsetWidth;
  canvas.height = document.getElementById('editor').offsetHeight;
  
  // Mouse events
  canvas.onmousedown = function(e) {
    if (!editorState.isDrawMode) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (canvas.width / rect.width);
    var y = (e.clientY - rect.top) * (canvas.height / rect.height);
    editorState.isDrawing = true;
    editorState.lastX = x;
    editorState.lastY = y;
    currentStroke = [{x: x, y: y}];
  };
  
  canvas.onmousemove = function(e) {
    if (!editorState.isDrawing || !editorState.isDrawMode) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (canvas.width / rect.width);
    var y = (e.clientY - rect.top) * (canvas.height / rect.height);
    var ctx = canvas.getContext('2d');
    
    if (editorState.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(editorState.lastX, editorState.lastY);
      ctx.lineTo(x, y);
      ctx.lineWidth = editorState.drawSize * 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.beginPath();
      ctx.moveTo(editorState.lastX, editorState.lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = editorState.drawColor;
      ctx.lineWidth = editorState.drawSize;
      ctx.stroke();
    }
    
    editorState.lastX = x;
    editorState.lastY = y;
    currentStroke.push({x: x, y: y});
  };
  
  canvas.onmouseup = function(e) {
    if (editorState.isDrawing && currentStroke.length > 1) {
      if (editorState.isEraser) {
        sendEraseStroke(currentStroke, editorState.drawSize * 5);
      } else {
        sendDrawStroke(currentStroke, editorState.drawColor, editorState.drawSize);
      }
    }
    editorState.isDrawing = false;
    currentStroke = [];
  };
  
  canvas.onmouseleave = function(e) {
    if (editorState.isDrawing && currentStroke.length > 1) {
      if (editorState.isEraser) {
        sendEraseStroke(currentStroke, editorState.drawSize * 5);
      } else {
        sendDrawStroke(currentStroke, editorState.drawColor, editorState.drawSize);
      }
    }
    editorState.isDrawing = false;
    currentStroke = [];
  };
  
  // Touch events
  canvas.ontouchstart = function(e) {
    if (!editorState.isDrawMode) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var touch = e.touches[0];
    var x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    var y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    editorState.isDrawing = true;
    editorState.lastX = x;
    editorState.lastY = y;
    currentStroke = [{x: x, y: y}];
  };
  
  canvas.ontouchmove = function(e) {
    if (!editorState.isDrawing || !editorState.isDrawMode) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var touch = e.touches[0];
    var x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    var y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    var ctx = canvas.getContext('2d');
    
    if (editorState.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(editorState.lastX, editorState.lastY);
      ctx.lineTo(x, y);
      ctx.lineWidth = editorState.drawSize * 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.beginPath();
      ctx.moveTo(editorState.lastX, editorState.lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = editorState.drawColor;
      ctx.lineWidth = editorState.drawSize;
      ctx.stroke();
    }
    
    editorState.lastX = x;
    editorState.lastY = y;
    currentStroke.push({x: x, y: y});
  };
  
  canvas.ontouchend = function(e) {
    if (editorState.isDrawing && currentStroke.length > 1) {
      if (editorState.isEraser) {
        sendEraseStroke(currentStroke, editorState.drawSize * 5);
      } else {
        sendDrawStroke(currentStroke, editorState.drawColor, editorState.drawSize);
      }
    }
    editorState.isDrawing = false;
    currentStroke = [];
  };
  
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  var canvas = document.getElementById('drawCanvas');
  var container = document.getElementById('editor-container');
  var tempData = canvas.toDataURL();
  canvas.width = container.offsetWidth;
  canvas.height = document.getElementById('editor').offsetHeight;
  var ctx = canvas.getContext('2d');
  var img = new Image();
  img.onload = function() { ctx.drawImage(img, 0, 0); };
  img.src = tempData;
}

function toggleDrawMode() {
  editorState.isDrawMode = !editorState.isDrawMode;
  var canvas = document.getElementById('drawCanvas');
  var editor = document.getElementById('editor');
  var btn = document.getElementById('drawToggle');
  if (editorState.isDrawMode) {
    canvas.style.display = 'block';
    editor.style.opacity = '0.5';
    btn.style.color = '#9CDBD0';
    btn.style.borderColor = '#9CDBD0';
    document.body.style.cursor = 'crosshair';
    document.getElementById('eraserToggle').style.display = 'inline-flex';
  } else {
    canvas.style.display = 'none';
    editor.style.opacity = '1';
    btn.style.color = '';
    btn.style.borderColor = '';
    document.body.style.cursor = '';
    editorState.isEraser = false;
    document.getElementById('eraserToggle').style.display = 'none';
    document.getElementById('eraserToggle').style.color = '';
    document.getElementById('eraserToggle').style.borderColor = '';
  }
}

function toggleEraser() {
  editorState.isEraser = !editorState.isEraser;
  var btn = document.getElementById('eraserToggle');
  if (editorState.isEraser) {
    btn.style.color = '#ED7497';
    btn.style.borderColor = '#ED7497';
    document.body.style.cursor = 'not-allowed';
  } else {
    btn.style.color = '';
    btn.style.borderColor = '';
    document.body.style.cursor = 'crosshair';
  }
}

function clearDrawing() {
  if (confirm('Clear all drawings?')) {
    var canvas = document.getElementById('drawCanvas');
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sendClearDrawing();
  }
}

function updateStatus(connected) {
  var status = document.getElementById('status');
  if (connected) {
    status.textContent = 'Connected';
    status.className = 'status connected';
  } else {
    status.textContent = 'Disconnected';
    status.className = 'status disconnected';
  }
}

function updateCursorInfo(count) {
  document.getElementById('cursorInfo').textContent = count;
}

function updateStats() {
  var editor = document.getElementById('editor');
  var text = editor.innerText;
  var words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = words;
  document.getElementById('charCount').textContent = text.length;
}

function saveDocument() {
  var content = document.getElementById('editor').innerHTML;
  var canvas = document.getElementById('drawCanvas');
  var drawing = canvas.toDataURL();
  localStorage.setItem('doc-backup', content);
  localStorage.setItem('drawing-backup', drawing);
  document.getElementById('lastSaved').textContent = new Date().toLocaleTimeString();
}

function exportDocument() {
  var content = document.getElementById('editor').innerHTML;
  var canvas = document.getElementById('drawCanvas');
  var drawing = canvas.toDataURL();
  var blob = new Blob([
    '<html><head><title>CollabEdit Document</title></head><body>',
    content,
    '<img src="' + drawing + '" />',
    '</body></html>'
  ], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'document-' + Date.now() + '.html';
  a.click();
  URL.revokeObjectURL(url);
}

function clearDocument() {
  if (confirm('Clear document and drawings?')) {
    var editor = document.getElementById('editor');
    editor.innerText = '';
    clearDrawing();
    sendUpdate('');
    updateStats();
  }
}

function formatText(command) {
  document.execCommand(command, false, null);
}

function undoAction() {
  if (editorState.isDrawMode) {
    undoDraw();
  } else {
    document.execCommand('undo');
  }
}

function redoAction() {
  if (editorState.isDrawMode) {
    redoDraw();
  } else {
    document.execCommand('redo');
  }
}

function changeFontFamily() {
  var font = document.getElementById('fontFamily').value;
  document.execCommand('fontName', false, font);
}

function changeFontColor() {
  var color = document.getElementById('fontColor').value;
  document.execCommand('foreColor', false, color);
}

function changeDrawColor() {
  var color = document.getElementById('drawColor').value;
  editorState.drawColor = color;
  if (editorState.isEraser) {
    editorState.isEraser = false;
    document.getElementById('eraserToggle').style.color = '';
    document.getElementById('eraserToggle').style.borderColor = '';
    document.body.style.cursor = 'crosshair';
  }
}

function changeDrawSize() {
  var size = parseInt(document.getElementById('drawSize').value);
  editorState.drawSize = size;
}

function confirmNickname() {
  var input = document.getElementById('modalNicknameInput');
  var name = input.value.trim() || 'Guest';
  editorState.userName = name;
  document.getElementById('userNameDisplay').textContent = name;
  localStorage.setItem('collabedit-username', name);
  document.getElementById('nicknameModal').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  sendUserInfo();
  var roomId = window.location.hash.slice(1) || 'default';
  document.getElementById('roomId').textContent = roomId;
  connect(roomId);
}

function toggleRoomInput() {
  var input = document.getElementById('roomInput');
  var roomId = document.getElementById('roomId');
  if (input.style.display === 'none') {
    input.style.display = 'inline';
    input.value = roomId.textContent;
    input.focus();
  } else {
    input.style.display = 'none';
    var newRoom = input.value.trim() || 'default';
    roomId.textContent = newRoom;
    disconnect();
    connect(newRoom);
  }
}

var savedName = localStorage.getItem('collabedit-username') || 'Guest';
document.getElementById('modalNicknameInput').value = savedName;
document.getElementById('userNameDisplay').textContent = savedName;
editorState.userName = savedName;

document.getElementById('modalNicknameInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmNickname();
});

var editor = document.getElementById('editor');
var sendTimeout = null;

editor.addEventListener('input', function(e) {
  if (editorState.isRemoteUpdate) return;
  var currentContent = editor.innerText;
  if (currentContent !== editorState.lastContent) {
    editorState.lastContent = currentContent;
    updateStats();
    clearTimeout(sendTimeout);
    sendTimeout = setTimeout(function() {
      sendUpdate(currentContent);
    }, 100);
  }
});

editor.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    setTimeout(function() {
      var selection = window.getSelection();
      if (selection.rangeCount > 0) {
        var range = selection.getRangeAt(0);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);
  }
});

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDocument(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoAction(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redoAction(); }
});

window.addEventListener('beforeunload', function() { disconnect(); });
setInterval(function() { saveDocument(); }, 30000);
setTimeout(initCanvas, 100);

console.log('Editor initialized');
