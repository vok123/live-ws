export class Event {
  public target: any;
  public type: string;
  constructor(type: string, target: any) {
    this.target = target;
    this.type = type;
  }
}

export class ErrorEvent extends Event {
  public message: string;
  public error: Error;
  constructor(error: Error, target: any) {
    super('error', target);
    this.message = error.message;
    this.error = error;
  }
}

export class CloseEvent extends Event {
  public code: number;
  public reason: string;
  public wasClean = true;
  constructor(code = 1000, reason = '', target: any) {
    super('close', target);
    this.code = code;
    this.reason = reason;
  }
}
export interface WebSocketEventMap {
  close: CloseEvent;
  error: ErrorEvent;
  message: MessageEvent;
  open: Event;
}

export interface WebSocketEventListenerMap {
  close: (event: CloseEvent) => void | { handleEvent: (event: CloseEvent) => void };
  error: (event: ErrorEvent) => void | { handleEvent: (event: ErrorEvent) => void };
  message: (event: MessageEvent) => void | { handleEvent: (event: MessageEvent) => void };
  open: (event: Event) => void | { handleEvent: (event: Event) => void };
}

const getGlobalWebSocket = (): WebSocket | undefined => {
  if (typeof WebSocket !== 'undefined') {
    // @ts-ignore
    return WebSocket;
  }
};

/**
 * Returns true if given argument looks like a WebSocket class
 */
const isWebSocket = (w: any) => typeof w !== 'undefined' && !!w && w.CLOSING === 2;

/**
 * Configuration options for LiveWebSocket
 */
export type Options = {
  /** Custom WebSocket class to use */
  WebSocket?: any;
  /** Maximum delay between reconnection attempts in milliseconds (default: 10000) */
  maxReconnectionDelay?: number;
  /** Minimum delay between reconnection attempts in milliseconds (default: 1000 + random) */
  minReconnectionDelay?: number;
  /** Factor by which reconnection delay increases with each attempt (default: 1.3) */
  reconnectionDelayGrowFactor?: number;
  /** Minimum time in milliseconds that a connection should remain open to be considered stable (default: 5000) */
  minUptime?: number;
  /** Timeout in milliseconds for connection attempts (default: 4000) */
  connectionTimeout?: number;
  /** Maximum number of reconnection attempts (default: Infinity) */
  maxRetries?: number;
  /** Maximum number of messages to queue while waiting for connection (default: Infinity) */
  maxEnqueuedMessages?: number;
  /** Whether to start in closed state rather than connecting immediately (default: false) */
  startClosed?: boolean;
  /** Timeout in milliseconds for pong response before declaring connection dead (default: 2000) */
  pongTimeoutInterval?: number;
  /** Interval in milliseconds between heartbeat pings (default: 10000) */
  heartbeatInterval?: number;
  /** Enable verbose debug logging (default: false) */
  debug?: boolean;
  /** Whether to attempt reconnection when page becomes visible (default: true) */
  reconnectOnVisibility?: boolean;
  /** Time in milliseconds after page is hidden to close the connection (default: 5 minutes) */
  pageHiddenCloseTime?: number;
};

const DEFAULT = {
  maxReconnectionDelay: 10000,
  minReconnectionDelay: 1000 + Math.random() * 4000,
  minUptime: 5000,
  reconnectionDelayGrowFactor: 1.3,
  connectionTimeout: 4000,
  pongTimeoutInterval: 2000,
  heartbeatInterval: 10000,
  maxRetries: Infinity,
  maxEnqueuedMessages: Infinity,
  startClosed: false,
  reconnectOnVisibility: true,
  pageHiddenCloseTime: 5 * 60 * 1000,
  debug: false
};

export type UrlProvider = string | (() => string) | (() => Promise<string>);

export type Message = string | ArrayBuffer | Blob | ArrayBufferView;

export type ListenersMap = {
  error: Array<WebSocketEventListenerMap['error']>;
  message: Array<WebSocketEventListenerMap['message']>;
  open: Array<WebSocketEventListenerMap['open']>;
  close: Array<WebSocketEventListenerMap['close']>;
};

export default class LiveWebSocket {
  private _ws?: WebSocket;
  private _listeners: ListenersMap = {
    error: [],
    message: [],
    open: [],
    close: []
  };
  private _pageHiddenTime: number | null = null;
  private _retryCount = -1;
  private _uptimeTimeout: any;
  private _connectTimeout: any;
  private _shouldReconnect = true;
  private _connectLock = false;
  private _binaryType: BinaryType = 'blob';
  private _closeCalled = false;
  private _messageQueue: Message[] = [];
  private _pingTimer: any;
  private _pongTimeoutTimer: any;
  private _onVisibility = () => {
    const isPageShow = document.visibilityState === 'visible';
    this._pageHiddenTime = isPageShow ? null : Date.now();
    this._debug('visibilitychange', isPageShow, this.CLOSED);
    if (isPageShow && (!this._ws || this._ws?.readyState === this.CLOSED)) {
      this._retryCount = 0;
      this.reconnect();
    }
  };

