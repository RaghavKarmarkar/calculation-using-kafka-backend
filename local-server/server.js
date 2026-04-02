/**
 * Local WebSocket + Kafka server for testing the CompoundCalc frontend
 * without deploying to AWS.
 *
 * Mimics the AWS architecture locally:
 *   Frontend → WebSocket (this server) → Kafka → Consumer (this server) → WebSocket push
 *
 * Usage:
 *   1. Start Kafka: docker compose -f docker-compose.local.yml up -d
 *   2. npm install && npm start
 *   3. Frontend connects to ws://localhost:8080
 */

const { WebSocketServer } = require('ws');
const { Kafka } = require('kafkajs');

const WS_PORT = parseInt(process.env.WS_PORT || '8080');
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'calculation-requests';

// --- Kafka Setup ---
const kafka = new Kafka({
  clientId: 'compound-calc-local',
  brokers: [KAFKA_BROKER],
  retry: { retries: 5, initialRetryTime: 1000 },
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'compound-calc-local-consumer' });

// Track WebSocket connections by connectionId
const connections = new Map();
let connectionCounter = 0;

// --- Compound Interest Formula ---
function calculateCompoundInterest(principal, annualRate, years, compoundingFrequency) {
  const r = annualRate / 100.0;
  const base = 1.0 + r / compoundingFrequency;
  const exponent = compoundingFrequency * years;
  return Math.round(principal * Math.pow(base, exponent) * 100.0) / 100.0;
}

// --- Kafka Consumer (mimics Calculator Lambda) ---
async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        console.log(`[Consumer] Processing: ${event.calculationId}`);

        const finalAmount = calculateCompoundInterest(
          event.principal, event.annualRate, event.years, event.compoundingFrequency
        );

        const result = {
          calculationId: event.calculationId,
          status: 'COMPLETED',
          principal: event.principal,
          annualRate: event.annualRate,
          years: event.years,
          compoundingFrequency: event.compoundingFrequency,
          finalAmount,
          completedAt: Date.now(),
        };

        // Push result back via WebSocket (mimics PostToConnection)
        const ws = connections.get(event.connectionId);
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify(result));
          console.log(`[Consumer] Pushed result to connection ${event.connectionId}: $${finalAmount}`);
        } else {
          console.warn(`[Consumer] Connection ${event.connectionId} not found or closed`);
        }
      } catch (err) {
        console.error('[Consumer] Error processing message:', err.message);
      }
    },
  });

  console.log(`[Consumer] Listening on topic: ${KAFKA_TOPIC}`);
}

// --- WebSocket Server (mimics API Gateway WebSocket API) ---
async function startServer() {
  await producer.connect();
  console.log('[Kafka] Producer connected');

  await startConsumer();

  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`[WebSocket] Server listening on ws://localhost:${WS_PORT}`);

  wss.on('connection', (ws) => {
    const connectionId = `local-${++connectionCounter}`;
    connections.set(connectionId, ws);
    console.log(`[WebSocket] Client connected: ${connectionId}`);

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        console.log(`[WebSocket] Received from ${connectionId}:`, data);

        if (data.action === 'calculate') {
          const { principal, annualRate, years, compoundingFrequency } = data;

          // Validate
          if (!principal || principal <= 0) {
            ws.send(JSON.stringify({ statusCode: 400, body: '{"error":"principal must be > 0"}' }));
            return;
          }

          const calculationId = `calc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          // Publish to Kafka (mimics API Lambda)
          const kafkaEvent = {
            calculationId,
            principal,
            annualRate,
            years,
            compoundingFrequency,
            connectionId,
            createdAt: Date.now(),
          };

          await producer.send({
            topic: KAFKA_TOPIC,
            messages: [{ key: calculationId, value: JSON.stringify(kafkaEvent) }],
          });

          console.log(`[Kafka] Published event: ${calculationId}`);

          // Acknowledge (mimics API Lambda response — frontend sees this as PENDING)
          ws.send(JSON.stringify({ statusCode: 200, body: JSON.stringify({ calculationId, status: 'PENDING' }) }));
        } else {
          console.log(`[WebSocket] Unknown action: ${data.action}`);
        }
      } catch (err) {
        console.error('[WebSocket] Error handling message:', err.message);
        ws.send(JSON.stringify({ statusCode: 500, body: JSON.stringify({ error: err.message }) }));
      }
    });

    ws.on('close', () => {
      connections.delete(connectionId);
      console.log(`[WebSocket] Client disconnected: ${connectionId}`);
    });
  });
}

// --- Graceful Shutdown ---
async function shutdown() {
  console.log('\nShutting down...');
  await consumer.disconnect();
  await producer.disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start ---
startServer().catch((err) => {
  console.error('Failed to start:', err.message);
  console.log('\nMake sure Kafka is running: docker compose -f docker-compose.local.yml up -d');
  process.exit(1);
});
