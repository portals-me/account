package main

import (
	"context"
	"encoding/json"
	"net/url"
	"os"

	"github.com/gomodule/oauth1/oauth"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

var clientKey = os.Getenv("clientKey")
var clientSecret = os.Getenv("clientSecret")

type TwitterUser struct {
	ID              string `json:"id_str"`
	ScreenName      string `json:"screen_name"`
	ProfileImageURL string `json:"profile_image_url"`
}

func GetTwitterClient() oauth.Client {
	return oauth.Client{
		TemporaryCredentialRequestURI: "https://api.twitter.com/oauth/request_token",
		ResourceOwnerAuthorizationURI: "https://api.twitter.com/oauth/authorize",
		TokenRequestURI:               "https://api.twitter.com/oauth/access_token",
		Credentials: oauth.Credentials{
			Token:  clientKey,
			Secret: clientSecret,
		},
	}
}

func GetTwitterUser(cred *oauth.Credentials, user *TwitterUser) error {
	client := GetTwitterClient()

	resp, err := client.Get(nil, cred, "https://api.twitter.com/1.1/account/verify_credentials.json", url.Values{})
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	err = json.NewDecoder(resp.Body).Decode(user)
	if err != nil {
		return err
	}

	return nil
}

// Client -> POST /auth/twitter -> reidect to twitter.com -> GET /auth/twitter?access_token
func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod == "POST" {
		client := GetTwitterClient()
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
		client := GetTwitterClient()
		tokenCred, _, err := client.RequestToken(nil, &oauth.Credentials{
			Token:  request.QueryStringParameters["oauth_token"],
			Secret: "",
		}, request.QueryStringParameters["oauth_verifier"])
		if err != nil {
			return events.APIGatewayProxyResponse{}, err
		}

		var account TwitterUser
		if err := GetTwitterUser(tokenCred, &account); err != nil {
			return events.APIGatewayProxyResponse{}, err
		}
		raw, _ := json.Marshal(map[string]interface{}{
			"credential": tokenCred.Token + "." + tokenCred.Secret,
			"account":    account,
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
