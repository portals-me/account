package auth

import (
	"errors"
	"github.com/guregu/dynamo"

	"github.com/portals-me/account/lib/twitter"
	"github.com/portals-me/account/lib/user"
)

type TwitterClient struct {
	twitter.Config
}

func (client TwitterClient) ObtainUserID(table dynamo.Table) (string, error) {
	var user twitter.User
	if err := client.GetTwitterUser(&user); err != nil {
		return "", err
	}

	var record Record
	if err := table.
		Get("sort", "twitter##"+user.ID).
		Index("auth").
		One(&record); err != nil {
		return "", errors.New("Twitter user not found: " + user.ID)
	}

	return record.ID, nil
}

func (client TwitterClient) CreateUser(table dynamo.Table, user user.UserInfo) error {
	var twitterUser twitter.User
	if err := client.GetTwitterUser(&twitterUser); err != nil {
		return err
	}

	// Check if the account already exists
	var records []Record
	if err := table.
		Get("sort", "twitter##"+twitterUser.ID).
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
			"sort": "twitter##" + twitterUser.ID,
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
