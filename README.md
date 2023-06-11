# Prisma Transaction Propagation
This prisma extension helps handling transactions through method annotations. It is based on the idea of [Java Spring Transactional Propagations](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/annotation/Propagationj.html).

With these annotation you get full control over the transaction inside you methods.

## The problem in prisma transactions
Prisma supports [interactive transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions#interactive-transactions) and creates a transactional client. Every operation, which is part of this transaction must be performed with this prisma transactional client. This is fine, but often in a project you have the single responsibility principle where different services are performing different database operations. Lets take a user service and an account service as an example. Both services have their own responsibility. Assume that the user- and account creation should be performed in the same transaction. The logic creating the user and the account should also be peformed in different services. With interactive transactions you must pass the transactional client through all methods, in order to attach to the same transaction:

```typescript
// Example with interactive transactions:
class UserService {
    constructor(
        private prisma: IExtendedPrismaClient,
        private postService: PostService
    ) {}

    // Goal: create a user with an account in the same transaction
    public async createUserWithAccount(): Promise<void> {
        const user = await prisma
        .$transaction(
            async (txClient) => {
                txClient.user.create({
                data: {
                    firstname: "John",
                    lastname: "Doe",
                    email: "John.Doe@gmail.com",
                },
            }));
        // Here you must pass the txClient in order to make sure
        // both operations are running inside the same transaction
        // UGLY AND ANNOYING!!!
        await this.accountService.createAccount(user.id, txClient);
    }
}

class AccountService {
    constructor(private prisma: IExtendedPrismaClient) {}
    // this creates an account, but requires the 
    public async createAccount(userId: bigint, 
        prisma: Prisma.TransactionClient | PrismaClient = this.prisma): Promise<void> {
        await prisma.account.create({
            data: {
                userId: userId,
                accountNumber: "123-456"
            },
        });
    }
}
```
In this example you see that the account Service has an optional parameter, where the caller can pass an transactional client. Per default the standard prisma client will be used. This will make sure that the `UserService` can pass the transaction client to the account Service and will create the account in the same transaction. But it is only working if you do NOT forget passing the transaction client.

Several issues here:
- you do not have to forget to pass the prisma transactional client to the method - Everytime!
- The `Accountservice` 's methods are strongly coupled through the prisma client instances and if you define an interface `IAccountService` you are enforced to fill up your methods with unnessessary parameters, just for passing the prisma transaction client - Everytime in the same way!
- If you have multiple nested services, this becomes a mess 
- If you really want to create a new separate transaction, you must not set the parameter for the transactional client. This is not explicit enough and can be confusing maintaing the code over several weeks - when sometimes the parameter is set and sometimes not


## Solution - prisma transaction propagation extension
This extension resolves this issues by introducing the concept of Java's Transactional Propagation into prisma. You just have to annotate the method with `@Transactional` and pass the progagation as a parameter.

### Supported Propagations
The following propagations are supported:
- `REQUIRED`: Support a current transaction, create a new one if none exists. (default)
- `REQUIRES_NEW`: Create a new transaction, and suspend the current transaction if one exists.
- `SUPPORTS`: Support a current transaction, execute non-transactionally if none exists.
- `MANDATORY`: Support a current transaction, throw an exception if none exists.
- `NEVER`: Execute non-transactionally, throw an exception if a transaction exists.

### Partial supported propagations through prisma restrictions
The following propagations are working like expected, but will not make sure, that the M exactly like Java's propagations:
- `NOT_SUPPORTED`: Execute non-transactionally, suspend the current transaction if one exists. The  

The `NOT_SUPPORTED` propagation will work like expected, but have in mind, that prisma model operations like `prisma.create` and `prisma.createMany` will still begin and commit a transaction from its nature. It will not make any issues and affect the behaviour. If you really  

### Not supported propagations
These propagations are currently not supported
- `NESTED`: Execute within a nested transaction if a current transaction exists, behave like REQUIRED otherwise.

### Prisma Raw query support
All the propagations working with the prisma model methods will also work with the `prisma.$queryRaw` method. 

## How it is doing this
This extension creates a proxy for all prisma models and the `prisma.$queryRaw` method. With nodeJs AsyncLocalStorage the current context will be picked 

## Not supported actions
- Calling multiple different Prisma Clients in the same annotated method will not work at all yet
- Make sure the end of the annotated method means, that all database operations are performed. Otherwise it can happen, that a transaction will be commited to early. So make sure you are awaiting until all database operations are performed
- This extension only supports the default prisma model methods and the prisma `$executeRaw` methods. If you want to extend this behaviour with your own methods, check the code inside this repository, how the methods are proxied.


## Installation

### Install the library
```
npm i prisma-extension-transactional-propagation
```
### Extend the prisma client
This extension consists of two extensions. They must be installed at last in order to make the proxy methods working correctly.


``` typescript
import { TransactionPropagation } from "../interfaces";
import prismaTxClientExtension from "../services/prisma-tx-client-extension";
import { prismaTxPropagationExtension } from "../services/prisma-tx-propagation-extension";
import { Transactional } from "./transactional"

function createPrismaTestClient() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
    }
  })
    .$extends(prismaTxClientExtension)
    .$extends(prismaTxPropagationExtension);
  return prisma;
}

// optional type if you need it
export type IExtendedPrismaClient = ReturnType<typeof createPrismaTestClient>;

const prisma: IExtendedPrismaClient = createPrismaTestClient();
```


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
- https://github.com/prisma/prisma/discussions/17928
## How to receive transaction id
- https://github.com/prisma/prisma/discussions/17959
- https://github.com/prisma/prisma/discussions/17788
- https://github.com/prisma/prisma/discussions/12373#discussioncomment-3909212
- https://github.com/prisma/prisma/issues/15212
- https://github.com/prisma/prisma/issues/15212

## Transaction inside transaction
- https://github.com/prisma/prisma/issues/9083
- https://github.com/prisma/prisma/discussions/10619
- https://github.com/prisma/prisma/discussions/12373

## TypeOrmSolution wit unit testing:
- https://github.com/odavid/typeorm-transactional-cls-hooked


## Prisma client type
- https://github.com/prisma/prisma/discussions/18032

## prisma model and function types
- https://github.com/prisma/prisma/discussions/18216
- https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/operating-against-partial-structures-of-model-types#problem-using-variations-of-the-generated-model-type
- https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/prisma-validator#combining-prismavalidator-with-form-input
- https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/operating-against-partial-structures-of-model-types#problem-getting-access-to-the-return-type-of-a-function
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy
- https://stackoverflow.com/questions/24143973/npm-adduser-via-bash
- https://verdaccio.org/docs/best/

## share and publish prisma client extensions
- https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions/shared-extensions#package-an-extension



```




: I.e you want to create a user and a account in a single transaction you would use interactive transactions in the folowing way:

```
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function transfer(from: string, to: string, amount: number) {
  return await prisma.$transaction(async (tx) => {
    // 1. Decrement amount from the sender.
    const sender = await tx.account.update({
      data: {
        balance: {
          decrement: amount,
        },
      },
      where: {
        email: from,
      },
    })

    // 2. Verify that the sender's balance didn't go below zero.
    if (sender.balance < 0) {
      throw new Error(`${from} doesn't have enough to send ${amount}`)
    }

    // 3. Increment the recipient's balance by amount
    const recipient = await tx.account.update({
      data: {
        balance: {
          increment: amount,
        },
      },
      where: {
        email: to,
      },
    })

    return recipient
  })
}

async function main() {
  // This transfer is successful
  await transfer('alice@prisma.io', 'bob@prisma.io', 100)
  // This transfer fails because Alice doesn't have enough funds in her account
  await transfer('alice@prisma.io', 'bob@prisma.io', 100)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
```

Die Kontrolle darüber:
- Soll eine 


https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/annotation/Propagation.html

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
- https://github.com/prisma/prisma/discussions/17928
## How to receive transaction id
- https://github.com/prisma/prisma/discussions/17959
- https://github.com/prisma/prisma/discussions/17788
- https://github.com/prisma/prisma/discussions/12373#discussioncomment-3909212
- https://github.com/prisma/prisma/issues/15212
- https://github.com/prisma/prisma/issues/15212

## Transaction inside transaction
- https://github.com/prisma/prisma/issues/9083
- https://github.com/prisma/prisma/discussions/10619
- https://github.com/prisma/prisma/discussions/12373

## TypeOrmSolution wit unit testing:
- https://github.com/odavid/typeorm-transactional-cls-hooked


## Prisma client type
- https://github.com/prisma/prisma/discussions/18032

## prisma model and function types
- https://github.com/prisma/prisma/discussions/18216
- https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/operating-against-partial-structures-of-model-types#problem-using-variations-of-the-generated-model-type
- https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/prisma-validator#combining-prismavalidator-with-form-input
- https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/operating-against-partial-structures-of-model-types#problem-getting-access-to-the-return-type-of-a-function
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy
- https://stackoverflow.com/questions/24143973/npm-adduser-via-bash
- https://verdaccio.org/docs/best/

## share and publish prisma client extensions
- https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions/shared-extensions#package-an-extension


