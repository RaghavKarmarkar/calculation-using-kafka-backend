#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { KafkaStack } from '../lib/kafka-stack';
import { BackendStack } from '../lib/backend-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
};

const appName = app.node.tryGetContext('appName') || 'compound-calc';

// 1. Network (VPC)
const networkStack = new NetworkStack(app, `${appName}-network`, {
  env,
  appName,
});

// 2. Amazon MSK (Kafka)
const kafkaStack = new KafkaStack(app, `${appName}-kafka`, {
  env,
  appName,
  vpc: networkStack.vpc,
});
kafkaStack.addDependency(networkStack);

// 3. Backend API (WebSocket API Gateway + Lambda)
const backendStack = new BackendStack(app, `${appName}-backend`, {
  env,
  appName,
  vpc: networkStack.vpc,
  mskCluster: kafkaStack.mskCluster,
});
backendStack.addDependency(kafkaStack);

// 4. Lambda Calculator (MSK consumer → pushes results via WebSocket)
const lambdaStack = new LambdaStack(app, `${appName}-lambda`, {
  env,
  appName,
  vpc: networkStack.vpc,
  mskCluster: kafkaStack.mskCluster,
  wsApiId: backendStack.wsApiId,
});
lambdaStack.addDependency(kafkaStack);
lambdaStack.addDependency(backendStack);

// 5. Frontend (S3 + CloudFront)
const frontendStack = new FrontendStack(app, `${appName}-frontend`, {
  env,
  appName,
  wsUrl: backendStack.wsUrl,
});
frontendStack.addDependency(backendStack);

app.synth();
