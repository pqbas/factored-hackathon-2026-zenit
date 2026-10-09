import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { CfnService } from 'aws-cdk-lib/aws-apprunner';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
  type BehaviorOptions,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_ENV,
  BACK_ENV,
  ECR_REPOS,
  NAMES,
  REPO_ROOT,
  SECRETS,
  readAppYamlEnv,
} from './config.js';

export interface ZenitStackProps extends StackProps {
  backTag: string;
  agentTag: string;
  // The built front (npm run build in front/), uploaded to the bucket.
  frontDist: string;
  // CloudFront + S3 in front of the back. Off until AWS verifies the account
  // for CloudFront; without it the back serves the front, as on the bash setup.
  cloudfront: boolean;
}

type Pairs = Record<string, string>;
const pairs = (values: Pairs) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));

export class ZenitStack extends Stack {
  constructor(scope: Construct, id: string, props: ZenitStackProps) {
    super(scope, id, props);

    // App Runner pulls the images with this role.
    const accessRole = new Role(this, 'EcrAccessRole', {
      roleName: NAMES.accessRole,
      assumedBy: new ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });

    // Each running container reads only the secrets it is given.
    const instanceRole = (id: string, roleName: string, arns: string[]) => {
      const role = new Role(this, id, {
        roleName,
        assumedBy: new ServicePrincipal('tasks.apprunner.amazonaws.com'),
      });
      role.addToPolicy(
        new PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: arns,
        }),
      );
      return role;
    };

    const image = (repo: string, tag: string) =>
      `${Repository.fromRepositoryName(this, `${repo}Repo`, repo).repositoryUri}:${tag}`;

    const service = (
      id: string,
      opts: {
        name: string;
        image: string;
        healthPath: string;
        role: Role;
        env: Pairs;
        secrets: Pairs;
      },
    ) => {
      const svc = new CfnService(this, id, {
        serviceName: opts.name,
        sourceConfiguration: {
          authenticationConfiguration: { accessRoleArn: accessRole.roleArn },
          autoDeploymentsEnabled: false,
          imageRepository: {
            imageIdentifier: opts.image,
            imageRepositoryType: 'ECR',
            imageConfiguration: {
              port: '8080',
              runtimeEnvironmentVariables: pairs(opts.env),
              runtimeEnvironmentSecrets: pairs(opts.secrets),
            },
          },
        },
        instanceConfiguration: {
          cpu: '1024',
          memory: '2048',
          instanceRoleArn: opts.role.roleArn,
        },
        healthCheckConfiguration: {
          protocol: 'HTTP',
          path: opts.healthPath,
          interval: 10,
          timeout: 5,
          healthyThreshold: 1,
          unhealthyThreshold: 3,
        },
      });
      // The roles must exist, with their policies, before App Runner uses them.
      svc.node.addDependency(accessRole, opts.role);
      return svc;
    };

    const agentSecrets = {
      POSTGRES_URL: SECRETS.neonUrl,
      ANTHROPIC_API_KEY: SECRETS.anthropicKey,
      JEV_API_KEY: SECRETS.jevApiKey,
      AGENT_TOKEN: SECRETS.agentToken,
    };
    const agent = service('AgentService', {
      name: NAMES.agent,
      image: image(ECR_REPOS.agent, props.agentTag),
      healthPath: '/health',
      role: instanceRole('AgentInstanceRole', NAMES.agentInstanceRole, [
        SECRETS.neonUrl,
        SECRETS.anthropicKey,
        SECRETS.jevApiKey,
        SECRETS.agentToken,
      ]),
      env: {
        ...AGENT_ENV,
        DEMO_SESSIONS_JSON: readAppYamlEnv(
          join(REPO_ROOT, 'agent', 'app.yaml'),
          'DEMO_SESSIONS_JSON',
        ),
      },
      secrets: agentSecrets,
    });

    const back = service('BackService', {
      name: NAMES.back,
      image: image(ECR_REPOS.back, props.backTag),
      healthPath: '/ping',
      role: instanceRole('BackInstanceRole', NAMES.backInstanceRole, [
        SECRETS.neonUrl,
        SECRETS.sessionSecret,
        SECRETS.demoUsers,
        SECRETS.demoLogins,
        SECRETS.agentToken,
      ]),
      env: {
        ...BACK_ENV,
        API_PROXY: `https://${agent.attrServiceUrl}/invocations`,
        DEMO_CUSTOMERS_JSON: readAppYamlEnv(
          join(REPO_ROOT, 'back', 'app.yaml'),
          'DEMO_CUSTOMERS_JSON',
        ),
      },
      secrets: {
        POSTGRES_URL: SECRETS.neonUrl,
        BANK_POSTGRES_URL: SECRETS.neonUrl,
        SESSION_SECRET: SECRETS.sessionSecret,
        DEMO_USERS_JSON: SECRETS.demoUsers,
        DEMO_LOGINS_JSON: SECRETS.demoLogins,
        AGENT_TOKEN: SECRETS.agentToken,
      },
    });

    new CfnOutput(this, 'BackUrl', { value: `https://${back.attrServiceUrl}` });
    new CfnOutput(this, 'AgentUrl', { value: `https://${agent.attrServiceUrl}` });
    if (!props.cloudfront) {
      new CfnOutput(this, 'Url', { value: `https://${back.attrServiceUrl}` });
      return;
    }

    // The front: a private bucket that only CloudFront reads.
    const bucket = new Bucket(this, 'FrontBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaRewrite = new CfFunction(this, 'SpaRewrite', {
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromFile({
        filePath: join(dirname(fileURLToPath(import.meta.url)), 'spa-rewrite.js'),
      }),
    });

    // The API: no cache, every header but Host (App Runner routes by its own
    // host), and no compression so the chat's SSE stream isn't held back.
    const api: BehaviorOptions = {
      origin: new HttpOrigin(back.attrServiceUrl, {
        protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        readTimeout: Duration.seconds(60),
      }),
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      compress: false,
    };

    const distribution = new Distribution(this, 'Distribution', {
      comment: 'Zenit: front from S3, /api/* to the back on App Runner',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: spaRewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: { '/api/*': api, '/ping': api },
    });

    new BucketDeployment(this, 'FrontDeployment', {
      sources: [Source.asset(props.frontDist)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'Url', { value: `https://${distribution.distributionDomainName}` });
  }
}
