import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as msk from 'aws-cdk-lib/aws-msk';
import { Construct } from 'constructs';
import * as path from 'path';

interface LambdaStackProps extends cdk.StackProps {
  appName: string;
  vpc: ec2.IVpc;
  mskCluster: msk.CfnCluster;
  wsApiId: string;
  cacheTableName?: string;  // Optional: DynamoDB cache table name
  cacheTableArn?: string;   // Optional: DynamoDB cache table ARN
}

export class LambdaStack extends cdk.Stack {
  public readonly calculatorFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Lambda Security Group
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: `${props.appName}-lambda-sg`,
      description: 'Security group for Lambda calculator function',
      allowAllOutbound: true,
    });

    // Lambda function
    this.calculatorFunction = new lambda.Function(this, 'CalculatorFunction', {
      functionName: `${props.appName}-calculator`,
      runtime: lambda.Runtime.JAVA_17,
      handler: 'com.compoundcalc.lambda.CompoundInterestHandler::handleRequest',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda-calculator/target/compound-interest-lambda-1.0.0.jar')),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSg],
      environment: {
        AWS_REGION_OVERRIDE: cdk.Stack.of(this).region,
        ...(props.cacheTableName ? {
          CACHE_TABLE_NAME: props.cacheTableName,
          CACHE_TTL_SECONDS: '86400', // 24 hours
        } : {}),
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant MSK permissions
    this.calculatorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kafka-cluster:Connect',
        'kafka-cluster:DescribeGroup',
        'kafka-cluster:AlterGroup',
        'kafka-cluster:DescribeTopic',
        'kafka-cluster:ReadData',
        'kafka-cluster:DescribeClusterDynamicConfiguration',
        'kafka:DescribeCluster',
        'kafka:DescribeClusterV2',
        'kafka:GetBootstrapBrokers',
      ],
      resources: ['*'],
    }));

    // VPC/ENI permissions required for MSK event source mapping
    this.calculatorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeSubnets',
        'ec2:DescribeVpcs',
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
      ],
      resources: ['*'],
    }));

    // Grant DynamoDB cache permissions (if cache table is configured)
    if (props.cacheTableArn) {
      this.calculatorFunction.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
        ],
        resources: [props.cacheTableArn],
      }));
    }

    // Grant WebSocket Management API permissions (to push results back to clients)
    this.calculatorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${props.wsApiId}/*`,
      ],
    }));

    // MSK event source mapping (Amazon MSK handles VPC access automatically)
    const eventSource = new lambda.EventSourceMapping(this, 'MskEventSource', {
      target: this.calculatorFunction,
      batchSize: 10,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      eventSourceArn: props.mskCluster.attrArn,
    });

    // Add Kafka topic as a property via CfnEventSourceMapping
    const cfnMapping = eventSource.node.defaultChild as lambda.CfnEventSourceMapping;
    cfnMapping.addPropertyOverride('Topics', ['calculation-requests']);

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: this.calculatorFunction.functionArn,
      exportName: `${props.appName}-lambda-arn`,
    });
  }
}
