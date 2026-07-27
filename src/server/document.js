class Document {
  constructor(id) {
    this.id = id;
    this.content = '';
    this.operations = [];
    this.clients = new Map();
    this.version = 0;
    this.lastModified = Date.now();
  }

  addClient(ws) {
    this.clients.set(ws.clientId, ws);
    this.lastModified = Date.now();
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    this.lastModified = Date.now();
  }

  applyOperation(op, clientId) {
    if (!this.validateOperation(op)) {
      return;
    }

    const transformedOp = this.transformOperation(op, clientId);
    
    if (transformedOp.type === 'insert') {
      const pos = this.getPosition(transformedOp.position);
      this.content = this.content.slice(0, pos) + transformedOp.text + this.content.slice(pos);
    } else if (transformedOp.type === 'delete') {
      const start = this.getPosition(transformedOp.position);
      const end = Math.min(start + transformedOp.length, this.content.length);
      this.content = this.content.slice(0, start) + this.content.slice(end);
    }

    this.version++;
    this.operations.push({
      ...transformedOp,
      clientId,
      timestamp: Date.now(),
      version: this.version
    });
    
    this.lastModified = Date.now();
    this.broadcast(transformedOp, clientId);
  }

  validateOperation(op) {
    if (!op || !op.type) return false;
    if (op.type === 'insert' && typeof op.text !== 'string') return false;
    if (op.type === 'delete' && typeof op.length !== 'number') return false;
    if (typeof op.position !== 'number' || op.position < 0) return false;
    return true;
  }

  transformOperation(op, clientId) {
    let transformed = { ...op };
    
    for (const existingOp of this.operations) {
      if (existingOp.clientId === clientId) continue;
      
      if (transformed.type === 'insert') {
        if (existingOp.type === 'insert') {
          if (transformed.position >= existingOp.position) {
            transformed.position += existingOp.text.length;
          }
        } else if (existingOp.type === 'delete') {
          if (transformed.position >= existingOp.position) {
            transformed.position -= existingOp.length;
          }
        }
      } else if (transformed.type === 'delete') {
        if (existingOp.type === 'insert') {
          if (transformed.position >= existingOp.position) {
            transformed.position += existingOp.text.length;
          }
        } else if (existingOp.type === 'delete') {
          if (transformed.position >= existingOp.position) {
            transformed.position -= existingOp.length;
          }
        }
      }
    }
    
    return transformed;
  }

  getPosition(index) {
    return Math.max(0, Math.min(index, this.content.length));
  }

  broadcast(op, senderId) {
    const message = JSON.stringify({
      type: 'operation',
      op: op,
      version: this.version,
      timestamp: Date.now()
    });

    this.clients.forEach((ws, id) => {
      if (id !== senderId && ws.readyState === 1) {
        ws.send(message);
      }
    });
  }

  getState() {
    return {
      content: this.content,
      version: this.version,
      clients: Array.from(this.clients.keys())
    };
  }
}

module.exports = { Document };
