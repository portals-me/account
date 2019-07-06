package main

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

var authTableName = os.Getenv("authTable")

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	//	sess := session.Must(session.NewSession())

	//	db := dynamo.NewFromIface(dynamodb.New(sess))
	//	authTable := db.Table(authTableName)

	fmt.Printf("%+v\n", request)

	return events.APIGatewayProxyResponse{
		Body: "",
		Headers: map[string]string{
			"Access-Control-Allow-Origin": "*",
		},
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(handler)
}
