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

	"github.com/portals-me/account/functions/signin/auth"
	"github.com/portals-me/account/lib/google"
	"github.com/portals-me/account/lib/jwt"
	"github.com/portals-me/account/lib/twitter"
	"github.com/portals-me/account/lib/user"
)

var authTableName = os.Getenv("authTable")
var jwtPrivateKey = os.Getenv("jwtPrivate")
var twitterClientKey = os.Getenv("twitterClientKey")
var twitterClientSecret = os.Getenv("twitterClientSecret")
var googleClientId = os.Getenv("googleClientId")

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
		var credentials twitter.Credentials

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &credentials); err != nil {
			return nil, errors.Wrap(err, "Unmarshal twitter failed")
		}

		return auth.TwitterClient{
			Config: twitter.Config{
				Credentials:  credentials,
				ClientKey:    twitterClientKey,
				ClientSecret: twitterClientSecret,
			},
		}, nil
	} else if input.AuthType == "google" {
		var client google.Token

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &client); err != nil {
			return nil, errors.Wrap(err, "Unmarshal google failed")
		}

		return auth.GoogleClient{
			Config: google.Config{
				Token:    client,
				ClientId: googleClientId,
			},
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
		fmt.Printf("CreateAuthMethod: %+v\n", err.Error())
		return events.APIGatewayProxyResponse{Body: "Invalid Input", StatusCode: 400}, nil
	}

	sess := session.Must(session.NewSession())

	db := dynamo.NewFromIface(dynamodb.New(sess))
	authTable := db.Table(authTableName)

	// Get Idp ID
	idpID, err := method.ObtainUserID(authTable)
	if err != nil {
		fmt.Printf("ObtainUserID: %+v\n", err.Error())
		return events.APIGatewayProxyResponse{Body: "Invalid Input", StatusCode: 400}, nil
	}

	// Get UserInfo from "detail" part
	var record user.UserInfoDDB
	if err := authTable.
		Get("id", idpID).
		Range("sort", dynamo.Equal, "detail").
		One(&record); err != nil {
		fmt.Printf("Dynamo Get: %+v\n", err.Error())
		return events.APIGatewayProxyResponse{Body: "User not found", StatusCode: 404}, nil
	}

	// Create JWT
	jwt, err := createJwt(record.UserInfo)
	if err != nil {
		fmt.Printf("CreateJWT: %+v\n", err.Error())
		return events.APIGatewayProxyResponse{Body: "Failed to createJWT", StatusCode: 400}, nil
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
