const uWS = require('uWebSockets.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Document } = require('./document');
const { PerformanceOptimizer } = require('./performance');

const documents = new Map();
const optimizer = new PerformanceOptimizer();

const app = uWS.App();

app.ws('/*', {
  compression: 0,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 60,
  
  open: (ws) => {
    const docId = ws.url.slice(1) || 'default';
    ws.clientId = crypto.randomBytes(8).toString('hex');
    ws.docId = docId;
    
    if (!documents.has(docId)) {
      documents.set(docId, new Document(docId));
    }
    
    const doc = documents.get(docId);
    doc.addClient(ws);
    
    ws.send(JSON.stringify({
      type: 'sync',
      content: doc.content,
      version: doc.version,
      clientId: ws.clientId,
      clients: Array.from(doc.clients.keys())
    }));
  },

  message: (ws, message, isBinary) => {
    try {
      const data = JSON.parse(Buffer.from(message).toString());
      const doc = documents.get(ws.docId);
      
      if (!doc) return;
      
      if (data.type === 'operation') {
        doc.applyOperation(data.op, ws.clientId);
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('Message error:', e);
    }
  },

  close: (ws) => {
    const doc = documents.get(ws.docId);
    if (doc) {
      doc.removeClient(ws.clientId);
    }
  }
});

app.get('/', (res, req) => {
  res.writeHeader('Content-Type', 'text/html');
  res.end(fs.readFileSync(path.join(__dirname, '../client/index.html')));
});

app.get('/editor.js', (res, req) => {
  res.writeHeader('Content-Type', 'application/javascript');
  res.end(fs.readFileSync(path.join(__dirname, '../client/editor.js')));
});

app.get('/styles.css', (res, req) => {
  res.writeHeader('Content-Type', 'text/css');
  res.end(fs.readFileSync(path.join(__dirname, '../client/styles.css')));
});

app.get('/stats/:docId', (res, req) => {
  const docId = req.getParameter(0);
  const doc = documents.get(docId);
  if (!doc) {
    res.writeStatus('404');
    res.end('Document not found');
    return;
  }
  
  res.writeHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    clients: doc.clients.size,
    operations: doc.operations.length,
    version: doc.version,
    contentLength: doc.content.length
  }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, (token) => {
  if (token) {
    console.log(`Server running on http://localhost:${PORT}`);
  } else {
    console.error('Failed to start server');
  }
});
