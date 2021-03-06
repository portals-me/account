import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import {
  createLambdaMethod,
  createCORSResource
} from "./infrastructure/apigateway";
import { createLambdaFunction } from "./infrastructure/lambda";

const config = {
  service: new pulumi.Config().name,
  stage: pulumi.getStack(),
  region: "ap-northeast-1"
};

const parameter = {
  jwtPrivate: aws.ssm
    .getParameter({
      name: config.stage.startsWith("test")
        ? `${config.service}-stg-jwt-private`
        : `${config.service}-${config.stage}-jwt-private`,
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
  },
  domain: aws.ssm
    .getParameter({
      name: config.stage.startsWith("test")
        ? `${config.service}-stg-domain-prefix`
        : `${config.service}-${config.stage}-domain-prefix`
    })
    .then(result => result.value)
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
    .then(result => result.json),
  name: `${config.service}-${config.stage}-lambda-role`
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
  streamViewType: "NEW_IMAGE",
  name: `${config.service}-${config.stage}-accounts`
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
    }-account-table-event-subscription`.substr(0, 63),
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

const authorizerFunction = createLambdaFunction("authorizer", {
  filepath: "authorizer",
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-authorizer`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        jwtPrivateKey: parameter.jwtPrivate
      }
    }
  }
});

const authorizerRole = new aws.iam.Role("authorizer-role", {
  assumeRolePolicy: aws.iam
    .getPolicyDocument({
      version: "2012-10-17",
      statements: [
        {
          effect: "Allow",
          principals: [
            {
              type: "Service",
              identifiers: ["apigateway.amazonaws.com"]
            }
          ],
          actions: ["sts:AssumeRole"]
        }
      ]
    })
    .then(result => result.json)
});
new aws.iam.RolePolicy("authorizer-role-policy", {
  role: authorizerRole,
  policy: aws.iam
    .getPolicyDocument({
      version: "2012-10-17",
      statements: [
        {
          effect: "Allow",
          actions: ["lambda:invokeFunction"],
          resources: ["*"]
        }
      ]
    })
    .then(result => result.json)
});

const authorizer = new aws.apigateway.Authorizer("authorizer", {
  restApi: accountAPI,
  type: "TOKEN",
  name: `${config.service}-${config.stage}-authorizer`,
  authorizerUri: pulumi.interpolate`arn:aws:apigateway:${
    config.region
  }:lambda:path/2015-03-31/functions/${authorizerFunction.arn}/invocations`,
  authorizerCredentials: authorizerRole.arn
});

const selfFunction = createLambdaFunction("self-function", {
  filepath: "self",
  role: lambdaRole,
  handlerName: `${config.service}-${config.stage}-self`,
  lambdaOptions: {
    environment: {
      variables: {
        timestamp: new Date().toLocaleString(),
        authTable: accountTable.name,
        domain: parameter.domain
      }
    }
  }
});

const selfResource = createCORSResource("self", {
  parentId: accountAPI.rootResourceId,
  pathPart: "self",
  restApi: accountAPI
});

const putSelfIntegration = createLambdaMethod("get-self-integration", {
  authorization: "CUSTOM",
  httpMethod: "PUT",
  resource: selfResource,
  restApi: accountAPI,
  integration: {
    type: "AWS_PROXY"
  },
  handler: selfFunction,
  method: {
    authorizerId: authorizer.id
  }
});

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
      getUserByNameIntegration,
      putSelfIntegration
    ]
  }
);

export const output = {
  restApi: accountAPIDeployment.invokeUrl,
  tableName: accountTable.name,
  domain: parameter.domain
};
