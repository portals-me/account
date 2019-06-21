import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const current = pulumi.output(aws.getCallerIdentity({}));

export const createLambdaMethod = (name: string, option: {
  authorization: pulumi.Input<string>,
  httpMethod: pulumi.Input<string>,
  resource: aws.apigateway.Resource,
  restApi: aws.apigateway.RestApi,
  integrationType: pulumi.Input<string>,
  handler: aws.lambda.Function,
}) => {
  const method = new aws.apigateway.Method(name, {
    authorization: option.authorization,
    httpMethod: option.httpMethod,
    resourceId: option.resource.id,
    restApi: option.restApi,
  });
  const integration = new aws.apigateway.Integration(name, {
    httpMethod: method.httpMethod,
    integrationHttpMethod: option.httpMethod,
    resourceId: option.resource.id,
    restApi: option.restApi,
    type: option.integrationType,
    uri: pulumi.interpolate`arn:aws:apigateway:${aws.getRegion().then(val => val.name)}:lambda:path/2015-03-31/functions/${option.handler.arn}/invocations`
  });
  new aws.lambda.Permission(name, {
    action: 'lambda:InvokeFunction',
    function: option.handler.name,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`arn:aws:execute-api:${aws.getRegion().then(val => val.name)}:${current.accountId}:${option.restApi.id}/*/${method.httpMethod}${option.resource.path}`,
  });

  const optionsMethod = new aws.apigateway.Method(`${name}-options`, {
    authorization: 'NONE',
    httpMethod: 'OPTIONS',
    resourceId: option.resource.id,
    restApi: option.restApi,
  });
  new aws.apigateway.Integration(`${name}-options`, {
    httpMethod: 'OPTIONS',
    resourceId: option.resource.id,
    restApi: option.restApi,
    type: 'MOCK',
    passthroughBehavior: 'WHEN_NO_MATCH',
    requestTemplates: {
      'application/json': '{"statusCode": 200}'
    },
  });
  const response200 = new aws.apigateway.MethodResponse(`${name}-response-200`, {
    httpMethod: optionsMethod.httpMethod,
    resourceId: option.resource.id,
    restApi: option.restApi,
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
  new aws.apigateway.IntegrationResponse(`${name}-post-options`, {
    httpMethod: 'OPTIONS',
    resourceId: option.resource.id,
    restApi: option.restApi,
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

  return integration;
};

