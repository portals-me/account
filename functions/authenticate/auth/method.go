package auth

import (
	"github.com/guregu/dynamo"
)

type AuthMethod interface {
	// Returns idp ID
	obtainUserID(table dynamo.Table) (string, error)
}

// ---------------
// DynamoDB Record

type Record struct {
	ID        string `dynamo:"id"`
	Sort      string `dynamo:"sort"`
	CheckData string `dynamo:"check_data"`
}
