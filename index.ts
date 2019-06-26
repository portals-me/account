import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { createLambdaMethod, createCORSResource } from "./infrastructure/apigateway";
import { createLambdaFunction } from "./infrastructure/lambda";

const config = {
  service: new pulumi.Config().name,
  stage: pulumi.getStack(),
};

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
  streamEnabled: true,
  streamViewType: 'NEW_IMAGE'
});

const accountTableEventTopic = new aws.sns.Topic('account-table-event-topic', {
  name: `${config.service}-${config.stage}-account-table-event-topic`
});

const accountTableEventSubscription = createLambdaFunction('account-table-event-subscription', {
  filepath: 'account-table-subscription',
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-account-table-event-subscription`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        accountTableSubscriptionTopicArn: accountTableEventTopic.arn,
      }
    },
  }
});

const accountTableSubscription = new aws.dynamodb.TableEventSubscription('account-table-subscription', accountTable, accountTableEventSubscription, {
  startingPosition: 'TRIM_HORIZON'
});

const signinLambda = createLambdaFunction('handler-signin', {
  filepath: 'signin',
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-signin`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        authTable: accountTable.name,
        jwtPrivate: parameter.jwtPrivate,
        twitterClientKey: parameter.twitter.client,
        twitterClientSecret: parameter.twitter.secret,
      }
    },
  }
});

const twitterLambda = createLambdaFunction('handler-twitter', {
  filepath: 'twitter',
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-twitter`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        clientKey: parameter.twitter.client,
        clientSecret: parameter.twitter.secret,
      }
    },
  }
});

const accountAPI = new aws.apigateway.RestApi('account-api', {
  name: `${config.service}-${config.stage}`
});

const signinResource = createCORSResource('signin', {
  parentId: accountAPI.rootResourceId,
  pathPart: 'signin',
  restApi: accountAPI,
});

const signinLambdaIntegration = createLambdaMethod('signin', {
  authorization: 'NONE',
  httpMethod: 'POST',
  resource: signinResource,
  restApi: accountAPI,
  integration: {
    type: 'AWS_PROXY',
  },
  handler: signinLambda,
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
  handler: twitterLambda,
});

const twitterGetIntegration = createLambdaMethod('twitter-get', {
  authorization: 'NONE',
  httpMethod: 'GET',
  resource: twitterResource,
  restApi: accountAPI,
  integration: {
    type: 'AWS_PROXY',
  },
  handler: twitterLambda,
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
    dependsOn: [signinLambdaIntegration, twitterPostIntegration, twitterGetIntegration]
  }
);

export const output = {
  endpoint: accountAPIDeployment.invokeUrl,
};
