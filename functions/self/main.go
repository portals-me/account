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

	"github.com/portals-me/account/lib/user"
)

var authTableName = os.Getenv("authTable")

func updateUser(authTable dynamo.Table, oldUser user.UserInfo, newUser user.UserInfo) error {
	fmt.Printf("%+v\n", oldUser)
	fmt.Printf("%+v\n", newUser)

	newUser.ID = oldUser.ID
	if newUser.Name == "" {
		newUser.Name = oldUser.Name
	}
	if newUser.Picture == "" {
		newUser.Picture = oldUser.Picture
	}
	if newUser.DisplayName == "" {
		newUser.DisplayName = oldUser.DisplayName
	}

	if err := user.Validate(authTable, oldUser, newUser); err != nil {
		return err
	}

	if err := authTable.Put(newUser.ToDDB()).Run(); err != nil {
		return err
	}

	return nil
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
		fmt.Println(err.Error())

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
