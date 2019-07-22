package user

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/guregu/dynamo"
)

// DynamoDB record compatible UserInfo
type UserInfoDDB struct {
	UserInfo
	Sort string `dynamo:"sort"`
}

type UserInfo struct {
	ID          string `json:"id" dynamo:"id"`
	Name        string `json:"name" dynamo:"name"`
	Picture     string `json:"picture" dynamo:"picture"`
	DisplayName string `json:"display_name" dynamo:"display_name"`
}

func (userInfo UserInfo) ToDDB() UserInfoDDB {
	return UserInfoDDB{
		UserInfo: userInfo,
		Sort:     "detail",
	}
}

func Validate(authTable dynamo.Table, newUser UserInfo) error {
	if len(newUser.Name) < 3 {
		return errors.New("UserName too short")
	}

	if !regexp.MustCompile(`^[A-Za-z0-9_]*$`).MatchString(newUser.Name) {
		return errors.New("Invalid UserName")
	}

	var records []UserInfo
	if err := authTable.
		Get("name", newUser.Name).
		Index("name").
		All(&records); err != nil {
		fmt.Printf("%+v\n", err)
		return errors.New("Something went wrong")
	}

	for _, record := range records {
		if record.ID != newUser.ID {
			return errors.New("UserName already exists")
		}
	}

	if newUser.DisplayName == "" || newUser.Picture == "" {
		return errors.New("Empty field is not acceptable")
	}

	return nil
}

// -- User Repository --

type Repository struct {
	table dynamo.Table
}

func NewRepository(table dynamo.Table) Repository {
	return Repository{
		table: table,
	}
}

// Get user object by ID
func (repo Repository) Get(userID string, user *UserInfo) error {
	return repo.table.
		Get("id", userID).
		Range("sort", dynamo.Equal, "detail").
		Consistent(true).
		One(user)
}

// Put user object
// domain string: the prefix domain for the picture
func (repo Repository) Put(user UserInfo, domain string) error {
	// check picture domain prefix
	if !strings.HasPrefix(user.Picture, domain) {
		return errors.New("Unexpected domain: " + user.Picture)
	}

	if err := Validate(repo.table, user); err != nil {
		return err
	}

	return repo.table.Put(user.ToDDB()).Run()
}
