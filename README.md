# Live Ws

WebSocket that will automatically reconnect if the connection is closed.

## More docs

[中文文档](https://github.com/vok123/live-ws/blob/main/README-ZH_CN.md)

## Features

- WebSocket API compatible (same interface, Level0 and Level2 event model)
- Fully configurable
- Dependency free (does not depend on Window, DOM or any EventEmitter library)
- Handle connection timeouts
- Allows changing server URL between reconnections
- Buffering. Will send accumulated messages on open
- Multiple builds available (see dist folder)
- Custom heartbeat support
- Page hiding process
- Debug mode

## Install

```bash
npm install --save live-ws
```

## Usage

### Compatible with WebSocket Browser API

So this documentation should be valid:
[MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).

Ping me if you find any problems. Or, even better, write a test for your case and make a pull
request :)

### Simple usage

```javascript
import LiveWs from 'live-ws';

const liveWs = new LiveWs('ws://my.site.com');

liveWs.onopen = () => {
  liveWs.send('Hello');
};

```

### Update URL

The `url` parameter will be resolved before connecting, possible types:

- `string`
- `() => string`
- `() => Promise<string>`

```javascript
import LiveWs from 'live-ws';

const urls = ['ws://my.site.com', 'ws://your.site.com', 'ws://their.site.com'];
let urlIndex = 0;

// round robin url provider
const urlProvider = () => urls[urlIndex++ % urls.length];

const liveWs = new LiveWs(urlProvider);
```

```javascript
import LiveWs from 'live-ws';

// async url provider
const urlProvider = async () => {
  const token = await getSessionToken();
  return `wss://my.site.com/${token}`;
};

const liveWs = new LiveWs(urlProvider);
```

### Options

#### Sample with custom options

```javascript
import LiveWs from 'live-ws';
import WS from 'ws';

const options = {
  WebSocket: WS, // custom WebSocket constructor
  connectionTimeout: 1000,
  maxRetries: 10
};
const liveWs = new LiveWs('ws://my.site.com', [], options);
```

#### Sample with heartbeat

```javascript
import LiveWs from 'live-ws';

const params = {
  channel: 'test'
};

const options = {
  connectionTimeout: 1000,
  maxRetries: 10,
  // Send a heartbeat every 10 seconds
  heartbeatInterval: 10000,
  // Server response pong timeout 2 seconds
  pongTimeoutInterval: 2000,
  // Custom ping parameters
  onBeforePing(liveWs) {
    return liveWs.send(JSON.stringify({ event: 'ping' }));
  },
  // Customize reconnection send parameters
  onReconnect(liveWs) {
    return JSON.stringify(params);
  }
};
const liveWs = new LiveWs('ws://my.site.com', [], options);

liveWs.onmessage = (res) => {
  const data = JSON.parse(res.data);
  // Here we need to determine how the server responds to pong
  if (data.event === 'pong') {
    liveWs.heartbeatHealth();
  }
};

liveWs.onopen = () => {
  liveWs.send(JSON.stringify(params));
};

```

#### Sample with page hidden

```javascript
import LiveWs from 'live-ws';

const params = {
  channel: 'test'
};

const options = {
  connectionTimeout: 1000,
  maxRetries: 10,
  // Whether to enable automatic disconnection when the page is hidden
  reconnectOnVisibility: true,
  // Websocket disconnection time after hiding the page
  pageHiddenCloseTime: 5 * 60 * 1000,
  // Customize reconnection send parameters
  onReconnect(liveWs) {
    return JSON.stringify(params);
  }
};
const liveWs = new LiveWs('ws://my.site.com', [], options);

liveWs.onopen = () => {
  liveWs.send(JSON.stringify(params));
};

```

#### Available options

```typescript
type Options = {
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
```

#### Default values

```javascript
{
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
}
```

## API

### Methods

```typescript
constructor(url: UrlProvider, protocols?: string | string[], options?: Options)

close(code?: number, reason?: string)
reconnect(code?: number, reason?: string)

send(data: string | ArrayBuffer | Blob | ArrayBufferView)

heartbeatHealth()

addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: EventListener)
removeEventListener(type:  'open' | 'close' | 'message' | 'error', listener: EventListener)
```

### Attributes

[More info](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

```typescript
binaryType: string;
bufferedAmount: number;
extensions: string;
onclose: EventListener;
onerror: EventListener;
onmessage: EventListener;
onopen: EventListener;
protocol: string;
readyState: number;
url: string;
retryCount: number;
```

### Constants

```text
CONNECTING 0 The connection is not yet open.
OPEN       1 The connection is open and ready to communicate.
CLOSING    2 The connection is in the process of closing.
CLOSED     3 The connection is closed or couldn't be opened.
```

## Thanks

This project is based on
[reconnecting-websocket](https://github.com/pladaria/reconnecting-websocket) and its amazing work.

If you find this project useful, please consider checking out the original repository and showing
your support to its creators.

## License

MIT
