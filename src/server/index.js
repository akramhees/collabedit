const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);

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
  console.log('Client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(message);
        }
      });
    } catch (e) {
      console.error('Error:', e);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
