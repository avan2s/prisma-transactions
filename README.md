# Prisma Transaction Library



## How to use

### Prerequisites

- Install [Node.js](https://nodejs.org/en/download/)
- Install [Docker](https://docs.docker.com/get-docker/)

### 1. Download example & install dependencies

Clone this repository:

```sh
git clone git@github.com:avan2s/prisma-transactions.git
```

install dependencies:

```sh
npm install
```

### 2. Start the database

Run the following command to start a new Postgres database in a Docker container:

```sh
docker compose up -d
```

### 3. Run migrations

Run this command to apply migrations to the database:

```sh
npx prisma migrate deploy
```

### 4. Run the `test` script

To test the transactional behaviour, run the following command:

```sh
npm run test
```



# Helpful links:
- https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#params
- https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#create-multiple-new-records
- https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#use



https://github.com/prisma/prisma/discussions/17928
## How to receive transaction id
- https://github.com/prisma/prisma/discussions/17959
- https://github.com/prisma/prisma/discussions/17788
- https://github.com/prisma/prisma/discussions/12373#discussioncomment-3909212
- https://github.com/prisma/prisma/issues/15212
- https://github.com/prisma/prisma/issues/15212

## Transaction inside transaction
- https://github.com/prisma/prisma/issues/9083
- https://github.com/prisma/prisma/discussions/10619

## TypeOrmSolution wit unit testing:
- https://github.com/odavid/typeorm-transactional-cls-hooked


## Prisma client type
https://github.com/prisma/prisma/discussions/18032