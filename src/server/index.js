const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);

let documentContent = '';
let drawingData = '';
const clients = new Map();
const drawHistory = [];
const maxHistory = 100;
let historyIndex = -1;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, '../client/index.html')));
  } else if (req.url === '/editor.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(path.join(__dirname, '../client/editor.js')));
  } else if (req.url === '/styles.css') {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end(fs.readFileSync(path.join(__dirname, '../client/styles.css')));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  clients.set(clientId, ws);
  
  console.log(`Client ${clientId} connected. Total clients: ${clients.size}`);
  
  ws.send(JSON.stringify({
    type: 'sync',
    content: documentContent,
    drawing: drawingData,
    history: drawHistory,
    historyIndex: historyIndex
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'update') {
        documentContent = data.content;
        broadcast({
          type: 'update',
          content: documentContent
        }, clientId);
      } else if (data.type === 'draw') {
        drawingData = data.drawing || '';
        if (data.drawData) {
          drawHistory.push(data.drawData);
          if (drawHistory.length > maxHistory) {
            drawHistory.shift();
          }
          historyIndex = drawHistory.length - 1;
        }
        broadcast({
          type: 'draw',
          drawData: data.drawData,
          drawing: drawingData
        }, clientId);
      } else if (data.type === 'clear_drawing') {
        drawingData = '';
        drawHistory.push({ type: 'clear' });
        if (drawHistory.length > maxHistory) {
          drawHistory.shift();
        }
        historyIndex = drawHistory.length - 1;
        broadcast({
          type: 'clear_drawing'
        }, clientId);
      } else if (data.type === 'undo_draw') {
        if (historyIndex >= 0) {
          historyIndex--;
          broadcast({
            type: 'undo_draw',
            historyIndex: historyIndex
          }, clientId);
        }
      } else if (data.type === 'redo_draw') {
        if (historyIndex < drawHistory.length - 1) {
          historyIndex++;
          broadcast({
            type: 'redo_draw',
            historyIndex: historyIndex
          }, clientId);
        }
      } else if (data.type === 'erase_draw') {
        const eraseData = data.eraseData;
        drawHistory.push({ type: 'erase', data: eraseData });
        if (drawHistory.length > maxHistory) {
          drawHistory.shift();
        }
        historyIndex = drawHistory.length - 1;
        broadcast({
          type: 'erase_draw',
          eraseData: eraseData
        }, clientId);
      }
    } catch (e) {
      console.error('Error:', e);
    }
  });
  
  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`Client ${clientId} disconnected. Total clients: ${clients.size}`);
  });
});

function broadcast(data, senderId) {
  clients.forEach((client, id) => {
    if (id !== senderId && client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
