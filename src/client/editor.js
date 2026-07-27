class EditorState {
  constructor() {
    this.isConnected = false;
    this.roomId = 'default';
    this.lastContent = '';
    this.ws = null;
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.drawColor = '#9CDBD0';
    this.drawSize = 4;
    this.isDrawMode = false;
    this.isRemoteUpdate = false;
    this.drawHistory = [];
    this.historyIndex = -1;
    this.isUndoing = false;
    this.isEraser = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.userName = 'Guest';
    this.typingTimeout = null;
    this.isTyping = false;
    this.activeTypers = {};
    this.nicknameConfirmed = false;
    this.typingTimer = null;
  }

  connect(roomId = 'default') {
    this.roomId = roomId;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || (window.location.protocol === 'https:' ? '' : ':3000');
    const wsUrl = `${protocol}//${host}${port}/${roomId}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        updateStatus(true);
        console.log('WebSocket connected successfully');
        updateCursorInfo(1);
        this.sendUserInfo();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received:', data.type);
          this.handleMessage(data);
        } catch (e) {
          console.error('Message parse error:', e);
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        updateStatus(false);
        console.log('WebSocket closed:', event.code, event.reason);
        updateCursorInfo(0);
        this.reconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('Connection error:', e);
      this.reconnect();
    }
  }

  sendUserInfo() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'user_info',
        userName: this.userName
      }));
    }
  }

  handleMessage(data) {
    const editor = document.getElementById('editor');
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    
    if (data.type === 'sync') {
      this.isRemoteUpdate = true;
      editor.innerText = data.content || '';
      this.lastContent = editor.innerText;
      this.isRemoteUpdate = false;
      updateStats();
      
      if (data.history) {
        this.drawHistory = data.history;
        this.historyIndex = data.historyIndex !== undefined ? data.historyIndex : this.drawHistory.length - 1;
        this.replayDrawHistory();
      }
      
      if (data.drawing) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = data.drawing;
      }
      console.log('Synced with server');
    } else if (data.type === 'update') {
      this.isRemoteUpdate = true;
      const currentText = editor.innerText;
      if (currentText !== data.content) {
        editor.innerText = data.content;
        this.lastContent = data.content;
        updateStats();
        console.log('Remote update applied');
      }
      this.isRemoteUpdate = false;
    } else if (data.type === 'draw') {
      if (data.drawData && !this.isUndoing) {
        this.drawRemoteStroke(data.drawData);
        this.drawHistory.push(data.drawData);
        this.historyIndex = this.drawHistory.length - 1;
        console.log('Remote draw applied');
      }
    } else if (data.type === 'clear_drawing') {
      if (!this.isUndoing) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawHistory.push({ type: 'clear' });
        this.historyIndex = this.drawHistory.length - 1;
        console.log('Remote clear applied');
      }
    } else if (data.type === 'undo_draw') {
      this.isUndoing = true;
      this.historyIndex = data.historyIndex;
      this.replayDrawHistory();
      this.isUndoing = false;
      console.log('Remote undo applied');
    } else if (data.type === 'redo_draw') {
      this.isUndoing = true;
      this.historyIndex = data.historyIndex;
      this.replayDrawHistory();
      this.isUndoing = false;
      console.log('Remote redo applied');
    } else if (data.type === 'erase_draw') {
      if (!this.isUndoing) {
        this.eraseRemoteStroke(data.eraseData);
        this.drawHistory.push({ type: 'erase', data: data.eraseData });
        this.historyIndex = this.drawHistory.length - 1;
        console.log('Remote erase applied');
      }
    } else if (data.type === 'user_typing') {
      console.log('Typing from:', data.userName);
      this.activeTypers[data.userName] = Date.now();
      this.updateTypingIndicator();
    } else if (data.type === 'user_connected') {
      console.log('User connected:', data.userName);
      this.updateTypingIndicator();
    } else if (data.type === 'user_disconnected') {
      console.log('User disconnected:', data.userName);
      delete this.activeTypers[data.userName];
      this.updateTypingIndicator();
    }
  }

  updateTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    const now = Date.now();
    const active = Object.keys(this.activeTypers).filter(name => {
      return now - this.activeTypers[name] < 3000 && name !== this.userName;
    });
    
    console.log('Active typers:', active);
    
    if (active.length > 0) {
      indicator.innerHTML = `<i class="fas fa-pen" style="margin-right:6px;color:#ED7497;"></i><span class="typing-name">${active.join(', ')}</span> ${active.length === 1 ? 'is' : 'are'} typing...`;
      indicator.className = 'active';
    } else {
      indicator.className = '';
    }
  }

  sendTyping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending typing from:', this.userName);
      this.ws.send(JSON.stringify({
        type: 'typing',
        userName: this.userName
      }));
    }
  }

  replayDrawHistory() {
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i <= this.historyIndex && i < this.drawHistory.length; i++) {
      const entry = this.drawHistory[i];
      if (entry.type === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else if (entry.type === 'erase') {
        continue;
      } else if (entry.points && entry.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(entry.points[0].x, entry.points[0].y);
        for (let j = 1; j < entry.points.length; j++) {
          ctx.lineTo(entry.points[j].x, entry.points[j].y);
        }
        ctx.strokeStyle = entry.color || '#9CDBD0';
        ctx.lineWidth = entry.size || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
    
    for (let i = 0; i <= this.historyIndex && i < this.drawHistory.length; i++) {
      const entry = this.drawHistory[i];
      if (entry.type === 'erase' && entry.data) {
        this.eraseRemoteStroke(entry.data);
      }
    }
  }

  drawRemoteStroke(strokeData) {
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    const points = strokeData.points;
    
    if (!points || points.length < 2) return;
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = strokeData.color || '#9CDBD0';
    ctx.lineWidth = strokeData.size || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  eraseRemoteStroke(eraseData) {
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    const points = eraseData.points;
    
    if (!points || points.length < 2) return;
    
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineWidth = eraseData.size || 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  sendUpdate(content) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'update',
        content: content
      }));
      console.log('Update sent');
    } else {
      console.warn('Cannot send update - WebSocket not open');
    }
  }

  sendDrawStroke(points, color, size) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const drawData = { points, color, size };
      this.ws.send(JSON.stringify({
        type: 'draw',
        drawData: drawData,
        drawing: JSON.stringify(drawData)
      }));
    }
  }

  sendEraseStroke(points, size) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'erase_draw',
        eraseData: { points, size }
      }));
    }
  }

  sendClearDrawing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'clear_drawing'
      }));
    }
  }

  undoDraw() {
    if (this.historyIndex >= 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'undo_draw'
      }));
    }
  }

  redoDraw() {
    if (this.historyIndex < this.drawHistory.length - 1 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'redo_draw'
      }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

const editorState = new EditorState();

function initCanvas() {
  const canvas = document.getElementById('drawCanvas');
  const container = document.getElementById('editor-container');
  
  canvas.width = container.offsetWidth;
  canvas.height = document.getElementById('editor').offsetHeight;
  
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  
  canvas.addEventListener('touchstart', handleTouchStart);
  canvas.addEventListener('touchmove', handleTouchMove);
  canvas.addEventListener('touchend', endDraw);
  
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const canvas = document.getElementById('drawCanvas');
  const container = document.getElementById('editor-container');
  const tempData = canvas.toDataURL();
  canvas.width = container.offsetWidth;
  canvas.height = document.getElementById('editor').offsetHeight;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
  };
  img.src = tempData;
}

function getCanvasCoords(e) {
  const canvas = document.getElementById('drawCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

let currentStroke = [];

function startDraw(e) {
  if (!editorState.isDrawMode) return;
  editorState.isDrawing = true;
  const coords = getCanvasCoords(e);
  editorState.lastX = coords.x;
  editorState.lastY = coords.y;
  currentStroke = [{x: coords.x, y: coords.y}];
}

function draw(e) {
  if (!editorState.isDrawing || !editorState.isDrawMode) return;
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  const coords = getCanvasCoords(e);
  
  if (editorState.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(editorState.lastX, editorState.lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.lineWidth = editorState.drawSize * 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.beginPath();
    ctx.moveTo(editorState.lastX, editorState.lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = editorState.drawColor;
    ctx.lineWidth = editorState.drawSize;
    ctx.stroke();
  }
  
  editorState.lastX = coords.x;
  editorState.lastY = coords.y;
  currentStroke.push({x: coords.x, y: coords.y});
}

function endDraw() {
  if (editorState.isDrawing && currentStroke.length > 1) {
    if (editorState.isEraser) {
      editorState.sendEraseStroke(currentStroke, editorState.drawSize * 5);
    } else {
      editorState.sendDrawStroke(currentStroke, editorState.drawColor, editorState.drawSize);
    }
  }
  editorState.isDrawing = false;
  currentStroke = [];
}

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  startDraw({
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: e.target,
    preventDefault: () => {}
  });
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  draw({
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: e.target,
    preventDefault: () => {}
  });
}

function toggleDrawMode() {
  editorState.isDrawMode = !editorState.isDrawMode;
  const canvas = document.getElementById('drawCanvas');
  const editor = document.getElementById('editor');
  const btn = document.getElementById('drawToggle');
  
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
  const btn = document.getElementById('eraserToggle');
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
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    editorState.sendClearDrawing();
  }
}

function undoDraw() {
  editorState.undoDraw();
}

function redoDraw() {
  editorState.redoDraw();
}

function updateStatus(connected) {
  const status = document.getElementById('status');
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
  const editor = document.getElementById('editor');
  const text = editor.innerText;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = words;
  document.getElementById('charCount').textContent = text.length;
}

function saveDocument() {
  const content = document.getElementById('editor').innerHTML;
  const canvas = document.getElementById('drawCanvas');
  const drawing = canvas.toDataURL();
  localStorage.setItem('doc-backup', content);
  localStorage.setItem('drawing-backup', drawing);
  document.getElementById('lastSaved').textContent = new Date().toLocaleTimeString();
}

function exportDocument() {
  const content = document.getElementById('editor').innerHTML;
  const canvas = document.getElementById('drawCanvas');
  const drawing = canvas.toDataURL();
  const blob = new Blob([`
    <html>
      <head><title>CollabEdit Document</title></head>
      <body>
        ${content}
        <img src="${drawing}" />
      </body>
    </html>
  `], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `document-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearDocument() {
  if (confirm('Clear document and drawings?')) {
    const editor = document.getElementById('editor');
    editor.innerText = '';
    clearDrawing();
    editorState.sendUpdate('');
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
  const font = document.getElementById('fontFamily').value;
  document.execCommand('fontName', false, font);
}

function changeFontColor() {
  const color = document.getElementById('fontColor').value;
  document.execCommand('foreColor', false, color);
}

function changeDrawColor() {
  const color = document.getElementById('drawColor').value;
  editorState.drawColor = color;
  if (editorState.isEraser) {
    editorState.isEraser = false;
    document.getElementById('eraserToggle').style.color = '';
    document.getElementById('eraserToggle').style.borderColor = '';
    document.body.style.cursor = 'crosshair';
  }
}

function changeDrawSize() {
  const size = parseInt(document.getElementById('drawSize').value);
  editorState.drawSize = size;
}

function confirmNickname() {
  const input = document.getElementById('modalNicknameInput');
  const name = input.value.trim() || 'Guest';
  editorState.userName = name;
  document.getElementById('userNameDisplay').textContent = name;
  localStorage.setItem('collabedit-username', name);
  document.getElementById('nicknameModal').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  editorState.sendUserInfo();
  
  const roomId = window.location.hash.slice(1) || 'default';
  document.getElementById('roomId').textContent = roomId;
  editorState.connect(roomId);
}

function toggleRoomInput() {
  const input = document.getElementById('roomInput');
  const roomId = document.getElementById('roomId');
  if (input.style.display === 'none') {
    input.style.display = 'inline';
    input.value = roomId.textContent;
    input.focus();
  } else {
    input.style.display = 'none';
    const newRoom = input.value.trim() || 'default';
    roomId.textContent = newRoom;
    editorState.disconnect();
    editorState.connect(newRoom);
  }
}

const savedName = localStorage.getItem('collabedit-username') || 'Guest';
document.getElementById('modalNicknameInput').value = savedName;
document.getElementById('userNameDisplay').textContent = savedName;
editorState.userName = savedName;

console.log('Starting CollabEdit...');

document.getElementById('modalNicknameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    confirmNickname();
  }
});

const editor = document.getElementById('editor');
let sendTimeout = null;
let typingTimeout = null;

editor.addEventListener('input', (e) => {
  if (editorState.isRemoteUpdate) return;
  const currentContent = editor.innerText;
  if (currentContent !== editorState.lastContent) {
    editorState.lastContent = currentContent;
    updateStats();
    clearTimeout(sendTimeout);
    sendTimeout = setTimeout(() => {
      editorState.sendUpdate(currentContent);
    }, 100);
    
    clearTimeout(typingTimeout);
    editorState.sendTyping();
    typingTimeout = setTimeout(() => {
      editorState.sendTyping();
    }, 2000);
  }
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 0);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveDocument();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoAction();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    redoAction();
  }
});

window.addEventListener('beforeunload', () => {
  editorState.disconnect();
});

setInterval(() => {
  saveDocument();
}, 30000);

setTimeout(initCanvas, 100);

console.log('Editor initialized');
