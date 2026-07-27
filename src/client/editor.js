class CRDT {
  constructor() {
    this.localOperations = [];
    this.pendingOperations = [];
    this.version = 0;
  }

  generateOp(type, position, text = '', length = 0) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type,
      position: position,
      text: text,
      length: length,
      timestamp: Date.now()
    };
  }

  transform(operation, existingOp) {
    if (operation.type === 'insert' && existingOp.type === 'insert') {
      if (operation.position >= existingOp.position) {
        operation.position += existingOp.text.length;
      }
    } else if (operation.type === 'insert' && existingOp.type === 'delete') {
      if (operation.position >= existingOp.position) {
        operation.position -= existingOp.length;
      }
    } else if (operation.type === 'delete' && existingOp.type === 'insert') {
      if (operation.position >= existingOp.position) {
        operation.position += existingOp.text.length;
      }
    } else if (operation.type === 'delete' && existingOp.type === 'delete') {
      if (operation.position >= existingOp.position) {
        operation.position -= existingOp.length;
      }
    }
    return operation;
  }
}

class EditorState {
  constructor() {
    this.crdt = new CRDT();
    this.isConnected = false;
    this.userCount = 0;
    this.clientId = '';
    this.roomId = 'default';
    this.pendingOps = [];
    this.lastContent = '';
    this.lastSaved = null;
    this.latency = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect(roomId = 'default') {
    this.roomId = roomId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || 3000;
    const wsUrl = `${protocol}//${host}:${port}/${roomId}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        updateStatus(true);
        this.startPing();
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
        this.stopPing();
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

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(this.roomId), delay);
    }
  }

  handleMessage(data) {
    if (data.type === 'sync') {
      const editor = document.getElementById('editor');
      editor.innerHTML = data.content;
      this.clientId = data.clientId;
      this.version = data.version;
      this.lastContent = data.content;
      this.userCount = data.clients ? data.clients.length : 1;
      updateCursorInfo(this.userCount);
      updateStatus(true);
      document.getElementById('roomId').textContent = this.roomId;
    } else if (data.type === 'operation') {
      this.applyRemoteOperation(data.op);
      this.version = data.version || this.version + 1;
    } else if (data.type === 'pong') {
      const latency = Date.now() - data.timestamp;
      this.latency = latency;
      document.getElementById('latency').textContent = `${latency}ms`;
    } else if (data.type === 'batch') {
      data.operations.forEach(op => this.applyRemoteOperation(op));
    }
  }

  applyLocalOperation(op) {
    this.pendingOps.forEach(pending => {
      op = this.crdt.transform(op, pending);
    });

    const editor = document.getElementById('editor');
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    
    if (op.type === 'insert') {
      const textNode = document.createTextNode(op.text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (op.type === 'delete') {
      const text = editor.innerText;
      const start = Math.min(op.position, text.length);
      const end = Math.min(start + op.length, text.length);
      if (start < end) {
        const newText = text.slice(0, start) + text.slice(end);
        editor.innerText = newText;
        const newRange = document.createRange();
        newRange.setStart(editor.childNodes[0] || editor, start);
        newRange.setEnd(editor.childNodes[0] || editor, start);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }

    this.sendOperation(op);
    this.pendingOps.push(op);
    this.lastContent = editor.innerText;
    updateStats();
  }

  applyRemoteOperation(op) {
    this.pendingOps.forEach(pending => {
      op = this.crdt.transform(op, pending);
    });

    const editor = document.getElementById('editor');
    const text = editor.innerText;
    
    if (op.type === 'insert') {
      const pos = Math.min(op.position, text.length);
      const newText = text.slice(0, pos) + op.text + text.slice(pos);
      editor.innerText = newText;
      
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.startContainer === editor || range.startContainer.parentNode === editor) {
          const newPos = pos + op.text.length;
          const newRange = document.createRange();
          newRange.setStart(editor.childNodes[0] || editor, newPos);
          newRange.setEnd(editor.childNodes[0] || editor, newPos);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
    } else if (op.type === 'delete') {
      const start = Math.min(op.position, text.length);
      const end = Math.min(start + op.length, text.length);
      if (start < end) {
        const newText = text.slice(0, start) + text.slice(end);
        editor.innerText = newText;
      }
    }

    this.lastContent = editor.innerText;
    updateStats();
  }

  sendOperation(op) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'operation',
        op: op,
        timestamp: Date.now()
      }));
    }
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        }));
      }
    }, 1000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.stopPing();
  }

  save() {
    const content = document.getElementById('editor').innerHTML;
    localStorage.setItem(`doc-${this.roomId}`, content);
    this.lastSaved = new Date();
    document.getElementById('lastSaved').textContent = `Last saved: ${this.lastSaved.toLocaleTimeString()}`;
    return content;
  }

  exportDoc() {
    const content = document.getElementById('editor').innerHTML;
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-${this.roomId}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clear() {
    if (confirm('Clear document?')) {
      const editor = document.getElementById('editor');
      editor.innerHTML = '';
      this.lastContent = '';
      updateStats();
    }
  }
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
  document.getElementById('cursorInfo').textContent = `${count} user${count !== 1 ? 's' : ''} online`;
}

function updateStats() {
  const editor = document.getElementById('editor');
  const text = editor.innerText;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = `${words} words`;
  document.getElementById('charCount').textContent = `${text.length} characters`;
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

function saveDocument() {
  editorState.save();
}

function exportDocument() {
  editorState.exportDoc();
}

function clearDocument() {
  editorState.clear();
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
let isLocalChange = false;
let lastContent = editor.innerHTML;

editor.addEventListener('input', (e) => {
  if (isLocalChange) return;
  
  const currentContent = editor.innerText;
  
  if (currentContent !== lastContent) {
    const diff = findDiff(lastContent, currentContent);
    if (diff) {
      const op = editorState.crdt.generateOp(
        diff.type,
        diff.position,
        diff.text || '',
        diff.length || 0
      );
      editorState.applyLocalOperation(op);
    }
    lastContent = currentContent;
    updateStats();
  }
});

function findDiff(oldText, newText) {
  if (oldText === newText) return null;
  
  let i = 0;
  while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
    i++;
  }
  
  if (newText.length > oldText.length) {
    return {
      type: 'insert',
      position: i,
      text: newText.slice(i)
    };
  } else {
    let j = 0;
    while (j < oldText.length - i && j < newText.length - i && 
           oldText[oldText.length - 1 - j] === newText[newText.length - 1 - j]) {
      j++;
    }
    return {
      type: 'delete',
      position: i,
      length: oldText.length - i - j
    };
  }
}

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
  if (editorState.isConnected) {
    editorState.save();
  }
}, 30000);