  private readonly _url: UrlProvider;
  private readonly _protocols?: string | string[];
  private readonly _options: Options;

  constructor(url: UrlProvider, protocols?: string | string[], options?: Options) {
    this._url = url;
    this._protocols = protocols;
    this._options = Object.assign({}, DEFAULT, options);
    if (this._options.startClosed) {
      this._shouldReconnect = false;
    }
    this._connect(true);
    this._listenOnVisibility();
  }

  static get CONNECTING() {
    return 0;
  }
  static get OPEN() {
    return 1;
  }
  static get CLOSING() {
    return 2;
  }
  static get CLOSED() {
    return 3;
  }

  get CONNECTING() {
    return LiveWebSocket.CONNECTING;
  }
  get OPEN() {
    return LiveWebSocket.OPEN;
  }
  get CLOSING() {
    return LiveWebSocket.CLOSING;
  }
  get CLOSED() {
    return LiveWebSocket.CLOSED;
  }

  get binaryType() {
    return this._ws ? this._ws.binaryType : this._binaryType;
  }

  set binaryType(value: BinaryType) {
    this._binaryType = value;
    if (this._ws) {
      this._ws.binaryType = value;
    }
  }

  /**
   * Returns the number or connection retries
   */
  get retryCount(): number {
    return Math.max(this._retryCount, 0);
  }

  /**
   * The number of bytes of data that have been queued using calls to send() but not yet
   * transmitted to the network. This value resets to zero once all queued data has been sent.
   * This value does not reset to zero when the connection is closed; if you keep calling send(),
   * this will continue to climb. Read only
   */
  get bufferedAmount(): number {
    const bytes = this._messageQueue.reduce((acc, message) => {
      if (typeof message === 'string') {
        acc += message.length; // not byte size
      } else if (message instanceof Blob) {
        acc += message.size;
      } else {
        acc += message.byteLength;
      }
      return acc;
    }, 0);
    return bytes + (this._ws ? this._ws.bufferedAmount : 0);
  }

  /**
   * The extensions selected by the server. This is currently only the empty string or a list of
   * extensions as negotiated by the connection
   */
  get extensions(): string {
    return this._ws ? this._ws.extensions : '';
  }

  /**
   * A string indicating the name of the sub-protocol the server selected;
   * this will be one of the strings specified in the protocols parameter when creating the
   * WebSocket object
   */
  get protocol(): string {
    return this._ws ? this._ws.protocol : '';
  }

  /**
   * The current state of the connection; this is one of the Ready state constants
   */
  get readyState(): number {
    if (this._ws) {
      return this._ws.readyState;
    }
    return this._options.startClosed ? LiveWebSocket.CLOSED : LiveWebSocket.CONNECTING;
  }

  /**
   * The URL as resolved by the constructor
   */
  get url(): string {
    return this._ws ? this._ws.url : '';
  }

  /**
   * An event listener to be called when the WebSocket connection's readyState changes to CLOSED
   */
  public onclose: ((event: CloseEvent) => void) | null = null;

  /**
   * An event listener to be called when an error occurs
   */
  public onerror: ((event: ErrorEvent) => void) | null = null;

  /**
   * An event listener to be called when a message is received from the server
   */
  public onmessage: ((event: MessageEvent) => void) | null = null;

  /**
   * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
   * this indicates that the connection is ready to send and receive data
   */
  public onopen: ((event: Event) => void) | null = null;
  /**
   * Triggered when reconnection is successful, you can resend the subscription parameters in this event
   */
  public onReconnect: ((ws: LiveWebSocket) => void) | null = null;
  /**
   * Before sending a ping to the server, you can send any agreed ping data to the server.
   */
  public onBeforePing: ((ws: LiveWebSocket) => void) | null = null;
  /**
   * Closes the WebSocket connection or connection attempt, if any. If the connection is already
   * CLOSED, this method does nothing
   */
  public close(code = 1000, reason?: string) {
    this._finishWs(code, reason);
    this._removeVisibility();
  }

  /**
   * Closes the WebSocket connection or connection attempt and connects again.
   * Resets retry counter;
   */
  public reconnect(code?: number, reason?: string) {
    this._shouldReconnect = true;
    this._closeCalled = false;
    this._retryCount = -1;
    if (!this._ws || this._ws.readyState === this.CLOSED) {
      this._connect();
    } else {
      this._disconnect(code, reason);
      this._connect();
    }
  }

