import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as msk from 'aws-cdk-lib/aws-msk';
import { Construct } from 'constructs';

interface KafkaStackProps extends cdk.StackProps {
  appName: string;
  vpc: ec2.IVpc;
}

export class KafkaStack extends cdk.Stack {
  public readonly mskCluster: msk.CfnCluster;
  public readonly mskSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: KafkaStackProps) {
    super(scope, id, props);

    // Security group for MSK
    this.mskSecurityGroup = new ec2.SecurityGroup(this, 'MskSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: `${props.appName}-msk-sg`,
      description: 'Security group for Amazon MSK cluster',
      allowAllOutbound: true,
    });

    // Allow Kafka traffic within VPC
    this.mskSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcpRange(9092, 9098),
      'Allow Kafka traffic from VPC'
    );

    this.mskSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(2181),
      'Allow ZooKeeper traffic from VPC'
    );

    // Get private subnet IDs
    const privateSubnets = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    });

    // MSK Cluster
    this.mskCluster = new msk.CfnCluster(this, 'MskCluster', {
      clusterName: `${props.appName}-kafka`,
      kafkaVersion: '3.5.1',
      numberOfBrokerNodes: 3,
      brokerNodeGroupInfo: {
        instanceType: 'kafka.m5.large',
        clientSubnets: privateSubnets.subnetIds,
        securityGroups: [this.mskSecurityGroup.securityGroupId],
        storageInfo: {
          ebsStorageInfo: {
            volumeSize: 100,
          },
        },
      },
      encryptionInfo: {
        encryptionInTransit: {
          clientBroker: 'TLS_PLAINTEXT',
          inCluster: true,
        },
      },
      enhancedMonitoring: 'PER_TOPIC_PER_BROKER',
      clientAuthentication: {
        unauthenticated: {
          enabled: true,
        },
      },
    });

    new cdk.CfnOutput(this, 'MskClusterArn', {
      value: this.mskCluster.attrArn,
      exportName: `${props.appName}-msk-cluster-arn`,
    });

    new cdk.CfnOutput(this, 'MskSecurityGroupId', {
      value: this.mskSecurityGroup.securityGroupId,
      exportName: `${props.appName}-msk-sg-id`,
    });
  }
}
