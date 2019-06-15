import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as chp from 'child_process';
import * as util from 'util';

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
const authneticatePostMethod = new aws.apigateway.Method('authenticate-post', {
  authorization: 'NONE',
  httpMethod: 'POST',
  resourceId: authenticateResource.id,
  restApi: accountAPI,
});
const authenticatePostIntegration = new aws.apigateway.Integration('authenticate-post', {
  httpMethod: authneticatePostMethod.httpMethod,
  integrationHttpMethod: 'POST',
  resourceId: authenticateResource.id,
  restApi: accountAPI,
  type: 'AWS_PROXY',
  uri: pulumi.interpolate`arn:aws:apigateway:${aws.getRegion().then(val => val.name)}:lambda:path/2015-03-31/functions/${handlerAuth.arn}/invocations`
});
new aws.lambda.Permission('authenticate-post-permission', {
  action: 'lambda:InvokeFunction',
  function: handlerAuth.name,
  principal: 'apigateway.amazonaws.com',
  sourceArn: pulumi.interpolate`arn:aws:execute-api:${aws.getRegion().then(val => val.name)}:${current.accountId}:${accountAPI.id}/*/${authneticatePostMethod.httpMethod}/${authenticateResource.path}`,
});
const accountAPIDeployment = new aws.apigateway.Deployment(
  'account-api-deployment',
  {
    restApi: accountAPI,
    stageName: config.stage,
    stageDescription: new Date().toLocaleString(),
  },
  {
    dependsOn: [authenticatePostIntegration],
  }
);

const authenticatePostOptionsMethod = new aws.apigateway.Method('authenticate-post-options', {
  authorization: 'NONE',
  httpMethod: 'OPTIONS',
  resourceId: authenticateResource.id,
  restApi: accountAPI,
});
new aws.apigateway.Integration('authenticate-post-options', {
  httpMethod: 'OPTIONS',
  resourceId: authenticateResource.id,
  restApi: accountAPI,
  type: 'MOCK',
  passthroughBehavior: 'WHEN_NO_MATCH',
  requestTemplates: {
    'application/json': '{"statusCode": 200}'
  },
});
const response200 = new aws.apigateway.MethodResponse('200', {
  httpMethod: authenticatePostOptionsMethod.httpMethod,
  resourceId: authenticateResource.id,
  restApi: accountAPI,
  statusCode: '200',
  responseModels: {
    'application/json': 'Empty'
  },
  responseParameters: {
    'method.response.header.Access-Control-Allow-Headers': false,
    'method.response.header.Access-Control-Allow-Methods': false,
    'method.response.header.Access-Control-Allow-Origin': false,
  }
})
new aws.apigateway.IntegrationResponse('authenticate-post-options', {
  httpMethod: 'OPTIONS',
  resourceId: authenticateResource.id,
  restApi: accountAPI,
  statusCode: response200.statusCode,
  responseParameters: {
    'method.response.header.Access-Control-Allow-Headers': "'Authorization,Content-Type,X-Amz-Date,X-Amz-Security-Token,X-Api-Key'",
    'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,HEAD,GET,POST,PUT,PATCH,DELETE'",
    'method.response.header.Access-Control-Allow-Origin': "'*'"
  },
  responseTemplates: {
    'application/json': ''
  },
});

export const output = {
  endpoint: accountAPIDeployment.invokeUrl,
};
