package google

import (
	"errors"

	"github.com/GoogleIdTokenVerifier/GoogleIdTokenVerifier"
)

type Token struct {
	Token string `json:"token"`
}

type Config struct {
	Token    Token
	ClientId string
}

type User struct {
	GoogleIdTokenVerifier.TokenInfo
}

func (client Config) GetGoogleUser(user *User) error {
	tokenInfo := GoogleIdTokenVerifier.Verify(client.Token.Token, client.ClientId)

	if tokenInfo == nil {
		return errors.New("Invalid GoogleToken")
	}

	*user = User{
		TokenInfo: *tokenInfo,
	}

	return nil
}
