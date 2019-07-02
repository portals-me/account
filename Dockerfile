FROM node:10-slim

RUN apt-get update && \
  apt-get install -y golang-go git zip
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

RUN mkdir -p "$GOPATH/src" "$GOPATH/bin" && \
  chmod -R 777 "$GOPATH" && \
  go get golang.org/dl/go1.12 && \
  go1.12 download && \
  ln -sf go1.12 /go/bin/go

RUN curl -fsSL https://get.pulumi.com | sh
ENV PATH /root/.pulumi/bin:$PATH
