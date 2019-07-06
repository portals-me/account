package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/guregu/dynamo"
	"github.com/pkg/errors"

	"github.com/portals-me/account/lib/user"
)

var authTableName = os.Getenv("authTable")

func updateUser(authTable dynamo.Table, oldUser user.UserInfo, userInput user.UserInfo) error {
	if oldUser.Name != userInput.Name {
		if len(userInput.Name) < 3 {
			return errors.New("UserName too short")
		}

		if err := authTable.
			Update("id", oldUser.ID).
			Range("sort", "detail").
			Set("name", userInput.Name).
			Run(); err != nil {
			return err
		}
	}

	displayName := oldUser.DisplayName
	if userInput.DisplayName != "" {
		displayName = userInput.DisplayName
	}

	picture := oldUser.Picture
	if userInput.Picture != "" {
		picture = userInput.Picture
	}

	return authTable.
		Update("id", oldUser.ID).
		Range("sort", "detail").
		Set("display_name", displayName).
		Set("picture", picture).
		Run()
}

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	sess := session.Must(session.NewSession())
	db := dynamo.NewFromIface(dynamodb.New(sess))

	authTable := db.Table(authTableName)

	var userInput user.UserInfo
	if err := json.Unmarshal([]byte(request.Body), &userInput); err != nil {
		return events.APIGatewayProxyResponse{
			Body: err.Error(),
			Headers: map[string]string{
				"Access-Control-Allow-Origin": "*",
			},
			StatusCode: 400,
		}, nil
	}

	var oldUser user.UserInfo
	if err := authTable.
		Get("id", request.RequestContext.Authorizer["id"]).
		Range("sort", dynamo.Equal, "detail").
		Consistent(true).
		One(&oldUser); err != nil {
		fmt.Println(err.Error())
		panic("unreachable")
	}

	if err := updateUser(authTable, oldUser, userInput); err != nil {
		return events.APIGatewayProxyResponse{
			Body: err.Error(),
			Headers: map[string]string{
				"Access-Control-Allow-Origin": "*",
			},
			StatusCode: 400,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		Headers: map[string]string{
			"Access-Control-Allow-Origin": "*",
		},
		StatusCode: 204,
	}, nil
}

func main() {
	lambda.Start(handler)
}
