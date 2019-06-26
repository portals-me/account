package auth

import (
	"encoding/json"
	"errors"
	"net/url"

	"github.com/gomodule/oauth1/oauth"
	"github.com/guregu/dynamo"
)

// ----------------------
// Twitter implementation

type TwitterCredentials struct {
	CredentialToken  string `json:"credential_token"`
	CredentialSecret string `json:"credential_secret"`
}

type Twitter struct {
	TwitterCredentials
	ClientKey    string
	ClientSecret string
}

type TwitterUser struct {
	ID              string `json:"id_str"`
	ScreenName      string `json:"screen_name"`
	ProfileImageURL string `json:"profile_image_url"`
}

func GetTwitterClient(twitterClientKey string, twitterClientSecret string) *oauth.Client {
	return &oauth.Client{
		TemporaryCredentialRequestURI: "https://api.twitter.com/oauth/request_token",
		ResourceOwnerAuthorizationURI: "https://api.twitter.com/oauth/authorize",
		TokenRequestURI:               "https://api.twitter.com/oauth/access_token",
		Credentials: oauth.Credentials{
			Token:  twitterClientKey,
			Secret: twitterClientSecret,
		},
	}
}

func (twitter Twitter) GetTwitterUser(user *TwitterUser) error {
	cred := oauth.Credentials{
		Token:  twitter.CredentialToken,
		Secret: twitter.CredentialSecret,
	}

	client := GetTwitterClient(twitter.ClientKey, twitter.ClientSecret)
	resp, err := client.Get(nil, &cred, "https://api.twitter.com/1.1/account/verify_credentials.json", url.Values{})
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	err = json.NewDecoder(resp.Body).Decode(user)
	if err != nil {
		return err
	}

	return nil
}

func (twitter Twitter) ObtainUserID(table dynamo.Table) (string, error) {
	var user TwitterUser
	if err := twitter.GetTwitterUser(&user); err != nil {
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
