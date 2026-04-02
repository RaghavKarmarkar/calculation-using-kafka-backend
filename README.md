# CompoundCalc — Kafka-Powered Compound Interest Calculator

A full-stack, production-grade compound interest calculator built for millions of users. Uses **React** for the frontend, **Java Spring Boot** with **Apache Kafka** for the backend, **AWS Lambda** for serverless computation, and **AWS CDK** for infrastructure-as-code deployment.

## Architecture

```
┌─────────────┐     ┌───────────────┐     ┌─────────────────┐     ┌───────────────┐     ┌──────────────┐
│   React UI  │────▶│  CloudFront   │────▶│  Spring Boot    │────▶│  Amazon MSK   │────▶│  AWS Lambda  │
│  (Vite +    │     │  + S3         │     │  (ECS Fargate)  │     │  (Kafka)      │     │  (Java 17)   │
│  Tailwind)  │     │               │     │                 │     │               │     │              │
└─────────────┘     └───────────────┘     └────────┬────────┘     └───────────────┘     └──────┬───────┘
                                                   │                                           │
                                                   ▼                                           ▼
                                          ┌─────────────────┐                         ┌─────────────────┐
                                          │   DynamoDB      │◀────────────────────────│   DynamoDB      │
                                          │   (GET result)  │                         │   (PUT result)  │
                                          └─────────────────┘                         └─────────────────┘
```

### Flow

1. **User submits** calculation parameters (principal, rate, years, frequency) via the React frontend
2. **API Gateway / CloudFront** routes the request to the Spring Boot backend on ECS Fargate
3. **Spring Boot** saves a PENDING record to DynamoDB and publishes a `CalculationEvent` to Kafka
4. **AWS Lambda** (triggered by MSK event source mapping) consumes the Kafka message
5. **Lambda calculates** compound interest: `A = P × (1 + r/n)^(n×t)` and updates DynamoDB with the result
6. **Frontend polls** the GET endpoint until the status changes to `COMPLETED`

## Project Structure

```
├── frontend/               # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── api/            # Axios API service (submit, poll)
│   │   ├── components/     # CalculatorForm, ResultDisplay
│   │   └── App.jsx         # Main application
│   └── package.json
│
├── backend/                # Java 17 + Spring Boot 3.2
│   ├── src/main/java/com/compoundcalc/
│   │   ├── config/         # Kafka, DynamoDB, CORS configs
│   │   ├── controller/     # REST controller (/api/calculations)
│   │   ├── model/          # Request, Response, Event DTOs
│   │   └── service/        # Kafka producer, DynamoDB, business logic
│   ├── Dockerfile
│   └── pom.xml
│
├── lambda-calculator/      # Java 17 AWS Lambda
│   ├── src/main/java/com/compoundcalc/lambda/
│   │   ├── CompoundInterestHandler.java   # MSK Kafka consumer
│   │   └── CalculationEvent.java          # Event model
│   └── pom.xml
│
├── infra/                  # AWS CDK (TypeScript)
│   ├── bin/app.ts          # CDK app entry point
│   └── lib/
│       ├── network-stack.ts    # VPC
│       ├── database-stack.ts   # DynamoDB
│       ├── kafka-stack.ts      # Amazon MSK
│       ├── lambda-stack.ts     # Lambda + MSK trigger
│       ├── backend-stack.ts    # ECS Fargate + ALB
│       └── frontend-stack.ts   # S3 + CloudFront
│
├── docker-compose.local.yml   # Local Kafka + DynamoDB
├── deploy.sh                  # CLI deployment script
└── README.md
```

## Prerequisites

- **Node.js** 18+ and npm
- **Java** 17+ (JDK)
- **Maven** 3.9+
- **Docker** (for building images and local dev)
- **AWS CLI** v2 (configured with credentials)
- **AWS CDK** (`npm install -g aws-cdk`)

## Quick Start — Local Development

1. **Start local infrastructure** (Kafka + DynamoDB):
   ```bash
   docker compose -f docker-compose.local.yml up -d
   ```

