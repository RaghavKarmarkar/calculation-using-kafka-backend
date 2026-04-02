# Request-to-Response Flow: Compound Interest Calculator

## Step-by-Step Walkthrough

### 1. User Opens the App
- Browser loads the React SPA from **CloudFront** (backed by S3).
- On mount, the frontend opens a **WebSocket connection** to `wss://<api-id>.execute-api.us-east-1.amazonaws.com/prod`.

### 2. WebSocket `$connect`
- API Gateway receives the upgrade request and invokes the **API Lambda** with `routeKey: "$connect"`.
- The Lambda logs the connection and returns `{ statusCode: 200 }`.
- API Gateway completes the WebSocket handshake; the client is now connected.
- The frontend stores the `connectionId` implicitly (managed by API Gateway).

### 3. User Submits a Calculation
- The user fills in **principal**, **annualRate**, **years**, and **compoundingFrequency** in the form and clicks "Calculate".
- The frontend sends a WebSocket message:
  ```json
  {
    "action": "calculate",
    "principal": 10000,
    "annualRate": 5.5,
    "years": 10,
    "compoundingFrequency": 12
  }
  ```

### 4. API Lambda Processes the `calculate` Route
- API Gateway matches `action: "calculate"` to the `calculate` route and invokes the **API Lambda**.
- The Lambda:
  1. Extracts `connectionId` and `domainName`/`stage` from `requestContext`.
  2. Parses and validates the request body.
  3. Generates a unique `calculationId` (UUID).
  4. Builds the `wsCallbackUrl` = `https://<domainName>/<stage>`.
  5. Constructs a Kafka event containing all calculation inputs + `connectionId` + `wsCallbackUrl`.
  6. **Publishes the event to Kafka** topic `calculation-requests` via the Kafka producer.
  7. Returns `{ statusCode: 200, body: { calculationId, status: "PENDING" } }`.

### 5. Kafka Delivers the Message
- Amazon **MSK** (Managed Streaming for Apache Kafka) receives the message on topic `calculation-requests`.
- The MSK event source mapping triggers the **Calculator Lambda** with a batch of records.

### 6. Calculator Lambda Computes the Result
- The Lambda:
  1. Deserializes each Kafka record into a `CalculationEvent`.
  2. Extracts `principal`, `annualRate`, `years`, `compoundingFrequency`.
  3. Applies the compound interest formula: **A = P × (1 + r/n)^(n×t)**.
  4. Builds a result payload:
     ```json
     {
       "calculationId": "uuid",
       "status": "COMPLETED",
       "principal": 10000.0,
       "annualRate": 5.5,
       "years": 10,
       "compoundingFrequency": 12,
       "finalAmount": 17310.76,
       "completedAt": 1774922369682
     }
     ```

### 7. Calculator Lambda Pushes Result via WebSocket
- Using the `connectionId` and `wsCallbackUrl` from the Kafka event, the Lambda:
  1. Creates an **API Gateway Management API** client pointing at the callback URL.
  2. Calls `postToConnection(connectionId, resultPayload)`.
  3. The result is pushed directly to the user's browser over the open WebSocket.

### 8. Frontend Displays the Result
- The frontend's `onmessage` handler receives the JSON payload.
- It parses the message, detects `status: "COMPLETED"`.
- Merges the server result with the original form data (via `useRef`).
- Renders the `ResultDisplay` component showing:
  - Input parameters (principal, rate, years, frequency)
  - Final amount
  - Growth chart and year-by-year breakdown

### 9. WebSocket `$disconnect`
- When the user closes the browser tab (or the connection times out), API Gateway sends a `$disconnect` event to the API Lambda.
- The Lambda logs the disconnection and returns `{ statusCode: 200 }`.

---

## Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant Browser as React Frontend<br/>(CloudFront + S3)
    participant APIGW as API Gateway<br/>(WebSocket)
    participant APILambda as API Lambda<br/>(Java 17)
    participant Kafka as Amazon MSK<br/>(Kafka)
    participant CalcLambda as Calculator Lambda<br/>(Java 17)

    Note over User, Browser: 1. Page Load
    User->>Browser: Opens app URL
    Browser->>Browser: Load SPA from CloudFront/S3

    Note over Browser, APIGW: 2. WebSocket Handshake
    Browser->>APIGW: WebSocket UPGRADE wss://...
    APIGW->>APILambda: Invoke ($connect, connectionId=C1)
    APILambda-->>APIGW: { statusCode: 200 }
    APIGW-->>Browser: 101 Switching Protocols ✓

    Note over User, CalcLambda: 3. Calculation Request
    User->>Browser: Fill form & click "Calculate"
    Browser->>APIGW: WS message: { action: "calculate",<br/>principal, annualRate, years, freq }
    APIGW->>APILambda: Invoke (routeKey="calculate",<br/>connectionId=C1)

    Note over APILambda: 4. Validate & Publish
    APILambda->>APILambda: Validate inputs<br/>Generate calculationId<br/>Build wsCallbackUrl
    APILambda->>Kafka: Produce message to<br/>"calculation-requests" topic<br/>(inputs + connectionId + wsCallbackUrl)
    Kafka-->>APILambda: ACK (partition, offset)
    APILambda-->>APIGW: { statusCode: 200,<br/>body: { calculationId, status: PENDING } }

    Note over Kafka, CalcLambda: 5. Async Processing
    Kafka->>CalcLambda: MSK Event Source trigger<br/>(batch of records)

    Note over CalcLambda: 6. Compute
    CalcLambda->>CalcLambda: Deserialize CalculationEvent<br/>A = P × (1 + r/n)^(n×t)<br/>Build result payload

    Note over CalcLambda, Browser: 7. Push Result via WebSocket
    CalcLambda->>APIGW: PostToConnection(C1, result)<br/>via Management API
    APIGW->>Browser: WS message: { status: COMPLETED,<br/>calculationId, finalAmount, ... }

    Note over Browser, User: 8. Display Result
    Browser->>Browser: Parse message<br/>Merge with form data<br/>Render ResultDisplay
    Browser->>User: Show final amount,<br/>growth chart, breakdown

    Note over Browser, APIGW: 9. Disconnect (on tab close)
    Browser->>APIGW: WebSocket CLOSE
    APIGW->>APILambda: Invoke ($disconnect, connectionId=C1)
    APILambda-->>APIGW: { statusCode: 200 }
```

---

## Component Summary

| Component | Technology | Role |
|-----------|-----------|------|
| **Frontend** | React + Vite + TailwindCSS | SPA served from CloudFront/S3; WebSocket client |
| **API Gateway** | AWS WebSocket API | Routes `$connect`, `$disconnect`, `calculate`; manages connections |
| **API Lambda** | Java 17, Kafka Producer | Validates input, publishes to Kafka with WS callback info |
| **Amazon MSK** | Apache Kafka 3.5.1 | Decouples request ingestion from computation |
| **Calculator Lambda** | Java 17, MSK Consumer | Computes compound interest, pushes result via WS Management API |
| **CloudFront + S3** | AWS CDN + Object Storage | Serves static frontend assets globally |

## Key Design Decisions

- **Kafka as decoupler**: The API Lambda returns immediately after publishing, keeping WebSocket response times fast. The heavy computation happens asynchronously.
- **WebSocket push (not polling)**: The Calculator Lambda pushes results directly to the client's open connection — no polling, no DynamoDB, no wasted API calls.
- **Stateless Lambdas**: No shared state between Lambdas. The `connectionId` and `wsCallbackUrl` travel through Kafka so the Calculator Lambda knows where to send results.
