import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as msk from 'aws-cdk-lib/aws-msk';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

interface BackendStackProps extends cdk.StackProps {
  appName: string;
  vpc: ec2.IVpc;
  mskCluster: msk.CfnCluster;
}

export class BackendStack extends cdk.Stack {
  public readonly wsUrl: string;
  public readonly wsApiId: string;
  public readonly wsStage: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Security Group for API Lambda
    const apiLambdaSg = new ec2.SecurityGroup(this, 'ApiLambdaSg', {
      vpc: props.vpc,
      securityGroupName: `${props.appName}-api-lambda-sg`,
      description: 'Security group for API Lambda function',
      allowAllOutbound: true,
    });

    // API Lambda function (handles WebSocket events)
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      functionName: `${props.appName}-api`,
      runtime: lambda.Runtime.JAVA_17,
      handler: 'com.compoundcalc.api.ApiHandler::handleRequest',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda-api/target/compound-interest-api-1.0.0.jar')),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [apiLambdaSg],
      environment: {
        MSK_CLUSTER_ARN: props.mskCluster.attrArn,
        KAFKA_TOPIC: 'calculation-requests',
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant MSK permissions
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kafka-cluster:Connect',
        'kafka-cluster:DescribeGroup',
        'kafka-cluster:AlterGroup',
        'kafka-cluster:DescribeTopic',
        'kafka-cluster:ReadData',
        'kafka-cluster:WriteData',
        'kafka-cluster:CreateTopic',
        'kafka:DescribeCluster',
        'kafka:DescribeClusterV2',
        'kafka:GetBootstrapBrokers',
      ],
      resources: ['*'],
    }));

    // WebSocket API Gateway
    const wsApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `${props.appName}-ws`,
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('ConnectIntegration', apiFunction),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DisconnectIntegration', apiFunction),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DefaultIntegration', apiFunction),
      },
    });

    // Add custom 'calculate' route
    wsApi.addRoute('calculate', {
      integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('CalculateIntegration', apiFunction),
    });

    // Deploy stage
    const wsStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: wsApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant the Calculator Lambda permission to post messages back via WebSocket
    // (The Calculator Lambda's role needs execute-api:ManageConnections)
    // We also need to grant the API Lambda manage-connections for potential future use
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/*`,
      ],
    }));

    this.wsUrl = wsStage.url;
    this.wsApiId = wsApi.apiId;
    this.wsStage = 'prod';

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: wsStage.url,
      exportName: `${props.appName}-ws-url`,
    });

    new cdk.CfnOutput(this, 'WebSocketCallbackUrl', {
      value: wsStage.callbackUrl,
      exportName: `${props.appName}-ws-callback-url`,
    });

    new cdk.CfnOutput(this, 'ApiFunctionArn', {
      value: apiFunction.functionArn,
      exportName: `${props.appName}-api-lambda-arn`,
    });
  }
}