2. **Run the Spring Boot backend**:
   ```bash
   cd backend
   mvn spring-boot:run -Dspring-boot.run.profiles=local
   ```

3. **Run the React frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Open **http://localhost:5173** in your browser.

Or use the deploy script shortcut:
```bash
chmod +x deploy.sh
./deploy.sh local
```

## Deploy to AWS

### One-command deployment:

```bash
chmod +x deploy.sh
./deploy.sh deploy
```

This will:
1. Build the Lambda JAR (`lambda-calculator/`)
2. Build the Spring Boot backend (`backend/`)
3. Build the React frontend (`frontend/`)
4. Install CDK dependencies (`infra/`)
5. Bootstrap CDK (first time)
6. Deploy all 6 CloudFormation stacks

### Environment variables:

| Variable     | Default          | Description                    |
|-------------|------------------|--------------------------------|
| `APP_NAME`  | `compound-calc`  | Prefix for all AWS resources   |
| `AWS_REGION`| `us-east-1`      | Target AWS region              |

### Manual step-by-step:

```bash
# 1. Build Lambda
cd lambda-calculator && mvn clean package -DskipTests

# 2. Build Backend
cd backend && mvn clean package -DskipTests

# 3. Build Frontend
cd frontend && npm ci && VITE_API_BASE_URL="/api" npm run build

# 4. Deploy infrastructure
cd infra && npm ci && npx cdk deploy --all --require-approval never
```

## Destroy Resources

```bash
./deploy.sh destroy
```

## API Endpoints

| Method | Path                          | Description                        |
|--------|-------------------------------|------------------------------------|
| POST   | `/api/calculations`           | Submit a new calculation request   |
| GET    | `/api/calculations/{id}`      | Get calculation result by ID       |
| GET    | `/api/calculations/health`    | Health check                       |

### POST /api/calculations

**Request:**
```json
{
  "principal": 10000.00,
  "annualRate": 5.5,
  "years": 10,
  "compoundingFrequency": 12
}
```

**Response (202 Accepted):**
```json
{
  "calculationId": "uuid",
  "status": "PENDING",
  "principal": 10000.00,
  "annualRate": 5.5,
  "years": 10,
  "compoundingFrequency": 12,
  "createdAt": 1711640000000
}
```

### GET /api/calculations/{id}

**Response (200 OK):**
```json
{
  "calculationId": "uuid",
  "status": "COMPLETED",
  "principal": 10000.00,
  "annualRate": 5.5,
  "years": 10,
  "compoundingFrequency": 12,
  "finalAmount": 17310.68,
  "createdAt": 1711640000000,
  "completedAt": 1711640001000
}
```

## AWS Services Used

| Service          | Purpose                                          |
|-----------------|--------------------------------------------------|
| **Amazon MSK**  | Managed Kafka for high-throughput event streaming |
| **AWS Lambda**  | Serverless compound interest calculation          |
| **DynamoDB**    | NoSQL storage for calculation requests & results  |
| **ECS Fargate** | Containerized Spring Boot backend                 |
| **ECR**         | Docker image registry for backend                 |
| **CloudFront**  | CDN for React frontend + API proxy                |
| **S3**          | Static hosting for React build                    |
| **VPC**         | Network isolation for MSK and ECS                 |
| **ALB**         | Load balancer for backend containers              |

## Scaling for Millions of Users

- **Kafka (MSK)**: Handles millions of events/sec with horizontal partitioning
- **Lambda**: Auto-scales to thousands of concurrent executions
- **DynamoDB**: PAY_PER_REQUEST mode scales automatically with no capacity planning
- **ECS Fargate**: Auto-scales 2–10 tasks based on CPU/memory utilization
- **CloudFront**: Global CDN with edge caching for static assets

## Compound Interest Formula

```
A = P × (1 + r/n)^(n × t)
```

| Variable | Description                       |
|----------|-----------------------------------|
| `A`      | Final amount                      |
| `P`      | Principal (initial investment)    |
| `r`      | Annual interest rate (decimal)    |
| `n`      | Compounding frequency per year    |
| `t`      | Time in years                     |