  /**
   * Enqueue specified data to be transmitted to the server over the WebSocket connection
   */
  public send(data: Message) {
    if (this._ws && this._ws.readyState === this.OPEN) {
      this._debug('send', data);
      this._ws.send(data);
    } else {
      const { maxEnqueuedMessages = DEFAULT.maxEnqueuedMessages } = this._options;
      if (this._messageQueue.length < maxEnqueuedMessages) {
        this._debug('enqueue', data);
        this._messageQueue.push(data);
      }
    }
  }

  /**
   * Register an event handler of a specific event type
   */
  public addEventListener<T extends keyof WebSocketEventListenerMap>(
    type: T,
    listener: WebSocketEventListenerMap[T]
  ): void {
    if (this._listeners[type]) {
      // @ts-ignore
      this._listeners[type].push(listener);
    }
  }

  public dispatchEvent(event: Event) {
    const listeners = this._listeners[event.type as keyof WebSocketEventListenerMap];
    if (listeners) {
      for (const listener of listeners) {
        this._callEventListener(event, listener);
      }
    }
    return true;
  }

  /**
   * Removes an event listener
   */
  public removeEventListener<T extends keyof WebSocketEventListenerMap>(
    type: T,
    listener: WebSocketEventListenerMap[T]
  ): void {
    if (this._listeners[type]) {
      // @ts-ignore
      this._listeners[type] = this._listeners[type].filter((l) => l !== listener);
    }
  }

  public heartbeatHealth() {
    this._removePong();
  }

  public _finishWs(code = 1000, reason?: string) {
    this._closeCalled = true;
    this._shouldReconnect = false;
    this._connectLock = false;
    this._clearTimeouts();
    if (!this._ws) {
      this._debug('close enqueued: no ws instance');
      return;
    }
    if (this._ws.readyState === this.CLOSED) {
      this._debug('close: already closed');
      return;
    }
    this._ws.close(code, reason);
  }

  private _debug(...args: any[]) {
    if (this._options.debug) {
      // not using spread because compiled version uses Symbols
      // tslint:disable-next-line
      console.log.apply(console, ['RWS>', ...args]);
    }
  }

  private _getNextDelay() {
    const {
      reconnectionDelayGrowFactor = DEFAULT.reconnectionDelayGrowFactor,
      minReconnectionDelay = DEFAULT.minReconnectionDelay,
      maxReconnectionDelay = DEFAULT.maxReconnectionDelay
    } = this._options;
    let delay = 0;
    if (this._retryCount > 0) {
      delay = minReconnectionDelay * Math.pow(reconnectionDelayGrowFactor, this._retryCount - 1);
      if (delay > maxReconnectionDelay) {
        delay = maxReconnectionDelay;
      }
    }
    this._debug('next delay', delay);
    return delay;
  }

