package twitter

import (
	"encoding/json"
	"net/url"

	"github.com/gomodule/oauth1/oauth"
)

type Credentials struct {
	CredentialToken  string `json:"credential_token"`
	CredentialSecret string `json:"credential_secret"`
}

type Config struct {
	Credentials
	ClientKey    string
	ClientSecret string
}

type User struct {
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

func (twitter Config) GetTwitterUser(user *User) error {
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
