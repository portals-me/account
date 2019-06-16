import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as chp from 'child_process';
import * as util from 'util';
import { createLambdaMethod } from "./infrastructure/apigateway";

const current = pulumi.output(aws.getCallerIdentity({}));

const config = {
  service: new pulumi.Config().name,
  stage: pulumi.getStack(),
};

const chpExec = util.promisify(chp.exec);

const parameter = {
  jwtPrivate: aws.ssm.getParameter({
    name: `${config.service}-${config.stage}-jwt-private`,
    withDecryption: true,
  }).then(result => result.value)
};

const accountTable = new aws.dynamodb.Table('account-table', {
  attributes: [
    {
      name: 'id',
      type: 'S',
    },
    {
      name: 'sort',
      type: 'S',
    }
  ],
  hashKey: 'id',
  rangeKey: 'sort',
  billingMode: 'PAY_PER_REQUEST',
  globalSecondaryIndexes: [{
    name: 'auth',
    hashKey: 'sort',
    rangeKey: 'id',
    projectionType: 'ALL',
  }],
});

const lambdaRole = new aws.iam.Role('auth-lambda-role', {
  assumeRolePolicy: aws.iam.getPolicyDocument({
    statements: [{
      actions: ['sts:AssumeRole'],
      principals: [{
        identifiers: ['lambda.amazonaws.com'],
        type: 'Service'
      }],
    }]
  }).then(result => result.json),
})
new aws.iam.RolePolicyAttachment('auth-lambda-role-lambdafull', {
  role: lambdaRole,
  policyArn: aws.iam.AWSLambdaFullAccess,
});

const handlerAuth = new aws.lambda.Function('handler-auth', {
  runtime: aws.lambda.Go1dxRuntime,
  code: new pulumi.asset.FileArchive((async () => {
    await chpExec('GOOS=linux GOARCH=amd64 go build -o ./dist/functions/authenticate/main functions/authenticate/main.go');
    await chpExec('zip -j ./dist/functions/authenticate/main.zip ./dist/functions/authenticate/main');

    return './dist/functions/authenticate/main.zip';
  })()),
  timeout: 10,
  memorySize: 128,
  handler: 'main',
  role: lambdaRole.arn,
  environment: {
    variables: {
      timestamp: new Date().toLocaleString(),
      authTable: accountTable.name,
      jwtPrivate: parameter.jwtPrivate,
    }
  },
  name: `${config.service}-${config.stage}-auth`
});

const accountAPI = new aws.apigateway.RestApi('account-api', {
  name: `${config.service}-${config.stage}`
});

const authenticateResource = new aws.apigateway.Resource('authenticate', {
  parentId: accountAPI.rootResourceId,
  pathPart: 'authenticate',
  restApi: accountAPI,
});

const authenticateLambdaIntegration = createLambdaMethod('authenticate', {
  authorization: 'NONE',
  httpMethod: 'POST',
  resource: authenticateResource,
  restApi: accountAPI,
  integrationType: 'AWS_PROXY',
  handler: handlerAuth,
});

const accountAPIDeployment = new aws.apigateway.Deployment(
  'account-api-deployment',
  {
    restApi: accountAPI,
    stageName: config.stage,
    stageDescription: new Date().toLocaleString(),
  },
  {
    dependsOn: [authenticateLambdaIntegration]
  }
);

export const output = {
  endpoint: accountAPIDeployment.invokeUrl,
};
