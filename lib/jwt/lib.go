package jwt

import (
	"crypto/x509"
	"encoding/pem"
	"time"

	jwt "github.com/gbrlsnchs/jwt/v3"
)

type JwtPayload struct {
	jwt.Payload
	Data []byte `json:"data"`
}

type ISigner interface {
	Sign([]byte) ([]byte, error)
}

type ES256Signer struct {
	Key string
}

func (signer ES256Signer) Sign(payload []byte) ([]byte, error) {
	now := time.Now()
	block, _ := pem.Decode([]byte(signer.Key))
	privateKey, err := x509.ParseECPrivateKey(block.Bytes)
	es256 := jwt.NewECDSA(jwt.SHA256, privateKey, &privateKey.PublicKey)

	if err != nil {
		return nil, err
	}

	h := jwt.Header{
		KeyID:     "kid",
		Algorithm: "ES256",
		Type:      "JWT",
	}
	p := JwtPayload{
		Payload: jwt.Payload{
			Issuer:         "portals-me.com",
			ExpirationTime: now.Add(24 * 30 * time.Hour).Unix(),
			IssuedAt:       now.Unix(),
		},
		Data: payload,
	}

	return jwt.Sign(h, p, es256)
}

func (signer ES256Signer) Verify(token []byte) ([]byte, error) {
	now := time.Now()
	block, _ := pem.Decode([]byte(signer.Key))
	privateKey, err := x509.ParseECPrivateKey(block.Bytes)
	es256 := jwt.NewECDSA(jwt.SHA256, privateKey, &privateKey.PublicKey)

	raw, err := jwt.Parse(token)
	if err != nil {
		return nil, err
	}
	if err = raw.Verify(es256); err != nil {
		return nil, err
	}

	var p JwtPayload
	if _, err = raw.Decode(&p); err != nil {
		return nil, err
	}

	issValidator := jwt.IssuerValidator("portals-me.com")
	iatValidator := jwt.IssuedAtValidator(now)
	expValidator := jwt.ExpirationTimeValidator(now, true)
	if err := p.Validate(issValidator, iatValidator, expValidator); err != nil {
		return nil, err
	}

	return p.Data, nil
}
