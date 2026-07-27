const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Store document state
let documentContent = '';
const clients = new Map();

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
  
  // Send current document content to new client
  ws.send(JSON.stringify({
    type: 'sync',
    content: documentContent
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'update') {
        // Update document content
        documentContent = data.content;
        
        // Broadcast to all other clients
        clients.forEach((client, id) => {
          if (id !== clientId && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'update',
              content: documentContent
            }));
          }
        });
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
