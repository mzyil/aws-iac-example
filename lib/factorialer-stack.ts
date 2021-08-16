import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as path from 'path';

export class FactorialerStack extends cdk.Stack {
    static ASSET_PATH: string = path.join(__dirname, "..", "assets", 'factorialer');

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const AppVPC = new ec2.Vpc(this, props?.stackName + "-AppVPC");

        const AppCluster = new ecs.Cluster(this, props?.stackName + "-AppCluster", {
            vpc: AppVPC,
            capacity: {
                // free tier requirement
                instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO)
            }
        });

        const AppService = new ecsPatterns.ApplicationLoadBalancedEc2Service(this, props?.stackName + "-FactorialerService", {
            cluster: AppCluster,
            listenerPort: 80,
            memoryLimitMiB: 384,
            publicLoadBalancer: true,
            taskImageOptions: {
                image: ecs.ContainerImage.fromAsset(FactorialerStack.ASSET_PATH),
                environment: {
                    SERVER_PORT: "80"
                }
            }
        });
    }
}