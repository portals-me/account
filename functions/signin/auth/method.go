package auth

import (
	"encoding/json"

	"github.com/guregu/dynamo"
	"github.com/pkg/errors"

	"github.com/portals-me/account/lib/jwt"
	"github.com/portals-me/account/lib/user"
)

type AuthMethod interface {
	// Returns idp ID
	ObtainUserID(table dynamo.Table) (string, error)

	// Create a user, returns Idp ID too
	CreateUser(table dynamo.Table, user user.UserInfo) (string, error)
}

// ---------------
// DynamoDB Record

type Record struct {
	ID        string `dynamo:"id"`
	Sort      string `dynamo:"sort"`
	CheckData string `dynamo:"check_data"`
}

func CreateJwt(jwtPrivateKey string, userInfo user.UserInfo) (string, error) {
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
