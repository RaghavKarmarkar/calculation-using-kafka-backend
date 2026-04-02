import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

interface DatabaseStackProps extends cdk.StackProps {
  appName: string;
}

export class DatabaseStack extends cdk.Stack {
  public readonly calculationsTable: dynamodb.ITable;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.calculationsTable = new dynamodb.Table(this, 'CalculationsTable', {
      tableName: 'CompoundInterestCalculations',
      partitionKey: {
        name: 'calculationId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      timeToLiveAttribute: 'ttl',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.calculationsTable.tableName,
      exportName: `${props.appName}-table-name`,
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.calculationsTable.tableArn,
      exportName: `${props.appName}-table-arn`,
    });
  }
}
