package auth

import (
	"github.com/guregu/dynamo"
	"github.com/pkg/errors"

	"github.com/portals-me/account/lib/bcrypt"
	"github.com/portals-me/account/lib/user"
)

// ----------------
// User account with password implementation

type Password struct {
	UserName string `json:"user_name"`
	Password string `json:"password"`
}

func (password Password) ObtainUserID(table dynamo.Table) (string, error) {
	var record Record
	if err := table.
		Get("sort", "name-pass##"+password.UserName).
		Index("auth").
		One(&record); err != nil {
		return "", errors.New("UserName not found: " + password.UserName)
	}

	if err := bcrypt.VerifyPassword(record.CheckData, password.Password); err != nil {
		return "", errors.Wrap(err, "Invalid Password")
	}

	return record.ID, nil
}

func (password Password) CreateUser(table dynamo.Table, user user.UserInfo) error {
	return errors.New("Not implemented yet")
}
