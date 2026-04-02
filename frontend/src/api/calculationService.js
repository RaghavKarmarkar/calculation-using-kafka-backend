const WS_URL = import.meta.env.VITE_WS_URL || '';
const CACHE_PREFIX = 'compoundcalc_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let socket = null;
let onResultCallback = null;
let onErrorCallback = null;
let onConnectCallback = null;
let connectPromise = null;

// --- Client-side localStorage cache ---

function cacheKey(params) {
  return `${CACHE_PREFIX}${params.principal}_${params.annualRate}_${params.years}_${params.compoundingFrequency}`;
}

export function getCachedResult(params) {
  try {
    const key = cacheKey(params);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    console.log('Cache HIT (localStorage):', key);
    return cached.result;
  } catch {
    return null;
  }
}

function cacheResult(params, result) {
  try {
    const key = cacheKey(params);
    localStorage.setItem(key, JSON.stringify({ result, cachedAt: Date.now() }));
    console.log('Cache PUT (localStorage):', key);
  } catch {
    // localStorage full or unavailable — ignore
  }
}

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
          // Cache the result for future identical calculations
          if (data.principal != null && data.annualRate != null) {
            cacheResult({
              principal: data.principal,
              annualRate: data.annualRate,
              years: data.years,
              compoundingFrequency: data.compoundingFrequency,
            }, data);
          }
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
