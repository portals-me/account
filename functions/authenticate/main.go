package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"os"

	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/pkg/errors"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	"github.com/guregu/dynamo"

	"github.com/gomodule/oauth1/oauth"
	"github.com/portals-me/account/functions/authenticate/account"
	. "github.com/portals-me/account/functions/authenticate/lib"
)

var authTableName = os.Getenv("authTable")
var jwtPrivateKey = os.Getenv("jwtPrivate")
var twitterClientKey = os.Getenv("twitterClientKey")
var twitterClientSecret = os.Getenv("twitterClientSecret")

// ---------------
// DynamoDB Record

type Record struct {
	ID        string `dynamo:"id"`
	Sort      string `dynamo:"sort"`
	CheckData string `dynamo:"check_data"`
}

// ----------------
// User account with password implementation

type Password struct {
	UserName string `json:"user_name"`
	Password string `json:"password"`
}

func (password Password) createJwt(table dynamo.Table) (string, error) {
	var record Record
	if err := table.
		Get("sort", "name-pass##"+password.UserName).
		Index("auth").
		One(&record); err != nil {
		return "", errors.New("UserName not found: " + password.UserName)
	}

	if err := VerifyPassword(record.CheckData, password.Password); err != nil {
		return "", errors.Wrap(err, "Invalid Password")
	}

	payload, err := json.Marshal(account.Account{
		ID:       record.ID,
		UserName: password.UserName,
	})
	if err != nil {
		panic(err)
	}

	signer := ES256Signer{
		Key: jwtPrivateKey,
	}
	token, err := signer.Sign(payload)
	if err != nil {
		return "", errors.Wrap(err, "sign failed")
	}

	return string(token), nil
}

// ----------------------
// Twitter implementation

type Twitter struct {
	CredentialToken  string `json:"credential_token"`
	CredentialSecret string `json:"credential_secret"`
}

type TwitterUser struct {
	ID              string `json:"id_str"`
	ScreenName      string `json:"screen_name"`
	ProfileImageURL string `json:"profile_image_url"`
}

func GetTwitterClient() *oauth.Client {
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

	client := GetTwitterClient()
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

func (twitter Twitter) createJwt(table dynamo.Table) (string, error) {
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

	payload, err := json.Marshal(account.Account{
		ID:       record.ID,
		UserName: user.ScreenName,
	})
	if err != nil {
		panic(err)
	}

	signer := ES256Signer{
		Key: jwtPrivateKey,
	}
	token, err := signer.Sign(payload)
	if err != nil {
		return "", errors.Wrap(err, "sign failed")
	}

	return string(token), nil
}

// -----------------------
// Authentication part starts from here

type AuthMethod interface {
	createJwt(table dynamo.Table) (string, error)
}

type Input struct {
	AuthType string      `json:"auth_type"`
	Data     interface{} `json:"data"`
}

// Crate an Auth method from requestBody
// This function should an instance constructing function
func createAuthMethod(body string) (AuthMethod, error) {
	var input Input
	if err := json.Unmarshal([]byte(body), &input); err != nil {
		return nil, errors.Wrap(err, "Unmarshal failed")
	}

	if input.AuthType == "password" {
		var password Password

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &password); err != nil {
			return nil, errors.Wrap(err, "Unmarshal password failed")
		}

		return password, nil
	} else if input.AuthType == "twitter" {
		var twitter Twitter

		data, _ := json.Marshal(input.Data)
		if err := json.Unmarshal([]byte(data), &twitter); err != nil {
			return nil, errors.Wrap(err, "Unmarshal twitter failed")
		}

		return twitter, nil
	}

	return nil, errors.New("Unsupported auth_type: " + input.AuthType)
}

func tryDecodeBase64(s string) string {
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return s
	}

	return string(decoded)
}

/*	POST /authenticate

	expects Input
	returns String (jwt)
*/
func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// try base64 decoding
	body := tryDecodeBase64(request.Body)
	fmt.Println(body)

	method, err := createAuthMethod(body)
	if err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 400}, nil
	}

	sess := session.Must(session.NewSession())

	db := dynamo.NewFromIface(dynamodb.New(sess))
	authTable := db.Table(authTableName)

	jwt, err := method.createJwt(authTable)
	if err != nil {
		return events.APIGatewayProxyResponse{Body: err.Error(), StatusCode: 400}, nil
	}

	return events.APIGatewayProxyResponse{
		Body: jwt,
		Headers: map[string]string{
			"Access-Control-Allow-Origin": "*",
		},
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(handler)
}
