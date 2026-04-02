import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

interface CacheStackProps extends cdk.StackProps {
  appName: string;
}

/**
 * DynamoDB cache table for compound interest calculation results.
 * 
 * Designed for DR with Global Tables:
 * - Deploy this stack in the primary region
 * - Enable Global Tables replication to the DR region via:
 *     table.addGlobalReplicaTable({ region: 'us-west-2' })
 *   or via the AWS Console / CLI
 * 
 * TTL is enabled on the 'ttl' attribute for automatic cache expiry.
 */
export class CacheStack extends cdk.Stack {
  public readonly cacheTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props: CacheStackProps) {
    super(scope, id, props);

    // DynamoDB table for caching calculation results
    this.cacheTable = new dynamodb.TableV2(this, 'ResultCacheTable', {
      tableName: `${props.appName}-result-cache`,
      partitionKey: {
        name: 'cacheKey',
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,

      // To enable Global Tables for DR, uncomment and add your DR region:
      // replicas: [
      //   { region: 'us-west-2' },
      // ],
    });

    new cdk.CfnOutput(this, 'CacheTableName', {
      value: this.cacheTable.tableName,
      exportName: `${props.appName}-cache-table-name`,
    });

    new cdk.CfnOutput(this, 'CacheTableArn', {
      value: this.cacheTable.tableArn,
      exportName: `${props.appName}-cache-table-arn`,
    });
  }
}
