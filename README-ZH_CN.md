# Live Ws

一个能够在连接关闭时自动重新连接的 WebSocket。

## 功能特点

- 与 WebSocket API 的兼容（相同的接口，支持 Level0 和 Level2 事件模型）
- 完全可配置
- 无依赖（不依赖 Window、DOM 或任何 EventEmitter 库）
- 处理连接超时
- 支持在重新连接之间更改服务器 URL
- 消息缓冲。在连接打开时会发送累积的消息
- 提供多种构建版本（参考 dist 文件夹）
- 支持自定义心跳机制
- 页面隐藏处理
- 调试模式

## 安装

```bash
npm install --save live-ws
```

## 使用方法

### 与浏览器的 WebSocket API 兼容

因此，你可以参考以下文档使用：
[MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)。

如果你发现任何问题，请联系我。或者更好的是，为你的用例编写测试并提交一个 pull request :)

### 简单示例

```javascript
import LiveWs from 'live-ws';

const rws = new LiveWs('ws://my.site.com');

rws.addEventListener('open', () => {
  rws.send('hello!');
});
```

### 更新 URL

`url` 参数会在连接前被解析，支持以下几种类型：

- `string`
- `() => string`
- `() => Promise<string>`

#### 轮询 URL 提供者示例

```javascript
import LiveWs from 'live-ws';

const urls = ['ws://my.site.com', 'ws://your.site.com', 'ws://their.site.com'];
let urlIndex = 0;

// 轮询 URL 提供者
const urlProvider = () => urls[urlIndex++ % urls.length];

const rws = new LiveWs(urlProvider);
```

#### 异步 URL 提供者示例

```javascript
import LiveWs from 'live-ws';

// 异步 URL 提供者
const urlProvider = async () => {
  const token = await getSessionToken();
  return `wss://my.site.com/${token}`;
};

const rws = new LiveWs(urlProvider);
```

### 配置项

#### 自定义配置示例

```javascript
import LiveWs from 'live-ws';
import WS from 'ws';

const options = {
  WebSocket: WS, // 自定义 WebSocket 构造函数
  connectionTimeout: 1000,
  maxRetries: 10,
};
const rws = new LiveWs('ws://my.site.com', [], options);
```

#### 带心跳机制的示例

```javascript
import LiveWs from 'live-ws';

const options = {
  connectionTimeout: 1000,
  maxRetries: 10,
  // 每 10 秒发送一个心跳
  heartbeatInterval: 10000,
  // 服务器响应 pong 超时时间为 2 秒
  pongTimeoutInterval: 2000,
  // 自定义 ping 参数
  resolvePing() {
    return { event: 'ping' };
  },
  // 自定义重连发送的消息参数
  resolveSendMessages() {
    return [JSON.stringify({ channel: 'xxx', params: 'xxx' })]
  }
};
const rws = new LiveWs('ws://my.site.com', [], options);

rws.onmessage = (res) => {
  const data = JSON.parse(res.data);
  // 确定服务器如何响应 pong 消息
  if (data.event === 'pong') {
    rws.heartbeatHealth();
  }
};
```

#### 页面隐藏处理的示例

```javascript
import LiveWs from 'live-ws';

const options = {
  connectionTimeout: 1000,
  maxRetries: 10,
  // 是否在页面隐藏时自动断开连接
  reconnectOnVisibility: true,
  // 页面隐藏后 WebSocket 断开时间
  pageHiddenCloseTime: 5 * 60 * 1000,
  // 自定义重连发送的消息参数
  resolveSendMessages() {
    return [JSON.stringify({ channel: 'xxx', params: 'xxx' })]
  }
};
const rws = new LiveWs('ws://my.site.com', [], options);
```

#### 可用配置项

```typescript
type Options = {
  WebSocket?: any; // WebSocket 构造函数，默认使用全局 WebSocket
  maxReconnectionDelay?: number; // 重连之间的最大延迟时间（毫秒）
  minReconnectionDelay?: number; // 重连之间的最小延迟时间（毫秒）
  reconnectionDelayGrowFactor?: number; // 重连延迟增长因子
  minUptime?: number; // 稳定连接所需的最短时间（毫秒）
  connectionTimeout?: number; // 如果超过此时间未连接，则重试连接（毫秒）
  maxRetries?: number; // 最大重试次数
  maxEnqueuedMessages?: number; // 重连时最多缓存的消息数量
  startClosed?: boolean; // 以 CLOSED 状态启动 WebSocket，需调用 `.reconnect()` 连接
  debug?: boolean; // 是否启用调试输出
  // 心跳间隔时间
  heartbeatInterval?: number,
  // 服务器响应 pong 消息的超时时间
  pongTimeoutInterval?: number,
  // 自定义 ping 参数
  resolvePing?(): Record<string, any>;
  // 自定义重连发送的消息参数
  resolveSendMessages?(): any[];
  // 是否在页面隐藏时自动断开连接
  reconnectOnVisibility?: boolean;
  // 页面隐藏后 WebSocket 断开时间
  pageHiddenCloseTime?: number;
};
```

#### 默认值

```javascript
WebSocket: undefined,
maxReconnectionDelay: 10000,
minReconnectionDelay: 1000 + Math.random() * 4000,
reconnectionDelayGrowFactor: 1.3,
minUptime: 5000,
connectionTimeout: 4000,
maxRetries: Infinity,
maxEnqueuedMessages: Infinity,
startClosed: false,
debug: false,
reconnectOnVisibility: true,
pageHiddenCloseTime: 5 * 60 * 1000,
```

## API 文档

### 方法

```typescript
constructor(url: UrlProvider, protocols?: string | string[], options?: Options)

close(code?: number, reason?: string)
reconnect(code?: number, reason?: string)

send(data: string | ArrayBuffer | Blob | ArrayBufferView)

heartbeatHealth()

addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: EventListener)
removeEventListener(type:  'open' | 'close' | 'message' | 'error', listener: EventListener)
```

### 属性

[更多信息](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

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

### 常量

```text
CONNECTING 0 连接尚未打开
OPEN       1 连接已打开并准备好通信
CLOSING    2 连接正在关闭过程中
CLOSED     3 连接已关闭或无法打开
```

## 致谢

项目基于 [reconnecting-websocket](https://github.com/pladaria/reconnecting-websocket) 开发，向其出色的工作致敬。

如果你觉得这个项目有用，不妨看看原始库并支持其创造者。

## 许可证

MIT License