  private _wait(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this._getNextDelay());
    });
  }

  private _getNextUrl(urlProvider: UrlProvider): Promise<string> {
    if (typeof urlProvider === 'string') {
      return Promise.resolve(urlProvider);
    }
    if (typeof urlProvider === 'function') {
      const url = urlProvider();
      if (typeof url === 'string') {
        return Promise.resolve(url);
      }
      // @ts-ignore redundant check
      if (url.then) {
        return url;
      }
    }
    throw Error('Invalid URL');
  }

  private _connect(isInit = false) {
    this._debug('connect call', this._connectLock, this._shouldReconnect);
    if (this._connectLock || !this._shouldReconnect) {
      return;
    }

    if (document.visibilityState === 'hidden') {
      return;
    }

    const {
      maxRetries = DEFAULT.maxRetries,
      connectionTimeout = DEFAULT.connectionTimeout,
      WebSocket = getGlobalWebSocket()
    } = this._options;
    this._debug('retryCount', this._retryCount, 'maxRetries', maxRetries);
    if (this._retryCount >= maxRetries) {
      this._debug('max retries reached', this._retryCount, '>=', maxRetries);
      return;
    }
    this._connectLock = true;

    this._retryCount++;

    this._debug('connect', this._retryCount);
    this._removeListeners();
    if (!isWebSocket(WebSocket)) {
      throw Error('No valid WebSocket class provided');
    }
    this._wait()
      .then(() => this._getNextUrl(this._url))
      .then((url) => {
        // close could be called before creating the ws
        if (this._closeCalled) {
          return;
        }
        this._debug('connect', { url, protocols: this._protocols });
        this._ws = this._protocols ? new WebSocket(url, this._protocols) : new WebSocket(url);
        this._ws!.binaryType = this._binaryType;
        this._connectLock = false;
        this._addListeners();
        if (!isInit) {
          this.onReconnect?.(this);
        }
        this._connectTimeout = setTimeout(() => this._handleTimeout(), connectionTimeout);
      });
  }

  private _handleTimeout() {
    this._debug('timeout event');
    this._handleError(new ErrorEvent(Error('TIMEOUT'), this));
  }

  private _disconnect(code = 1000, reason?: string) {
    this._clearTimeouts();
    if (!this._ws) {
      return;
    }
    this._removeListeners();
    try {
      this._ws.close(code, reason);
      this._handleClose(new CloseEvent(code, reason, this));
    } catch (error) {
      // ignore
    }
  }

  private _acceptOpen() {
    this._debug('accept open');
    this._retryCount = 0;
  }

  private _callEventListener<T extends keyof WebSocketEventListenerMap>(
    event: WebSocketEventMap[T],
    listener: WebSocketEventListenerMap[T]
  ) {
    if ('handleEvent' in listener) {
      // @ts-ignore
      listener.handleEvent(event);
    } else {
      // @ts-ignore
      listener(event);
    }
  }

  private _handlePong() {
    this._debug('pong');
    clearTimeout(this._pongTimeoutTimer);
    this._pongTimeoutTimer = setTimeout(() => {
      this._finishWs(3001, 'pong timeout');
      this.reconnect();
    }, this._options.pongTimeoutInterval);
  }

  private _removePing() {
    clearInterval(this._pingTimer);
  }

  private _removePong() {
    clearTimeout(this._pongTimeoutTimer);
  }
  private _handlePing() {
    const { onBeforePing } = this;
    if (!onBeforePing) {
      return;
    }
    this._debug('ping');
    this._removePing();
    this._pingTimer = setInterval(() => {
      onBeforePing(this);
      this._handlePong();
    }, this._options.heartbeatInterval);
  }

  private _handleOpen = (event: Event) => {
    this._debug('open event');
    const { minUptime = DEFAULT.minUptime } = this._options;

    clearTimeout(this._connectTimeout);
    this._uptimeTimeout = setTimeout(() => this._acceptOpen(), minUptime);

    this._ws!.binaryType = this._binaryType;
    // send enqueued messages (messages sent before websocket open event)
    this._debug('send enqueued messages', this._messageQueue);
    this._messageQueue.forEach((message) => this._ws?.send(message));
    this._messageQueue = [];

    this._handlePing();

    if (this.onopen) {
      this.onopen(event);
    }
    this._listeners.open.forEach((listener) => this._callEventListener(event, listener));
  };

  private _checkPageHidden() {
    if (this._options.reconnectOnVisibility && this._pageHiddenTime) {
      if (this._options.pageHiddenCloseTime) {
        if (Date.now() - this._pageHiddenTime > this._options.pageHiddenCloseTime) {
          this._finishWs(3002, 'page hidden');
          this._debug('page hidden close');
        }
      }
    }
  }

  private _handleMessage = (event: MessageEvent) => {
    this._debug('message event');

    if (this.onmessage) {
      this.onmessage(event);
    }

    this._checkPageHidden();

    this._listeners.message.forEach((listener) => this._callEventListener(event, listener));
  };

  private _handleError = (event: ErrorEvent) => {
    this._debug('error event', event.message);
    this._connectLock = false;
    this._disconnect(undefined, event.message === 'TIMEOUT' ? 'timeout' : undefined);
    if (this.onerror) {
      this.onerror(event);
    }
    this._debug('exec error listeners');
    this._listeners.error.forEach((listener) => this._callEventListener(event, listener));

    this._connect();
  };

  private _handleClose = (event: CloseEvent) => {
    this._debug('close event');
    this._clearTimeouts();
    this._connectLock = false;

    if (this._shouldReconnect) {
      this._connect();
    }

    if (this.onclose) {
      this.onclose(event);
    }
    this._listeners.close.forEach((listener) => this._callEventListener(event, listener));
  };

  private _removeListeners() {
    if (!this._ws) {
      return;
    }
    this._debug('removeListeners');
    this._ws.removeEventListener('open', this._handleOpen);
    this._ws.removeEventListener('close', this._handleClose);
    this._ws.removeEventListener('message', this._handleMessage);
    // @ts-ignore
    this._ws.removeEventListener('error', this._handleError);
  }

  private _addListeners() {
    if (!this._ws) {
      return;
    }
    this._debug('addListeners');
    this._ws.addEventListener('open', this._handleOpen);
    this._ws.addEventListener('close', this._handleClose);
    this._ws.addEventListener('message', this._handleMessage);
    // @ts-ignore
    this._ws.addEventListener('error', this._handleError);
  }

  private _removeVisibility() {
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  private _listenOnVisibility() {
    if (!this._options.reconnectOnVisibility) {
      return;
    }
    this._removeVisibility();
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  private _clearTimeouts() {
    clearTimeout(this._connectTimeout);
    clearTimeout(this._uptimeTimeout);
    this._removePong();
    this._removePing();
  }
}
