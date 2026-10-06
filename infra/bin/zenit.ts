import { App, Tags } from 'aws-cdk-lib';
import { join } from 'node:path';
import { ACCOUNT, REGION, REPO_ROOT } from '../lib/config.js';
import { ZenitStack } from '../lib/zenit-stack.js';

const app = new App();

const required = (key: string) => {
  const value = app.node.tryGetContext(key);
  if (!value) throw new Error(`Missing context: -c ${key}=<image tag>`);
  return String(value);
};

new ZenitStack(app, 'ZenitStack', {
  env: { account: ACCOUNT, region: REGION },
  backTag: required('backTag'),
  agentTag: required('agentTag'),
  frontDist: app.node.tryGetContext('frontDist') ?? join(REPO_ROOT, 'front', 'dist'),
});

Tags.of(app).add('project', 'zenit');
