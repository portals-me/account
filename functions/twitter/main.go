package main

import (
	"context"
	"encoding/json"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/gomodule/oauth1/oauth"

	"github.com/portals-me/account/lib/twitter"
)

var clientKey = os.Getenv("clientKey")
var clientSecret = os.Getenv("clientSecret")

// Client -> POST /auth/twitter -> reidect to twitter.com -> GET /auth/twitter?access_token
func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	client := twitter.GetTwitterClient(clientKey, clientSecret)

	if request.HTTPMethod == "POST" {
		result, err := client.RequestTemporaryCredentials(
			nil,
			request.Headers["Referer"]+"/twitter-callback",
			nil,
		)
		if err != nil {
			return events.APIGatewayProxyResponse{}, err
		}

		url := client.AuthorizationURL(result, nil)
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Headers: map[string]string{
				"Access-Control-Allow-Origin": "*",
			},
			Body: url,
		}, nil
	} else if request.HTTPMethod == "GET" {
		tokenCred, _, err := client.RequestToken(nil, &oauth.Credentials{
			Token:  request.QueryStringParameters["oauth_token"],
			Secret: "",
		}, request.QueryStringParameters["oauth_verifier"])
		if err != nil {
			return events.APIGatewayProxyResponse{}, err
		}

		client := twitter.Config{
			Credentials: twitter.Credentials{
				CredentialToken:  tokenCred.Token,
				CredentialSecret: tokenCred.Secret,
			},
			ClientKey:    clientKey,
			ClientSecret: clientSecret,
		}

		var account twitter.User
		if err := client.GetTwitterUser(&account); err != nil {
			return events.APIGatewayProxyResponse{}, err
		}
		raw, _ := json.Marshal(map[string]interface{}{
			"credential_token":  tokenCred.Token,
			"credential_secret": tokenCred.Secret,
			"account":           account,
		})

		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Headers: map[string]string{
				"Access-Control-Allow-Origin": "*",
			},
			Body: string(raw),
		}, nil
	}

	return events.APIGatewayProxyResponse{Body: "", StatusCode: 400}, nil
}

func main() {
	lambda.Start(handler)
}
