package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/guregu/dynamo"
	"github.com/pkg/errors"
	"github.com/satori/go.uuid"

	"github.com/portals-me/account/functions/signin/auth"
	"github.com/portals-me/account/lib/twitter"
	"github.com/portals-me/account/lib/user"
)

var authTableName = os.Getenv("authTable")
var jwtPrivateKey = os.Getenv("jwtPrivate")
var twitterClientKey = os.Getenv("twitterClientKey")
var twitterClientSecret = os.Getenv("twitterClientSecret")

type Input struct {
	AuthType string        `json:"auth_type"`
	Data     interface{}   `json:"data"`
	User     user.UserInfo `json:"user"`
}

// Similar to `createAuthMethod` function from signin
func createAuthMethod(body string) (auth.AuthMethod, user.UserInfo, error) {
	var input Input
	if err := json.Unmarshal([]byte(body), &input); err != nil {
		return nil, user.UserInfo{}, errors.Wrap(err, "Unmarshal failed")
	}

	if input.AuthType == "twitter" {
		var credentials twitter.Credentials

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &credentials); err != nil {
			return nil, user.UserInfo{}, errors.Wrap(err, "Unmarshal twitter failed")
		}

		return auth.TwitterClient{
			Config: twitter.Config{
				Credentials:  credentials,
				ClientKey:    twitterClientKey,
				ClientSecret: twitterClientSecret,
			},
		}, input.User, nil
	}

	return nil, user.UserInfo{}, errors.New("Unsupported auth_type: " + input.AuthType)
}

func tryDecodeBase64(s string) string {
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return s
	}

	return string(decoded)
}

/*	POST /authenticate

	expects Input
	returns String (jwt)
*/
func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// try base64 decoding
	body := tryDecodeBase64(request.Body)
	fmt.Println(body)

	method, userInfo, err := createAuthMethod(body)
	if err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 400}, nil
	}

	sess := session.Must(session.NewSession())

	db := dynamo.NewFromIface(dynamodb.New(sess))
	authTable := db.Table(authTableName)

	idpID := uuid.NewV4().String()
	userInfo.ID = idpID

	// Create a new user
	if err := method.CreateUser(authTable, userInfo); err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 400}, nil
	}

	// Get UserInfo from "detail" part
	var record user.UserInfoDDB
	if err := authTable.
		Get("id", idpID).
		Range("sort", dynamo.Equal, "detail").
		One(&record); err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 404}, nil
	}

	// Create JWT
	jwt, err := auth.CreateJwt(jwtPrivateKey, record.UserInfo)
	if err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 400}, nil
	}

	return events.APIGatewayProxyResponse{
		Body: jwt,
		Headers: map[string]string{
			"Access-Control-Allow-Origin": "*",
		},
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(handler)
}
