# Zenit on AWS with CDK

The AWS deployment of Zenit as code (AWS CDK, TypeScript), with CloudFront in
front: the UI comes from S3 and `/api/*` goes to the back on App Runner. It
runs next to the deployment made with the bash scripts (`bank-assistant-back`,
`bank-assistant-agent`), which it doesn't touch. Spec:
`spec/05-10-26-cdk-cloudfront/`.

## What it creates

Stack `ZenitStack` (account 335741630127, us-west-2), every resource tagged
`project=zenit`:

| Resource | Name |
| --- | --- |
| IAM role, pulls the images | `zenit-apprunner-ecr-access` |
| IAM roles, read the secrets | `zenit-back-instance`, `zenit-agent-instance` (only their own ARNs) |
| App Runner services | `zenit-back` (`/ping`), `zenit-agent` (`/health`), 1 vCPU and 2 GB each |
| S3 bucket | the built front, private, read only by CloudFront |
| CloudFront | default → S3 (app routes → `index.html`); `/api/*` and `/ping` → `zenit-back`, no cache |

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
The URLs are in `cdk.out/outputs.json` (`Url` is CloudFront's).

## After a deploy

- `https://<cloudfront>/ping` answers 200.
- Sign in, chat as a customer (the reply streams), open the advisor's inbox
  and the metrics.
- Reloading `https://<cloudfront>/conversations` loads the app.

## Notes

- The `/api/*` origin times out after 60 s without bytes, the maximum
  without a quota increase. The chat stream starts sending right away.
- Both backs run the turn queue on the same Lakebase. Claims are safe
  (`FOR UPDATE SKIP LOCKED`), but the stream cache is per back, so use one
  URL at a time while both exist.
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
