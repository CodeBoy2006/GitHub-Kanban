# ---- Stage 1: build fuck-u-code binary ----
FROM golang:1.23-alpine AS fuc-build
RUN apk add --no-cache git ca-certificates && update-ca-certificates
ENV CGO_ENABLED=0 GO111MODULE=on GOBIN=/out
RUN go install github.com/Done-0/fuck-u-code/cmd/fuck-u-code@latest

# ---- Stage 2: app runtime ----
FROM denoland/deno:alpine

# basic tools
RUN apk add --no-cache git ca-certificates bash && update-ca-certificates

# app dir
WORKDIR /app

# copy fuck-u-code binary
COPY --from=fuc-build /out/fuck-u-code /usr/local/bin/fuck-u-code

# copy source
COPY . .

# ports (env 覆盖)
ENV PORT=8000
EXPOSE 8000

# cache deps
RUN deno cache src/main.ts

RUN mkdir -p /app/.audit/repos \
    && chown -R deno:deno /app

CMD ["deno", "run", "-A", "--no-lock", "src/main.ts"]