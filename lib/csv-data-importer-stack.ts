import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaEventSources from '@aws-cdk/aws-lambda-event-sources';
import * as rds from '@aws-cdk/aws-rds';
import * as s3 from '@aws-cdk/aws-s3';
import * as path from 'path';

export class CsvDataImporterStack extends cdk.Stack {
    static APP_NAME: string = "csv_data_importer";
    static ASSET_PATH: string = path.join(__dirname, "..", "assets", 'csv_data_importer');

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        
        // The VPC that is used by all of the resources
        const AppVPC = new ec2.Vpc(this, props?.stackName + "-AppVPC", {
            cidr: "172.31.0.0/16",
            enableDnsSupport: true,
            enableDnsHostnames: true,
            subnetConfiguration: [
                {
                    name: "isolated-subnet",
                    subnetType: ec2.SubnetType.ISOLATED
                }
            ]
        });

        // Resources
        const AppDB = new rds.DatabaseInstance(this, props?.stackName + "-AppDB", {
            engine: rds.DatabaseInstanceEngine.mariaDb({version: rds.MariaDbEngineVersion.VER_10_4_13}),
            // free tier requirement
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
            databaseName: CsvDataImporterStack.APP_NAME,
            credentials: rds.Credentials.fromGeneratedSecret("admin"),
            vpc: AppVPC,
            vpcSubnets: {
                subnetType: ec2.SubnetType.ISOLATED
            }
        });

        const LambdaRole = new iam.Role(this, props?.stackName + "-LambdaRole", {
            roleName: CsvDataImporterStack.APP_NAME + "-role",
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            maxSessionDuration: cdk.Duration.seconds(3600),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
                new iam.ManagedPolicy(this, props?.stackName + "-EC2NetworkPolicy", {
                    managedPolicyName: "EC2NetworkPolicy",
                    path: "/",
                    document: iam.PolicyDocument.fromJson(
                        {
                            "Version": "2012-10-17",
                            "Statement": [{
                            "Effect": "Allow",
                            "Action": [
                                "ec2:DescribeNetworkInterfaces",
                                "ec2:CreateNetworkInterface",
                                "ec2:DeleteNetworkInterface",
                                "ec2:DescribeInstances",
                                "ec2:AttachNetworkInterface"
                            ],
                            "Resource": "*"
                            }]
                        }
                    )
                })
            ]
        });

        const AppFunction = new lambda.Function(this, props?.stackName + "-AppFunction", {
            code: lambda.Code.fromAsset(
                CsvDataImporterStack.ASSET_PATH,
                {
                    bundling: {
                        user: "root",
                        image: lambda.Runtime.NODEJS_14_X.bundlingImage,
                        command: ['bash', '-c', 'npm run bundle']
                    }
                }
            ),
            description: "",
            environment: {
                DATABASE_SECRET_NAME: AppDB.secret?.secretName!
            },
            functionName: CsvDataImporterStack.APP_NAME,
            handler: "index.handler",
            memorySize: 512,
            role: LambdaRole,
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.seconds(300),
            vpc: AppVPC,
            vpcSubnets: {
                subnetType: ec2.SubnetType.ISOLATED
            }
        });

        const S3Bucket = new s3.Bucket(this, props?.stackName + "-S3Bucket", {
            bucketName: "mzyil-" + CsvDataImporterStack.APP_NAME.replace(/_/g, "-") + "-" + parseInt(Math.random() * 1000 as any),
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });


        // Interconnections
        AppVPC.addGatewayEndpoint("S3GatewayEndpoint", { service: ec2.GatewayVpcEndpointAwsService.S3 });
        AppVPC.addInterfaceEndpoint("SecretManagerEndpoint", { service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER });
        S3Bucket.grantRead(LambdaRole);
        AppFunction.addEventSource(new lambdaEventSources.S3EventSource(S3Bucket, {
            events: [s3.EventType.OBJECT_CREATED],
            filters: [{ suffix: ".csv" }]
        }));
        AppDB.secret?.grantRead(LambdaRole);
        AppDB.secret?.grantWrite(LambdaRole);
        AppDB.connections.allowFrom(AppFunction, ec2.Port.allTcp());
    }
}
