class EditorState {
  constructor() {
    this.isConnected = false;
    this.roomId = 'default';
    this.lastContent = '';
    this.ws = null;
  }

  connect(roomId = 'default') {
    this.roomId = roomId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || 3000;
    const wsUrl = `${protocol}//${host}:${port}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        updateStatus(true);
        console.log('Connected to server');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Message parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        updateStatus(false);
        setTimeout(() => this.connect(this.roomId), 3000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('Connection error:', e);
      setTimeout(() => this.connect(this.roomId), 3000);
    }
  }

  handleMessage(data) {
    const editor = document.getElementById('editor');
    
    if (data.type === 'sync') {
      editor.innerText = data.content || '';
      this.lastContent = editor.innerText;
      updateStats();
    } else if (data.type === 'update') {
      const currentText = editor.innerText;
      if (currentText !== data.content) {
        editor.innerText = data.content;
        this.lastContent = data.content;
        updateStats();
      }
    }
  }

  sendUpdate(content) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'update',
        content: content
      }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

let isDrawMode = false;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let drawColor = '#4CAF50';
let drawSize = 3;

function initCanvas() {
  const canvas = document.getElementById('drawCanvas');
  const container = document.getElementById('editor-container');
  
  canvas.width = container.offsetWidth;
  canvas.height = document.getElementById('editor').offsetHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = drawColor;
  ctx.lineWidth = drawSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Mouse events
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  
  // Touch events for mobile
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

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = e.target.getBoundingClientRect();
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
  const rect = e.target.getBoundingClientRect();
  draw({
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: e.target,
    preventDefault: () => {}
  });
}

function getCanvasCoords(e) {
  const canvas = document.getElementById('drawCanvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDraw(e) {
  if (!isDrawMode) return;
  isDrawing = true;
  const coords = getCanvasCoords(e);
  lastX = coords.x;
  lastY = coords.y;
}

function draw(e) {
  if (!isDrawing || !isDrawMode) return;
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  const coords = getCanvasCoords(e);
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(coords.x, coords.y);
  ctx.strokeStyle = drawColor;
  ctx.lineWidth = drawSize;
  ctx.stroke();
  
  lastX = coords.x;
  lastY = coords.y;
}

function endDraw() {
  isDrawing = false;
}

function toggleDrawMode() {
  isDrawMode = !isDrawMode;
  const canvas = document.getElementById('drawCanvas');
  const editor = document.getElementById('editor');
  const btn = document.getElementById('drawToggle');
  
  if (isDrawMode) {
    canvas.style.display = 'block';
    editor.style.opacity = '0.5';
    btn.style.color = '#4CAF50';
    btn.style.borderColor = '#4CAF50';
    document.body.style.cursor = 'crosshair';
  } else {
    canvas.style.display = 'none';
    editor.style.opacity = '1';
    btn.style.color = '';
    btn.style.borderColor = '';
    document.body.style.cursor = '';
  }
}

function clearDrawing() {
  if (confirm('Clear all drawings?')) {
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function changeDrawColor(color) {
  drawColor = color;
}

function changeDrawSize(size) {
  drawSize = size;
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

function updateStats() {
  const editor = document.getElementById('editor');
  const text = editor.innerText;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = `${words} words`;
  document.getElementById('charCount').textContent = `${text.length} characters`;
}

function saveDocument() {
  const content = document.getElementById('editor').innerHTML;
  const canvas = document.getElementById('drawCanvas');
  const drawing = canvas.toDataURL();
  localStorage.setItem('doc-backup', content);
  localStorage.setItem('drawing-backup', drawing);
  document.getElementById('lastSaved').textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
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
  document.execCommand('undo');
}

function redoAction() {
  document.execCommand('redo');
}

function changeFontFamily() {
  const font = document.getElementById('fontFamily').value;
  document.execCommand('fontName', false, font);
}

function changeFontColor() {
  const color = document.getElementById('fontColor').value;
  document.execCommand('foreColor', false, color);
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

const roomId = window.location.hash.slice(1) || 'default';
const editorState = new EditorState();
document.getElementById('roomId').textContent = roomId;

editorState.connect(roomId);

const editor = document.getElementById('editor');
let sendTimeout = null;

editor.addEventListener('input', (e) => {
  const currentContent = editor.innerText;
  if (currentContent !== editorState.lastContent) {
    editorState.lastContent = currentContent;
    updateStats();
    clearTimeout(sendTimeout);
    sendTimeout = setTimeout(() => {
      editorState.sendUpdate(currentContent);
    }, 100);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveDocument();
  }
});

window.addEventListener('beforeunload', () => {
  editorState.disconnect();
});

setInterval(() => {
  saveDocument();
}, 30000);

// Initialize canvas after DOM loads
setTimeout(initCanvas, 100);

console.log('Editor initialized with drawing support');
