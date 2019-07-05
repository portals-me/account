import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import {
  createLambdaMethod,
  createCORSResource
} from "./infrastructure/apigateway";
import { createLambdaFunction } from "./infrastructure/lambda";

const config = {
  service: new pulumi.Config().name,
  stage: pulumi.getStack()
};

const parameter = {
  jwtPrivate: aws.ssm
    .getParameter({
      name: config.stage.startsWith("test")
        ? `${config.service}-stg-jwt-private`
        : `${config.service}-${config.service}-jwt-private`,
      withDecryption: true
    })
    .then(result => result.value),
  twitter: {
    client: aws.ssm
      .getParameter({
        name: `${config.service}-twitter-apiKey`,
        withDecryption: true
      })
      .then(result => result.value),
    secret: aws.ssm
      .getParameter({
        name: `${config.service}-twitter-apiKey-secret`,
        withDecryption: true
      })
      .then(result => result.value)
  },
  google: {
    clientId: aws.ssm
      .getParameter({
        name: `${config.service}-google-clientId`,
        withDecryption: true
      })
      .then(result => result.value)
  }
};

const lambdaRole = new aws.iam.Role("auth-lambda-role", {
  assumeRolePolicy: aws.iam
    .getPolicyDocument({
      statements: [
        {
          actions: ["sts:AssumeRole"],
          principals: [
            {
              identifiers: ["lambda.amazonaws.com"],
              type: "Service"
            }
          ]
        }
      ]
    })
    .then(result => result.json)
});
new aws.iam.RolePolicyAttachment("auth-lambda-role-lambdafull", {
  role: lambdaRole,
  policyArn: aws.iam.AWSLambdaFullAccess
});

const accountTable = new aws.dynamodb.Table("account-table", {
  attributes: [
    {
      name: "id",
      type: "S"
    },
    {
      name: "sort",
      type: "S"
    },
    {
      name: "name",
      type: "S"
    }
  ],
  hashKey: "id",
  rangeKey: "sort",
  billingMode: "PAY_PER_REQUEST",
  globalSecondaryIndexes: [
    {
      name: "auth",
      hashKey: "sort",
      rangeKey: "id",
      projectionType: "ALL"
    },
    {
      name: "name",
      hashKey: "name",
      projectionType: "KEYS_ONLY"
    }
  ],
  streamEnabled: true,
  streamViewType: "NEW_IMAGE"
});

const accountTableEventTopic = new aws.sns.Topic("account-table-event-topic", {
  name: `${config.service}-${config.stage}-account-table-event-topic`
});

const accountTableEventSubscription = createLambdaFunction(
  "account-table-event-subscription",
  {
    filepath: "account-table-subscription",
    role: lambdaRole,
    handlerName: `${config.service}-${
      config.stage
    }-account-table-event-subscription`,
    lambdaOptions: {
      environment: {
        variables: {
          timestamp: new Date().toLocaleString(),
          accountTableSubscriptionTopicArn: accountTableEventTopic.arn
        }
      }
    }
  }
);

const accountTableSubscription = new aws.dynamodb.TableEventSubscription(
  "account-table-subscription",
  accountTable,
  accountTableEventSubscription,
  {
    startingPosition: "TRIM_HORIZON"
  }
);

const twitterLambda = createLambdaFunction("handler-twitter", {
  filepath: "twitter",
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-twitter`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        clientKey: parameter.twitter.client,
        clientSecret: parameter.twitter.secret
      }
    }
  }
});

const accountAPI = new aws.apigateway.RestApi("account-api", {
  name: `${config.service}-${config.stage}`
});

const signinLambdaIntegration = createLambdaMethod("signin", {
  authorization: "NONE",
  httpMethod: "POST",
  resource: createCORSResource("signin", {
    parentId: accountAPI.rootResourceId,
    pathPart: "signin",
    restApi: accountAPI
  }),
  restApi: accountAPI,
  integration: {
    type: "AWS_PROXY"
  },
  handler: createLambdaFunction("handler-signin", {
    filepath: "signin",
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
          googleClientId: parameter.google.clientId
        }
      }
    }
  })
});

const signupLambdaIntegration = createLambdaMethod("signup", {
  authorization: "NONE",
  httpMethod: "POST",
  resource: createCORSResource("signup", {
    parentId: accountAPI.rootResourceId,
    pathPart: "signup",
    restApi: accountAPI
  }),
  restApi: accountAPI,
  integration: {
    type: "AWS_PROXY"
  },
  handler: createLambdaFunction("handler-signup", {
    filepath: "signup",
    role: lambdaRole,
    handlerName: `${config.service}-${config.stage}-signup`,
    lambdaOptions: {
      environment: {
        variables: {
          timestamp: new Date().toLocaleString(),
          authTable: accountTable.name,
          jwtPrivate: parameter.jwtPrivate,
          twitterClientKey: parameter.twitter.client,
          twitterClientSecret: parameter.twitter.secret,
          googleClientId: parameter.google.clientId
        }
      }
    }
  })
});

const twitterResource = createCORSResource("twitter", {
  parentId: accountAPI.rootResourceId,
  pathPart: "twitter",
  restApi: accountAPI
});

const twitterPostIntegration = createLambdaMethod("twitter-post", {
  authorization: "NONE",
  httpMethod: "POST",
  resource: twitterResource,
  restApi: accountAPI,
  integration: {
    type: "AWS_PROXY"
  },
  handler: twitterLambda
});

const twitterGetIntegration = createLambdaMethod("twitter-get", {
  authorization: "NONE",
  httpMethod: "GET",
  resource: twitterResource,
  restApi: accountAPI,
  integration: {
    type: "AWS_PROXY"
  },
  handler: twitterLambda,
  method: {
    requestParameters: {
      "method.request.querystring.oauth_token": true,
      "method.request.querystring.oauth_verifier": true
    }
  }
});

const getUserByName = createLambdaFunction("get-user-by-name-function", {
  filepath: "get-user-by-name",
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-get-user-by-name`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        authTable: accountTable.name
      }
    }
  }
});

const usernameResource = new aws.apigateway.Resource("username", {
  parentId: accountAPI.rootResourceId,
  pathPart: "username",
  restApi: accountAPI
});

const nameResource = createCORSResource("name", {
  parentId: usernameResource.id,
  pathPart: "{name}",
  restApi: accountAPI
});

const getUserByNameIntegration = createLambdaMethod(
  "get-user-by-name-integration",
  {
    authorization: "NONE",
    httpMethod: "GET",
    resource: nameResource,
    restApi: accountAPI,
    integration: {
      type: "AWS_PROXY"
    },
    handler: getUserByName
  }
);

const accountAPIDeployment = new aws.apigateway.Deployment(
  "account-api-deployment",
  {
    restApi: accountAPI,
    stageName: config.stage,
    stageDescription: new Date().toLocaleString()
  },
  {
    dependsOn: [
      signupLambdaIntegration,
      signinLambdaIntegration,
      twitterPostIntegration,
      twitterGetIntegration,
      getUserByNameIntegration
    ]
  }
);

export const output = {
  restApi: accountAPIDeployment.invokeUrl,
  tableName: accountTable.name
};
