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
      // Initial sync - set content
      editor.innerText = data.content || '';
      this.lastContent = editor.innerText;
      updateStats();
    } else if (data.type === 'update') {
      // Remote update - only update if different
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
  localStorage.setItem('doc-backup', content);
  document.getElementById('lastSaved').textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
}

function exportDocument() {
  const content = document.getElementById('editor').innerHTML;
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `document-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearDocument() {
  if (confirm('Clear document?')) {
    const editor = document.getElementById('editor');
    editor.innerText = '';
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

// Initialize
const roomId = window.location.hash.slice(1) || 'default';
const editorState = new EditorState();
document.getElementById('roomId').textContent = roomId;

editorState.connect(roomId);

const editor = document.getElementById('editor');
let isLocalChange = false;
let sendTimeout = null;

editor.addEventListener('input', (e) => {
  if (isLocalChange) return;
  
  const currentContent = editor.innerText;
  
  if (currentContent !== editorState.lastContent) {
    editorState.lastContent = currentContent;
    updateStats();
    
    // Send update with debounce
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

// Auto-save every 30 seconds
setInterval(() => {
  saveDocument();
}, 30000);

console.log('Editor initialized');
