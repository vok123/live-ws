# Live Ws

号称永不断线，自动重连WebSocket，像舔狗一样，一定要重新连接上

## 更多文档

[中文文档](https://github.com/vok123/live-ws/blob/main/README-ZH_CN.md)

## 特性

- 兼容WebSocket API（相同的接口，Level0和Level2事件模型）
- 完全可配置
- 无依赖（不依赖Window、DOM或任何EventEmitter库）
- 处理连接超时
- 允许在重新连接之间更改服务器URL
- 缓冲功能。在连接建立后发送累积的消息
- 提供多种构建版本（见dist文件夹）
- 自定义心跳支持
- 页面隐藏处理
- 调试模式

## 安装

```bash
npm install --save live-ws
```

## 使用方法

### 兼容WebSocket浏览器API

因此以下文档应该有效：
[MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)。

如果您发现任何问题，请联系我。或者，更好的是，为您的情况编写测试并提交拉取请求 :)

### 简单使用

```javascript
import LiveWs from 'live-ws';

const liveWs = new LiveWs('ws://my.site.com');

liveWs.onopen = () => {
  liveWs.send('Hello');
};
```

### 更新URL

`url`参数将在连接前被解析，可能的类型：

- `string`
- `() => string`
- `() => Promise<string>`

```javascript
import LiveWs from 'live-ws';

const urls = ['ws://my.site.com', 'ws://your.site.com', 'ws://their.site.com'];
let urlIndex = 0;

// 轮询URL提供者
const urlProvider = () => urls[urlIndex++ % urls.length];

const liveWs = new LiveWs(urlProvider);
```

```javascript
import LiveWs from 'live-ws';

// 异步URL提供者
const urlProvider = async () => {
  const token = await getSessionToken();
  return `wss://my.site.com/${token}`;
};

const liveWs = new LiveWs(urlProvider);
```

### 选项

#### 自定义选项示例

```javascript
import LiveWs from 'live-ws';
import WS from 'ws';

const options = {
  WebSocket: WS, // 自定义WebSocket构造函数
  connectionTimeout: 1000,
  maxRetries: 10
};
const liveWs = new LiveWs('ws://my.site.com', [], options);
```

#### 心跳示例

```javascript
import LiveWs from 'live-ws';

const params = {
  channel: 'test'
};

const options = {
  connectionTimeout: 1000,
  maxRetries: 10,
  // 每10秒发送一次心跳
  heartbeatInterval: 10000,
  // 服务器响应pong超时2秒
  pongTimeoutInterval: 2000,
  // 自定义ping参数
  onBeforePing(liveWs) {
    return liveWs.send(JSON.stringify({ event: 'ping' }));
  },
  // 自定义重连时发送的参数
  onReconnect(liveWs) {
    return JSON.stringify(params);
  }
};
const liveWs = new LiveWs('ws://my.site.com', [], options);

liveWs.onmessage = (res) => {
  const data = JSON.parse(res.data);
  // 这里需要判断服务器如何响应pong
  if (data.event === 'pong') {
    liveWs.heartbeatHealth();
  }
};

liveWs.onopen = () => {
  liveWs.send(JSON.stringify(params));
};
```

#### 页面隐藏示例

```javascript
import LiveWs from 'live-ws';

const params = {
  channel: 'test'
};

const options = {
  connectionTimeout: 1000,
  maxRetries: 10,
  // 是否启用页面隐藏时自动断开连接
  reconnectOnVisibility: true,
  // 页面隐藏后Websocket断开连接的时间
  pageHiddenCloseTime: 5 * 60 * 1000,
  // 自定义重连时发送的参数
  onReconnect(liveWs) {
    return JSON.stringify(params);
  }
};
const liveWs = new LiveWs('ws://my.site.com', [], options);

liveWs.onopen = () => {
  liveWs.send(JSON.stringify(params));
};
```

#### 可用选项

```typescript
type Options = {
  /** 自定义WebSocket类 */
  WebSocket?: any;
  /** 重新连接尝试之间的最大延迟（毫秒）（默认：10000） */
  maxReconnectionDelay?: number;
  /** 重新连接尝试之间的最小延迟（毫秒）（默认：1000 + 随机数） */
  minReconnectionDelay?: number;
  /** 重新连接延迟随每次尝试增加的系数（默认：1.3） */
  reconnectionDelayGrowFactor?: number;
  /** 连接保持打开状态被认为稳定的最小时间（毫秒）（默认：5000） */
  minUptime?: number;
  /** 连接尝试的超时时间（毫秒）（默认：4000） */
  connectionTimeout?: number;
  /** 最大重新连接尝试次数（默认：Infinity） */
  maxRetries?: number;
  /** 等待连接时排队的最大消息数（默认：Infinity） */
  maxEnqueuedMessages?: number;
  /** 是否以关闭状态启动而不是立即连接（默认：false） */
  startClosed?: boolean;
  /** pong响应超时时间，超过该时间认为连接已死亡（毫秒）（默认：2000） */
  pongTimeoutInterval?: number;
  /** 心跳ping的间隔时间（毫秒）（默认：10000） */
  heartbeatInterval?: number;
  /** 启用详细调试日志（默认：false） */
  debug?: boolean;
  /** 页面变为可见时是否尝试重新连接（默认：true） */
  reconnectOnVisibility?: boolean;
  /** 页面隐藏后关闭连接的时间（毫秒）（默认：5分钟） */
  pageHiddenCloseTime?: number;
};
```

#### 默认值

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
CONNECTING 0 连接尚未打开。
OPEN       1 连接已打开并准备好通信。
CLOSING    2 连接正在关闭过程中。
CLOSED     3 连接已关闭或无法打开。
```

## 致谢

本项目基于[reconnecting-websocket](https://github.com/pladaria/reconnecting-websocket)及其出色的工作。

如果您发现本项目有用，请考虑查看原始仓库并向其创建者表示支持。

## 许可证

MIT