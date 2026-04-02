# Architecture Evolution: DynamoDB Polling to WebSocket Push

## Table of Contents

- [Overview](#overview)
- [Before: REST + DynamoDB Polling](#before-rest--dynamodb-polling)
- [After: WebSocket Push](#after-websocket-push)
- [Drawbacks of the DynamoDB Polling Architecture](#drawbacks-of-the-dynamodb-polling-architecture)
- [Improvements in the WebSocket Architecture](#improvements-in-the-websocket-architecture)
- [Side-by-Side Comparison](#side-by-side-comparison)
- [Cost Impact](#cost-impact)

---

## Overview

The CompoundCalc application underwent a significant architectural migration — replacing **REST API + DynamoDB polling** with a **WebSocket API + direct push** model. This document details both architectures, highlights the drawbacks of the original approach, and explains the improvements delivered by the new design.

---

## Before: REST + DynamoDB Polling

### Architecture Diagram

```
 ┌──────────┐    ┌────────────┐    ┌──────────────────┐    ┌───────────┐    ┌────────────────┐
 │  React   │───▶│ CloudFront │───▶│  API Gateway     │───▶│ Amazon    │───▶│  AWS Lambda     │
 │  (Vite)  │    │  + S3      │    │  (HTTP API)      │    │ MSK       │    │  (Calculator)   │
 └──────────┘    └────────────┘    │  + Lambda API    │    │ (Kafka)   │    └───────┬─────────┘
      ▲                            └────────┬─────────┘    └───────────┘            │
      │                                     │                                       │
      │          ┌──────────────────────────────────────────────────────┐            │
      │          │                    DynamoDB                         │            │
      │          │           CompoundInterestCalculations              │            │
      │          └──────────────────────────────────────────────────────┘            │
      │                        │                                  ▲                 │
      │                        │ GET (poll)                       │ PUT (result)    │
      │                        ▼                                  │                 │
      └───── poll every 1s ────┘                                  └─────────────────┘
```

### Request Flow

1. **User submits** calculation parameters via the React frontend.
2. **Frontend** sends a `POST /api/calculations` request through CloudFront to the API Lambda.
3. **API Lambda** writes a `PENDING` record to DynamoDB and publishes a `CalculationEvent` to Kafka (MSK).
4. **API Lambda** returns a `202 Accepted` with the `calculationId` to the frontend.
5. **Calculator Lambda** (MSK consumer) picks up the event, computes the result, and **writes the result back to DynamoDB** with status `COMPLETED`.
6. **Frontend polls** `GET /api/calculations/{id}` every 1 second until the status changes from `PENDING` to `COMPLETED` or `FAILED`.
7. **API Lambda** reads from DynamoDB on each poll request and returns the current state.

### AWS Services Used

| Service | Role |
|---|---|
| API Gateway (HTTP API) | REST endpoint for POST/GET |
| AWS Lambda (API) | Handles HTTP requests, reads/writes DynamoDB, publishes to Kafka |
| Amazon MSK | Kafka event streaming |
| AWS Lambda (Calculator) | Consumes Kafka events, computes results, writes to DynamoDB |
| DynamoDB | Persistent store for calculation requests and results |
| CloudFront + S3 | Frontend hosting with `/api/*` proxy to API Gateway |

---

## After: WebSocket Push

### Architecture Diagram

```
 ┌──────────┐    ┌────────────┐
 │  React   │───▶│ CloudFront │    (static assets only)
 │  (Vite)  │    │  + S3      │
 └────┬─────┘    └────────────┘
      │
      │  WebSocket (wss://)
      │
      ▼
 ┌──────────────────┐    ┌───────────┐    ┌────────────────┐
 │  API Gateway     │───▶│ Amazon    │───▶│  AWS Lambda     │
 │  (WebSocket API) │    │ MSK       │    │  (Calculator)   │
 │  + Lambda API    │    │ (Kafka)   │    └───────┬─────────┘
 └──────────────────┘    └───────────┘            │
      ▲                                           │
      │       WebSocket push (PostToConnection)   │
      └───────────────────────────────────────────┘
```

### Request Flow

1. **User opens** the app — frontend establishes a **persistent WebSocket connection** to the WebSocket API Gateway.
2. **User submits** calculation parameters — frontend sends a JSON message over WebSocket with `action: "calculate"`.
3. **API Lambda** receives the WebSocket event, extracts `connectionId` and `wsCallbackUrl` from the request context, and publishes a `CalculationEvent` to Kafka — including the connection metadata.
4. **Calculator Lambda** (MSK consumer) picks up the event, computes the result, and **pushes the result directly to the client** via the API Gateway Management API (`PostToConnection`).
5. **Frontend receives** the result instantly as a WebSocket message. No polling needed.

### AWS Services Used

| Service | Role |
|---|---|
| API Gateway (WebSocket API) | Persistent bidirectional connection ($connect, $disconnect, calculate routes) |
| AWS Lambda (API) | Handles WebSocket events, publishes to Kafka with connection metadata |
| Amazon MSK | Kafka event streaming |
| AWS Lambda (Calculator) | Consumes Kafka events, computes results, pushes via WebSocket Management API |
| CloudFront + S3 | Frontend hosting (static assets only, no API proxy) |

---

## Drawbacks of the DynamoDB Polling Architecture

### 1. Wasteful Polling

The frontend polled `GET /api/calculations/{id}` every 1 second. For each calculation:
- **Minimum 2-3 requests** before the result was ready (typically 2-5 seconds of processing).
- Each poll invoked the API Lambda, which performed a DynamoDB `GetItem`.
- **At scale**: 10,000 concurrent users = 10,000–30,000 unnecessary Lambda invocations and DynamoDB reads per batch of calculations.

### 2. Increased Latency

The user experienced a **perceived delay** equal to the polling interval. Even if the Calculator Lambda completed in 200ms, the frontend would not discover the result until the next poll cycle (up to 1 second later). Reducing the interval would increase costs; increasing it would hurt UX.

### 3. DynamoDB as an Unnecessary Intermediary

DynamoDB served as a **message-passing bridge** between the Calculator Lambda and the frontend — a role it was not designed for:
- The Calculator wrote results to DynamoDB purely so the API Lambda could read them back on poll.
- The data was **transient** (read once after completion, then rarely accessed again), making DynamoDB's durable storage overkill.
- This added a full write + read cycle (with eventual consistency concerns) to the critical path.

### 4. Higher Operational Cost

Three cost dimensions were unnecessarily inflated:
- **DynamoDB**: Write Capacity Units (WCUs) for every PUT + Read Capacity Units (RCUs) for every poll GET. With PAY_PER_REQUEST pricing, costs scaled linearly with poll frequency.
- **Lambda (API)**: Every poll triggered a Lambda cold/warm invocation, even when the result wasn't ready yet.
- **API Gateway**: Every poll was an HTTP request billed by API Gateway.

### 5. CloudFront Proxy Complexity

The `/api/*` path was proxied through CloudFront to the HTTP API Gateway. This required:
- CloudFront additional behaviors with cache-disabled policies.
- Careful CORS and origin configuration.
- Added a hop in the request path, increasing latency.

### 6. No Real-Time Feedback

The architecture was fundamentally **request-response** with no server-initiated communication. If the Calculator Lambda encountered a transient failure and retried, the frontend had no way to receive progress updates — it could only see the final COMPLETED or FAILED state.

---

## Improvements in the WebSocket Architecture

### 1. Zero-Latency Result Delivery

Results arrive at the frontend **the instant** they are computed. The Calculator Lambda pushes the result via `PostToConnection` — there is no polling delay, no wasted requests, and the user sees the result as fast as the backend can produce it.

### 2. Eliminated DynamoDB Entirely

| Aspect | Before | After |
|---|---|---|
| Write path | Calculator Lambda → DynamoDB PUT | Calculator Lambda → WebSocket push |
| Read path | API Lambda → DynamoDB GET (per poll) | Not needed |
| Storage | DynamoDB table (provisioned/on-demand) | None |
| CDK stack | `DatabaseStack` (DynamoDB table) | Removed |

Removing DynamoDB eliminates:
- The `database-stack.ts` CDK stack entirely.
- DynamoDB SDK dependencies from both Lambda projects.
- IAM permissions for `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:UpdateItem`.
- The entire DynamoDB cost line item.

### 3. Drastically Reduced Lambda Invocations

| Scenario | Before (DynamoDB Polling) | After (WebSocket) |
|---|---|---|
| 1 calculation | 1 POST + 3-5 GET polls = **4-6 invocations** | 1 WebSocket message in = **1 invocation** |
| 10,000 calculations | **40,000-60,000** API Lambda invocations | **10,000** API Lambda invocations |

The Calculator Lambda invocation count stays the same (1 per Kafka event), but the API Lambda invocations drop by **75-85%**.

### 4. Simplified Frontend Architecture

| Aspect | Before | After |
|---|---|---|
| HTTP client | Axios with retry/poll logic | Native WebSocket API |
| State management | Poll timer, attempt counter, timeout handling | Event-driven callbacks |
| Connection indicator | Static "Live" badge | Real-time Connected/Disconnected status |
| Result delivery | Resolved after poll discovers COMPLETED | Instant push via `onmessage` |

The frontend code is simpler, more responsive, and provides genuine real-time UX.

### 5. Simpler CloudFront Configuration

CloudFront now serves **only static assets** (S3 origin). The `/api/*` proxy behavior, cache-disabled policy, and origin request forwarding are all removed. WebSocket connections go directly to the API Gateway endpoint — they cannot be proxied through CloudFront anyway, which makes the architecture cleaner and more honest about the data flow.

### 6. Foundation for Real-Time Features

The WebSocket connection is **persistent and bidirectional**. This opens the door for future enhancements:
- **Progress updates**: The Calculator Lambda could send intermediate progress (e.g., "Computing year 5 of 30...").
- **Server-initiated notifications**: Push alerts, rate changes, or batch completion notices.
- **Multi-result streaming**: Run multiple calculations in parallel and stream results as they complete.

---

## Side-by-Side Comparison

| Dimension | Before (DynamoDB + Polling) | After (WebSocket + Push) |
|---|---|---|
| **Result delivery** | Poll every 1s | Instant push |
| **Perceived latency** | 1-5 seconds (poll interval) | < 500ms (compute time only) |
| **Database** | DynamoDB (read + write per calc) | None |
| **API type** | HTTP API (REST) | WebSocket API |
| **CDK stacks** | 6 (incl. DatabaseStack) | 5 (no DatabaseStack) |
| **API Lambda invocations/calc** | 4-6 (1 POST + 3-5 polls) | 1 (WebSocket message) |
| **CloudFront config** | S3 origin + API proxy | S3 origin only |
| **Frontend complexity** | Axios + poll loop + timeout | WebSocket + callbacks |
| **Bidirectional comms** | No (client-initiated only) | Yes (server can push anytime) |
| **AWS services count** | 7 (incl. DynamoDB) | 6 |

---

## Cost Impact

### Costs Removed
- **DynamoDB**: $0 — table deleted, no WCU/RCU charges.
- **API Gateway (HTTP)**: $0 — replaced by WebSocket API.
- **Lambda (poll invocations)**: ~75-85% reduction in API Lambda invocations.

### Costs Changed
- **API Gateway (WebSocket)**: Charged per connection-minute ($0.25/million connection-minutes) + per message ($1.00/million messages). For short-lived calculator sessions, this is significantly cheaper than thousands of HTTP requests.

### Net Effect
For a workload of **10,000 calculations/day** with an average of 4 poll requests each:
- **Before**: ~40,000 HTTP API requests + ~40,000 API Lambda invocations + ~20,000 DynamoDB RCUs/WCUs
- **After**: ~10,000 WebSocket messages + ~10,000 API Lambda invocations + ~10,000 connection-minutes + $0 DynamoDB

**Estimated cost reduction: 60-70%** on the API + storage layer.

---

*Last updated: March 29, 2026*
