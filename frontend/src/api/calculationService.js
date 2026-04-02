const WS_URL = import.meta.env.VITE_WS_URL || '';

let socket = null;
let onResultCallback = null;
let onErrorCallback = null;
let onConnectCallback = null;
let connectPromise = null;

export function getWebSocketUrl() {
  return WS_URL;
}

export function connect(wsUrl) {
  const url = wsUrl || WS_URL;
  if (!url) {
    console.error('WebSocket URL not configured');
    return Promise.reject(new Error('WebSocket URL not configured'));
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return connectPromise;
  }

  connectPromise = new Promise((resolve, reject) => {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('WebSocket connected');
      if (onConnectCallback) onConnectCallback();
      resolve();
    };

    socket.onmessage = (event) => {
      try {
        let data = JSON.parse(event.data);
        console.log('WebSocket message:', data);

        // Handle wrapped response format { statusCode, body }
        if (data.body && typeof data.body === 'string') {
          try {
            data = JSON.parse(data.body);
          } catch (_) {
            // body is not JSON, use as-is
          }
        }

        if (data.status === 'COMPLETED' && onResultCallback) {
          onResultCallback(data);
        } else if (data.status === 'FAILED' && onErrorCallback) {
          onErrorCallback(new Error(data.errorMessage || 'Calculation failed'));
        } else if (data.status === 'PENDING') {
          console.log('Server acknowledged calculation:', data.calculationId);
        } else {
          console.log('Unhandled WebSocket message:', data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      reject(new Error('WebSocket connection failed'));
    };

    socket.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      socket = null;
    };
  });

  return connectPromise;
}

export function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function onResult(callback) {
  onResultCallback = callback;
}

export function onError(callback) {
  onErrorCallback = callback;
}

export function onConnect(callback) {
  onConnectCallback = callback;
}

export function sendCalculation(calculationRequest) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected');
  }

  const message = JSON.stringify({
    action: 'calculate',
    ...calculationRequest,
  });

  socket.send(message);
}

export function isConnected() {
  return socket && socket.readyState === WebSocket.OPEN;
}
