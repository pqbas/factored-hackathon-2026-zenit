# Zenit on AWS with CDK

The AWS deployment of Zenit as code (AWS CDK, TypeScript). It replaced the
bash scripts (`back/scripts/aws/`, `agent/scripts/aws/`): their services
`bank-assistant-back` and `bank-assistant-agent` were deleted on 2026-10-05.
Spec: `spec/05-10-26-cdk-cloudfront/`.

**CloudFront is off today, and production should have it on.** The stack
can put CloudFront in front (the UI from S3, `/api/*` to the back), but this
AWS account isn't verified for CloudFront: creating the distribution fails
with "Your account must be verified before you can add new CloudFront
resources" (Request ID `77d57753-96d7-4883-b1dc-e2e6ad737cc3`). Until AWS
Support verifies the account, the back serves the UI, as the bash setup did.
Why and how to turn it on: [`docs/camino-a-produccion.md`](../docs/camino-a-produccion.md) §6.

## What it creates

Stack `ZenitStack` (account 335741630127, us-west-2), every resource tagged
`project=zenit`:

| Resource | Name |
| --- | --- |
| IAM role, pulls the images | `zenit-apprunner-ecr-access` |
| IAM roles, read the secrets | `zenit-back-instance`, `zenit-agent-instance` (only their own ARNs) |
| App Runner services | `zenit-back` (`/ping`), `zenit-agent` (`/health`), 1 vCPU and 2 GB each |
| S3 bucket (only with `-c cloudfront=on`) | the built front, private, read only by CloudFront |
| CloudFront (only with `-c cloudfront=on`) | default → S3 (app routes → `index.html`); `/api/*` and `/ping` → `zenit-back`, no cache |

It reuses, and never changes:

- the ECR repositories `bank-assistant-back` and `bank-assistant-agent`;
- the secrets in Secrets Manager (ARNs in `lib/config.ts`);
- the Databricks service principals and Lakebase.

The demo customers come from `back/app.yaml` and `agent/app.yaml`.

## Requirements

- An AWS session (`aws sts get-caller-identity`), Node 20+, Docker only to
  push new images.
- Once per account and region: `npx cdk bootstrap aws://335741630127/us-west-2`.

## Deploy

```bash
cd infra && npm ci
# Images: the ones the current services run, or a pushed tag
# (back/scripts/aws/deploy.sh --push, agent/scripts/aws/deploy.sh --push).
BACK_TAG=<tag> AGENT_TAG=<tag> scripts/deploy.sh
```

The script builds the front of the current checkout and runs `cdk deploy`.
The URLs are in `cdk.out/outputs.json`: `Url` is the app's (the back's
without CloudFront, CloudFront's with it).

With CloudFront, once the account is verified: add `-c cloudfront=on` to the
`cdk deploy` line of `scripts/deploy.sh`, or run it by hand.

## After a deploy

- `https://<cloudfront>/ping` answers 200.
- Sign in, chat as a customer (the reply streams), open the advisor's inbox
  and the metrics.
- Reloading `https://<cloudfront>/conversations` loads the app.

## Notes

- The `/api/*` origin times out after 60 s without bytes, the maximum
  without a quota increase. The chat stream starts sending right away.
- The account allows only 2 App Runner services per region, so there is no
  room for a second deployment next to this one.
- Cost with demo traffic: CloudFront ≈ USD 0 (free tier), S3 cents, the two
  App Runner services ≈ USD 1 per day.

## Test

```bash
npm run build && npm test
npx cdk synth -c backTag=test -c agentTag=test   # needs front/dist, or -c frontDist=<dir>
```

## Remove

`npx cdk destroy ZenitStack -c backTag=x -c agentTag=x` removes the stack,
bucket included. The repositories and secrets stay.
