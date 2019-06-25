package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/pkg/errors"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	"github.com/guregu/dynamo"

	"github.com/portals-me/account/functions/authenticate/auth"
	"github.com/portals-me/account/lib/jwt"
	"github.com/portals-me/account/lib/user"
)

var authTableName = os.Getenv("authTable")
var jwtPrivateKey = os.Getenv("jwtPrivate")
var twitterClientKey = os.Getenv("twitterClientKey")
var twitterClientSecret = os.Getenv("twitterClientSecret")

// -----------------------
// Authentication part starts from here

type Input struct {
	AuthType string      `json:"auth_type"`
	Data     interface{} `json:"data"`
}

// Crate an Auth method from requestBody
// This function should an instance constructing function
func createAuthMethod(body string) (auth.AuthMethod, error) {
	var input Input
	if err := json.Unmarshal([]byte(body), &input); err != nil {
		return nil, errors.Wrap(err, "Unmarshal failed")
	}

	if input.AuthType == "password" {
		var password auth.Password

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &password); err != nil {
			return nil, errors.Wrap(err, "Unmarshal password failed")
		}

		return password, nil
	} else if input.AuthType == "twitter" {
		var credentials auth.TwitterCredentials

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &credentials); err != nil {
			return nil, errors.Wrap(err, "Unmarshal twitter failed")
		}

		return auth.Twitter{
			TwitterCredentials: credentials,
			ClientKey:          twitterClientKey,
			ClientSecret:       twitterClientSecret,
		}, nil
	}

	return nil, errors.New("Unsupported auth_type: " + input.AuthType)
}

func tryDecodeBase64(s string) string {
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return s
	}

	return string(decoded)
}

func createJwt(userInfo user.UserInfo) (string, error) {
	payload, err := json.Marshal(userInfo)
	if err != nil {
		panic(err)
	}

	signer := jwt.ES256Signer{
		Key: jwtPrivateKey,
	}
	token, err := signer.Sign(payload)
	if err != nil {
		return "", errors.Wrap(err, "sign failed")
	}

	return string(token), nil
}

/*	POST /authenticate

	expects Input
	returns String (jwt)
*/
func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// try base64 decoding
	body := tryDecodeBase64(request.Body)
	fmt.Println(body)

	method, err := createAuthMethod(body)
	if err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 400}, nil
	}

	sess := session.Must(session.NewSession())

	db := dynamo.NewFromIface(dynamodb.New(sess))
	authTable := db.Table(authTableName)

	// Get Idp ID
	idpID, err := method.ObtainUserID(authTable)
	if err != nil {
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
	jwt, err := createJwt(record.UserInfo)
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
