import { App, Tags } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SECRETS } from '../../lib/config.js';
import { ZenitStack } from '../../lib/zenit-stack.js';

let template: Template;

beforeAll(() => {
  const frontDist = mkdtempSync(join(tmpdir(), 'zenit-front-'));
  writeFileSync(join(frontDist, 'index.html'), '<html></html>');
  const app = new App();
  const stack = new ZenitStack(app, 'ZenitStack', {
    env: { account: '335741630127', region: 'us-west-2' },
    backTag: 'backtag1',
    agentTag: 'agenttag1',
    frontDist,
  });
  Tags.of(app).add('project', 'zenit');
  template = Template.fromStack(stack);
});

type Pair = { Name: string; Value: unknown };
const services = () =>
  Object.values(template.findResources('AWS::AppRunner::Service')) as Array<{
    Properties: {
      ServiceName: string;
      HealthCheckConfiguration: { Path: string };
      SourceConfiguration: {
        ImageRepository: {
          ImageIdentifier: unknown;
          ImageConfiguration: {
            Port: string;
            RuntimeEnvironmentVariables: Pair[];
            RuntimeEnvironmentSecrets: Pair[];
          };
        };
      };
    };
  }>;
const byName = (name: string) => {
  const svc = services().find((s) => s.Properties.ServiceName === name);
  if (!svc) throw new Error(`no service ${name}`);
  return svc.Properties;
};
const envOf = (name: string) =>
  Object.fromEntries(
    byName(name).SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.map(
      (p) => [p.Name, p.Value],
    ),
  );
const secretsOf = (name: string) =>
  Object.fromEntries(
    byName(name).SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentSecrets.map(
      (p) => [p.Name, p.Value],
    ),
  );

describe('App Runner services', () => {
  it('creates zenit-back and zenit-agent like the bash setups', () => {
    template.resourceCountIs('AWS::AppRunner::Service', 2);
    for (const [name, path] of [
      ['zenit-back', '/ping'],
      ['zenit-agent', '/health'],
    ]) {
      template.hasResourceProperties('AWS::AppRunner::Service', {
        ServiceName: name,
        InstanceConfiguration: { Cpu: '1024', Memory: '2048' },
        HealthCheckConfiguration: {
          Protocol: 'HTTP',
          Path: path,
          Interval: 10,
          Timeout: 5,
          HealthyThreshold: 1,
          UnhealthyThreshold: 3,
        },
        SourceConfiguration: Match.objectLike({
          AutoDeploymentsEnabled: false,
          ImageRepository: Match.objectLike({
            ImageRepositoryType: 'ECR',
            ImageConfiguration: Match.objectLike({ Port: '8080' }),
          }),
        }),
      });
    }
  });

  it('runs the given image tags', () => {
    expect(JSON.stringify(byName('zenit-back').SourceConfiguration.ImageRepository.ImageIdentifier)).toContain(
      'bank-assistant-back:backtag1',
    );
    expect(JSON.stringify(byName('zenit-agent').SourceConfiguration.ImageRepository.ImageIdentifier)).toContain(
      'bank-assistant-agent:agenttag1',
    );
  });

  it('points the new back at the new agent', () => {
    expect(envOf('zenit-back').API_PROXY).toEqual({
      'Fn::Join': ['', ['https://', { 'Fn::GetAtt': ['AgentService', 'ServiceUrl'] }, '/invocations']],
    });
    expect(envOf('zenit-back')).toMatchObject({ AUTH_MODE: 'password', AGENT_QUEUE_WORKER: 'on' });
  });

  it('reads host and client id from the principal secret at deploy time', () => {
    for (const name of ['zenit-back', 'zenit-agent']) {
      expect(envOf(name).DATABRICKS_HOST).toMatch(/^\{\{resolve:secretsmanager:arn:.*:SecretString:DATABRICKS_HOST::\}\}$/);
    }
  });

  it('passes secrets only as ARNs', () => {
    const arns = new Set(Object.values(SECRETS));
    for (const name of ['zenit-back', 'zenit-agent']) {
      for (const value of Object.values(secretsOf(name))) {
        expect(typeof value).toBe('string');
        expect([...arns].some((arn) => (value as string).startsWith(arn))).toBe(true);
      }
    }
    expect(Object.keys(secretsOf('zenit-back')).sort()).toEqual(
      ['AGENT_TOKEN', 'DATABRICKS_CLIENT_SECRET', 'DEMO_LOGINS_JSON', 'DEMO_USERS_JSON', 'SESSION_SECRET'],
    );
    expect(Object.keys(secretsOf('zenit-agent')).sort()).toEqual(['AGENT_TOKEN', 'DATABRICKS_CLIENT_SECRET', 'JEV_API_KEY']);
  });
});

describe('IAM', () => {
  it('lets each instance role read only its exact secrets', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const instance = Object.entries(policies).filter(([id]) => /InstanceRole/.test(id));
    expect(instance).toHaveLength(2);
    for (const [, policy] of instance) {
      for (const statement of (policy as { Properties: { PolicyDocument: { Statement: Array<{ Action: unknown; Resource: unknown }> } } }).Properties.PolicyDocument.Statement) {
        expect(statement.Action).toBe('secretsmanager:GetSecretValue');
        const resources = ([] as unknown[]).concat(statement.Resource);
        for (const r of resources) {
          expect(r).not.toBe('*');
          expect(Object.values(SECRETS)).toContain(r);
        }
      }
    }
  });

  it('pulls images with the managed ECR access policy', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'zenit-apprunner-ecr-access',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [Match.objectLike({ Principal: { Service: 'build.apprunner.amazonaws.com' } })],
      }),
    });
  });
});

describe('CloudFront', () => {
  const config = () =>
    (Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as {
      Properties: { DistributionConfig: Record<string, any> };
    }).Properties.DistributionConfig;

  it('sends /api/* and /ping to the back without cache, Host or compression', () => {
    const behaviors = config().CacheBehaviors as Array<Record<string, any>>;
    expect(behaviors.map((b) => b.PathPattern).sort()).toEqual(['/api/*', '/ping']);
    for (const b of behaviors) {
      expect(b.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad'); // CachingDisabled
      expect(b.OriginRequestPolicyId).toBe('b689b0a8-53d0-40ab-baf2-68738e2966ac'); // AllViewerExceptHostHeader
      expect(b.Compress).toBe(false);
      expect(b.AllowedMethods).toContain('POST');
      expect(b.ViewerProtocolPolicy).toBe('redirect-to-https');
    }
  });

  it('reaches the back over HTTPS with a 60 s read timeout', () => {
    const origins = config().Origins as Array<Record<string, any>>;
    const back = origins.find((o) => o.CustomOriginConfig);
    expect(back?.DomainName).toEqual({ 'Fn::GetAtt': ['BackService', 'ServiceUrl'] });
    expect(back?.CustomOriginConfig).toMatchObject({ OriginProtocolPolicy: 'https-only', OriginReadTimeout: 60 });
  });

  it('serves the front from S3 through OAC with the SPA rewrite', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    const def = config().DefaultCacheBehavior;
    expect(def.FunctionAssociations).toHaveLength(1);
    expect(def.FunctionAssociations[0].EventType).toBe('viewer-request');
    expect(config().CustomErrorResponses).toBeUndefined();
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});

it('tags everything project=zenit', () => {
  template.hasResourceProperties('AWS::AppRunner::Service', {
    Tags: Match.arrayWith([{ Key: 'project', Value: 'zenit' }]),
  });
});
