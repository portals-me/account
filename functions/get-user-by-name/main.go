package main

import (
	"context"
	"encoding/json"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/guregu/dynamo"
)

type UserID struct {
	ID   string `json:"id" dynamo:"id"`
	Name string `json:"name" dynamo:"name"`
}

var authTableName = os.Getenv("authTable")

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	sess := session.Must(session.NewSession())

	db := dynamo.NewFromIface(dynamodb.New(sess))
	authTable := db.Table(authTableName)

	var record UserID
	if err := authTable.
		Get("name", request.PathParameters["name"]).
		Index("name").
		One(&record); err != nil {
		if err == dynamo.ErrNotFound {
			return events.APIGatewayProxyResponse{
				Body: "User not found",
				Headers: map[string]string{
					"Access-Control-Allow-Origin": "*",
				},
				StatusCode: 404,
			}, nil
		}

		return events.APIGatewayProxyResponse{}, err
	}

	raw, err := json.Marshal(record)
	if err != nil {
		return events.APIGatewayProxyResponse{}, err
	}

	return events.APIGatewayProxyResponse{
		Body: string(raw),
		Headers: map[string]string{
			"Access-Control-Allow-Origin": "*",
		},
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(handler)
}
