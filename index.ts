import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as chp from 'child_process';
import * as util from 'util';
import { createLambdaMethod, createCORSResource } from "./infrastructure/apigateway";

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
  }).then(result => result.value),
  twitter: {
    client: aws.ssm.getParameter({
      name: `${config.service}-twitter-apiKey`,
      withDecryption: true,
    }).then(result => result.value),
    secret: aws.ssm.getParameter({
      name: `${config.service}-twitter-apiKey-secret`,
      withDecryption: true,
    }).then(result => result.value),
  }
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
      twitterClientKey: parameter.twitter.client,
      twitterClientSecret: parameter.twitter.secret,
    }
  },
  name: `${config.service}-${config.stage}-auth`
});

const handlerTwitter = new aws.lambda.Function('handler-twitter', {
  runtime: aws.lambda.Go1dxRuntime,
  code: new pulumi.asset.FileArchive((async () => {
    await chpExec('GOOS=linux GOARCH=amd64 go build -o ./dist/functions/twitter/main functions/twitter/main.go');
    await chpExec('zip -j ./dist/functions/twitter/main.zip ./dist/functions/twitter/main');

    return './dist/functions/twitter/main.zip';
  })()),
  timeout: 10,
  memorySize: 128,
  handler: 'main',
  role: lambdaRole.arn,
  environment: {
    variables: {
      timestamp: new Date().toLocaleString(),
      clientKey: parameter.twitter.client,
      clientSecret: parameter.twitter.secret,
    }
  },
  name: `${config.service}-${config.stage}-twitter`
});


const accountAPI = new aws.apigateway.RestApi('account-api', {
  name: `${config.service}-${config.stage}`
});

const authenticateResource = createCORSResource('authenticate', {
  parentId: accountAPI.rootResourceId,
  pathPart: 'authenticate',
  restApi: accountAPI,
});

const authenticateLambdaIntegration = createLambdaMethod('authenticate', {
  authorization: 'NONE',
  httpMethod: 'POST',
  resource: authenticateResource,
  restApi: accountAPI,
  integration: {
    type: 'AWS_PROXY',
  },
  handler: handlerAuth,
});

const twitterResource = createCORSResource('twitter', {
  parentId: accountAPI.rootResourceId,
  pathPart: 'twitter',
  restApi: accountAPI,
});

const twitterPostIntegration = createLambdaMethod('twitter-post', {
  authorization: 'NONE',
  httpMethod: 'POST',
  resource: twitterResource,
  restApi: accountAPI,
  integration: {
    type: 'AWS_PROXY',
  },
  handler: handlerTwitter,
});

const twitterGetIntegration = createLambdaMethod('twitter-get', {
  authorization: 'NONE',
  httpMethod: 'GET',
  resource: twitterResource,
  restApi: accountAPI,
  integration: {
    type: 'AWS_PROXY',
  },
  handler: handlerTwitter,
  method: {
    requestParameters: {
      'method.request.querystring.oauth_token': true,
      'method.request.querystring.oauth_verifier': true,
    }
  },
});

const accountAPIDeployment = new aws.apigateway.Deployment(
  'account-api-deployment',
  {
    restApi: accountAPI,
    stageName: config.stage,
    stageDescription: new Date().toLocaleString(),
  },
  {
    dependsOn: [authenticateLambdaIntegration, twitterPostIntegration, twitterGetIntegration]
  }
);

export const output = {
  endpoint: accountAPIDeployment.invokeUrl,
};
