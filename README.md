# Prisma Transaction Propagation
This prisma extension helps handling transactions through method annotations. It is based on the idea of [Java Spring Transactional Propagations](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/annotation/Propagation.html). With these annotation you get full control over the transaction inside you methods.

## The problem in prisma transactions
Prisma supports [interactive transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions#interactive-transactions) and creates a transactional client. Every operation, which is part of this transaction must be performed with this prisma transactional client. This is fine, but often in a project you have the single responsibility principle where different services are performing different database operations or you just want to have more control over prisma transactional behaviour. Assume the following example:

Lets take a user service and an account service as an example. Both services have their own responsibility. Assume that the user- and account creation should be performed in the same transaction. The logic creating the user and the account should also be peformed in different services. With interactive transactions you must pass the transactional client through all methods, in order to attach to the same transaction:

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
             })
           // Here you must pass the txClient in order to make sure
           // both operations are running inside the same transaction 
           // UGLY AND ANNOYING!!!
            await this.accountService.createAccount(user.id, txClient);
           }
        );
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
- `NOT_SUPPORTED`: Execute non-transactionally, suspend the current transaction if one exists and will be executed in a non transactional context. This propagation will work like expected, but have in mind, that prisma model operations like `prisma.create` and `prisma.createMany` will still begin and commit a transaction from its nature. If you want to prevent creating a transaction completely use `prisma.$queryRaw`.  

### Not supported propagations
These propagations are currently not supported
- `NESTED`: Execute within a nested transaction if a current transaction exists, behave like REQUIRED otherwise.

### Prisma Raw query support
All the propagations working with the prisma model methods will also work with the `prisma.$queryRaw` method. 

## Solution for the example:
For the scenario above the solution would be as follows:

``` typescript
import { Transactional } from "./transactional";
class UserService {
    constructor(
        private prisma: IExtendedPrismaClient,
        private accountService: AccountService
    ) {}

    // This propation will start a new transaction, otherwise it will append to the current one
    @Transactional({propagation: "REQUIRED"})
    public async createUserWithAccount(): Promise<void> {
        const user = await prisma.user.create({
          data: {
            firstname: "John",
            lastname: "Doe",
            email: "John.Doe@gmail.com",
          }
        })
        await this.accountService.createAccount(user.id);
    }
}

class AccountService {
    constructor(private prisma: IExtendedPrismaClient) {}
    // this method will  append to the same transaction and use the same transaction client, 
    // when called from `UserService.createUserWithAccount`. If account creation went wrong, the 
    //created user will be rolled back, what we want
    @Transactional({propagation: "REQUIRED"}) 
    public async createAccount(userId: bigint): Promise<void> {
        await prisma.account.create({
            data: {
                userId: userId,
                accountNumber: "123-456"
            },
        });
    }
}

const accountService = new AccountService(prisma);
const userService = new UserService(prisma);
await userService.createUserWithAccount(); // This will run in the same transaction
```
Note that this is much more cleaner than the approach before. This is just a simple example and yes, you can create a user with an account directly with one command inside the `prisma.user.create` method. But often you have much more complicated scenarios and want to create separate transaction inside an already existing transaction (`REQUIRES_NEW`) or you just want to comply with the single responsibility principle. Your methods are called from everywhere and you just want to handle transactions in a clean way without passing the txClient through the whole world. If your method is called by different other methods, you will not know which one of them is running inside transaction, which not. This extension will make your life easier handling them.

## How it is doing this
This extension creates a proxy for all prisma models and the `prisma.$queryRaw` method. With nodeJs AsyncLocalStorage the current context will be picked. It is also thread safe because the `AsyncLocalStorage` from nodeJs will make sure that the TransactionContext with your propagation is hold in an own thread local variable. For more information see my `async-local-storage-learning.spec.ts` or the [nodejs documentation](https://nodejs.org/api/async_context.html#asynclocalstoragerunstore-callback-args) 

## Not supported actions
- Calling methods from multiple different Prisma Clients in the same annotated method will not work at all yet. So if you have a `prismaClient1` and a `prismaClient2` and you call both inside the same `@Transactional` annoted method, it will not work
- Make sure the end of the annotated method means, that all database operations are performed. Otherwise it can happen, that a transaction will be commited to early. So make sure you are awaiting until all database operations are performed
- This extension only supports the default prisma model methods and the prisma `$executeRaw` methods. If you want to extend the transactional propagation behaviour with your own methods, check the code inside this repository, how the methods are proxied.


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

# Developer guide for this extension
## Prerequisites

- Install [Node.js](https://nodejs.org/en/download/)
- Install [Docker](https://docs.docker.com/get-docker/)

## 1. Download example & install dependencies

Clone this repository:

```sh
git clone git@github.com:avan2s/prisma-transactions.git
```

install dependencies:

```sh
npm install
```

## 2. Start the database
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
npm run test:watch
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



<style>
.warning {
  color: #f39c12;
  background-color: #fef8e7;
  border: 1px solid #f1c40f;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}
</style>
