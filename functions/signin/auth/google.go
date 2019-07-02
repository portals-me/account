package auth

import (
	"errors"
	"github.com/guregu/dynamo"

	"github.com/portals-me/account/lib/google"
	"github.com/portals-me/account/lib/user"
)

type GoogleClient struct {
	google.Config
}

func (client GoogleClient) ObtainUserID(table dynamo.Table) (string, error) {
	var user google.User

	if err := client.GetGoogleUser(&user); err != nil {
		return "", err
	}

	var record Record
	if err := table.
		Get("sort", "google##"+user.Sub).
		Index("auth").
		One(&record); err != nil {
		return "", errors.New("Twitter user not found: " + user.Sub)
	}

	return record.ID, nil
}

func (client GoogleClient) CreateUser(table dynamo.Table, user user.UserInfo) error {
	var googleUser google.User
	if err := client.GetGoogleUser(&googleUser); err != nil {
		return err
	}

	// Check if the account already exists
	var records []Record
	if err := table.
		Get("sort", "google##"+googleUser.Sub).
		Index("auth").
		All(&records); err != nil {
		return err
	}

	if len(records) != 0 {
		return errors.New("The account already exists")
	}

	// Check if the name is unique
	var selectName []interface{}
	if err := table.
		Get("name", user.Name).
		Index("name").
		All(&selectName); err != nil {
		return err
	}

	if len(selectName) != 0 {
		return errors.New("Name already exists")
	}

	if err := table.
		Put(map[string]interface{}{
			"id":   user.ID,
			"sort": "google##" + googleUser.Sub,
		}).
		If("attribute_not_exists(id)").
		Run(); err != nil {
		return err
	}

	if err := table.Put(user.ToDDB()).Run(); err != nil {
		return err
	}

	return nil
}
