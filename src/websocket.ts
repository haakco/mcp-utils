/**
 * WebSocket utilities for MCP servers
 */

import { EventEmitter } from 'events';

export interface WebSocketOptions {
  url: string;
  protocols?: string | string[];
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  reconnectBackoff?: number;
  pingInterval?: number;
  pongTimeout?: number;
  headers?: Record<string, string>;
}

export interface WebSocketEvents {
  open: () => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
  message: (data: unknown) => void;
  reconnecting: (attempt: number) => void;
  reconnected: () => void;
  ping: () => void;
  pong: () => void;
}

/**
 * Reconnecting WebSocket with automatic reconnection and heartbeat
 */
export class ReconnectingWebSocket extends EventEmitter {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private pongTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private isClosing = false;
  private messageQueue: unknown[] = [];

  constructor(private options: WebSocketOptions) {
    super();
    this.connect();
  }

  private connect(): void {
    try {
      // Note: In Node.js environments, you may need to use 'ws' package
      // This is a browser-compatible implementation
      this.ws = new WebSocket(this.options.url, this.options.protocols);
      this.setupEventHandlers();
    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit('open');

      // Send queued messages
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        this.send(message);
      }

      // Start ping/pong heartbeat
      if (this.options.pingInterval) {
        this.startHeartbeat();
      }

      if (this.reconnectAttempts > 0) {
        this.emit('reconnected');
      }
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      this.emit('close', event.code, event.reason);

      if (!this.isClosing) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (_event) => {
      this.emit('error', new Error('WebSocket error'));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = this.parseMessage(event.data);

        // Handle pong messages
        if (data && typeof data === 'object' && 'type' in data && data.type === 'pong') {
          this.handlePong();
        } else {
          this.emit('message', data);
        }
      } catch (error) {
        this.emit('error', error as Error);
      }
    };
  }

  private parseMessage(data: unknown): unknown {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data;
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? 5;

    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const baseInterval = this.options.reconnectInterval ?? 5000;
    const backoff = this.options.reconnectBackoff ?? 1.5;
    const interval = baseInterval * Math.pow(backoff, this.reconnectAttempts - 1);

    this.emit('reconnecting', this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, interval);
  }

  private startHeartbeat(): void {
    const pingInterval = this.options.pingInterval ?? 30000;

    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing();

        // Set pong timeout
        const pongTimeout = this.options.pongTimeout ?? 5000;
        this.pongTimer = setTimeout(() => {
          // No pong received, close connection
          this.ws?.close(4000, 'Pong timeout');
        }, pongTimeout);
      }
    }, pingInterval);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  private sendPing(): void {
    this.emit('ping');
    this.send({ type: 'ping', timestamp: Date.now() });
  }

  private handlePong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
    this.emit('pong');
  }

  send(data: unknown): void {
    if (!this.isConnected()) {
      // Queue message for when connection is restored
      this.messageQueue.push(data);
      return;
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws!.send(message);
  }

  close(code = 1000, reason = 'Normal closure'): void {
    this.isClosing = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.stopHeartbeat();
    this.messageQueue = [];

    if (this.ws) {
      this.ws.close(code, reason);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  getBufferedAmount(): number {
    return this.ws?.bufferedAmount ?? 0;
  }
}

/**
 * WebSocket message router for handling different message types
 */
export class WebSocketRouter<T extends { type: string }> {
  private handlers = new Map<string, Array<(message: T) => void | Promise<void>>>();
  private defaultHandler?: (message: T) => void | Promise<void>;

  on(type: string, handler: (message: T) => void | Promise<void>): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  off(type: string, handler: (message: T) => void | Promise<void>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  setDefaultHandler(handler: (message: T) => void | Promise<void>): void {
    this.defaultHandler = handler;
  }

  async handle(message: T): Promise<void> {
    const handlers = this.handlers.get(message.type);

    if (handlers && handlers.length > 0) {
      await Promise.all(handlers.map((handler) => handler(message)));
    } else if (this.defaultHandler) {
      await this.defaultHandler(message);
    }
  }

  clear(): void {
    this.handlers.clear();
    this.defaultHandler = undefined;
  }
}

/**
 * WebSocket RPC client for request/response pattern
 */
export class WebSocketRPC {
  private pendingRequests = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(
    private ws: ReconnectingWebSocket,
    private options: {
      timeout?: number;
      idGenerator?: () => string;
    } = {}
  ) {
    this.ws.on('message', this.handleMessage.bind(this));
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    const id = this.options.idGenerator?.() ?? this.generateId();
    const timeout = this.options.timeout ?? 30000;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle });

      this.ws.send({
        jsonrpc: '2.0',
        id,
        method,
        params
      });
    });
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object' || !('id' in message)) {
      return;
    }

    const msg = message as { id: string; error?: { message?: string }; result?: unknown };
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error.message || 'RPC error'));
    } else {
      pending.resolve(msg.result);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  clear(): void {
    for (const [, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('RPC client cleared'));
    }
    this.pendingRequests.clear();
  }
}

/**
 * WebSocket connection pool for managing multiple connections
 */
export class WebSocketPool {
  private connections = new Map<string, ReconnectingWebSocket>();

  constructor(
    private maxConnections = 10,
    private defaultOptions?: Partial<WebSocketOptions>
  ) {}

  get(url: string, options?: Partial<WebSocketOptions>): ReconnectingWebSocket {
    let connection = this.connections.get(url);

    if (!connection) {
      if (this.connections.size >= this.maxConnections) {
        // Remove least recently used
        const firstKey = this.connections.keys().next().value;
        if (firstKey) {
          const oldConnection = this.connections.get(firstKey);
          oldConnection?.close();
          this.connections.delete(firstKey);
        }
      }

      connection = new ReconnectingWebSocket({
        ...this.defaultOptions,
        ...options,
        url
      });

      this.connections.set(url, connection);
    }

    return connection;
  }

  close(url: string): void {
    const connection = this.connections.get(url);
    if (connection) {
      connection.close();
      this.connections.delete(url);
    }
  }

  closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
  }

  size(): number {
    return this.connections.size;
  }
}

/**
 * Create a WebSocket client with automatic JSON parsing
 */
export function createJSONWebSocket(
  url: string,
  options?: Partial<WebSocketOptions>
): ReconnectingWebSocket {
  const ws = new ReconnectingWebSocket({ ...options, url });

  // Override send to automatically stringify
  const originalSend = ws.send.bind(ws);
  ws.send = (data: unknown) => {
    if (typeof data === 'object') {
      originalSend(JSON.stringify(data));
    } else {
      originalSend(data);
    }
  };

  return ws;
}
