import { faker } from "@faker-js/faker";
import { AppUser, Prisma, PrismaClient } from "@prisma/client";
import axios from "axios";
import { TransactionManager } from "../services/transaction-manager.service";
import { Transactional } from "./transactional";

const prismaClient = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
  },
  log: [
    {
      level: "query",
      emit: "event",
    },
  ],
}); //.$extends(txPrismaExtension);

const transactionManager = new TransactionManager(prismaClient);

export class TestClass {
  private prismaService = new PrismaClient();

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredTest(
    user: AppUser,
    prisma: PrismaClient = this.prismaService
  ): Promise<AppUser> {
    return prisma.appUser.create({
      data: {
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
      },
    });
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredAttachToTransactionTest(
    foo: string,
    bar = 5,
    prisma: PrismaClient = this.prismaService
  ): Promise<void> {
    const firstname = faker.name.firstName() + foo;
    const lastname = faker.name.lastName();
    const email = faker.internet.email(firstname, lastname);
    const user = await prisma.appUser.create({
      data: {
        firstname,
        lastname,
        email,
      },
    });
    await this.requiredTest(user, prisma);
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredNestedRollbackTest(
    foo: string,
    errorToThrowInNestedMethod: Error,
    prisma: PrismaClient = this.prismaService
  ): Promise<void> {
    const firstname = faker.name.firstName() + foo;
    const lastname = faker.name.lastName();
    const email = faker.internet.email(firstname, lastname);
    const user = await prisma.appUser.create({
      data: {
        firstname,
        lastname,
        email,
      },
    });
    await this.requiredRollbackTest(user, errorToThrowInNestedMethod, prisma);
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiredRollbackTest(
    user: AppUser,
    errorToThrow: Error,
    prisma: PrismaClient
  ) {
    const updatedUser = await prisma.appUser.update({
      where: { id: user.id },
      data: {
        firstname: `${user.firstname}-II`,
      },
    });
    if (errorToThrow) {
      throw errorToThrow;
    }
    return updatedUser;
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiresNewTestWithOneNestedMethodCall(
    prismaClient: PrismaClient = this.prismaService
  ) {
    // create tom
    await prismaClient.appUser.create({
      data: {
        firstname: "Tom",
        lastname: "Felton",
        email: "tom.felton@superduper.com",
      },
    });

    // Create another person in the nested method in a saperate transaction
    // No matter if the code proceed
    const firstname = faker.name.firstName();
    const lastname = faker.name.lastName();
    const email = faker.internet.email(firstname, lastname);
    await this.requiresNewTestForSingleInsert(
      {
        firstname,
        lastname,
        email,
      } as AppUser,
      prismaClient
    );
  }

  @Transactional({ propagationType: "REQUIRED", prismaClient })
  public async requiresNewTestWithMultipleNestedMethodCalls() {
    Array.from({ length: 2 }, () => {
      const firstname = faker.name.firstName();
      const lastname = faker.name.lastName();
      const email = faker.internet.email(firstname, lastname);
      return {
        firstname,
        lastname,
        email,
      } as AppUser;
    }).forEach((user) => {
      this.requiresNewTestForSingleInsert(user, prismaClient);
    });
  }

  @Transactional({
    propagationType: "REQUIRES_NEW",
    prismaClient: prismaClient,
  })
  public async requiresNewTestForSingleInsert(
    appUser: AppUser,
    prisma: PrismaClient
  ) {
    return prisma.appUser.create({
      data: appUser,
    });
  }
}

describe("Transactional Integration Test", () => {
  const toTest = new TestClass();

  beforeEach(async () => {
    await prismaClient.appUser.deleteMany();
    // await prismaClient.$connect();
  });

  afterEach(async () => {
    await prismaClient.appUser.deleteMany();
    await prismaClient.$disconnect();
  });

  describe("REQUIRED test", () => {
    it(`should attach to pre existing transaction propagation type REQUIRED`, async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));

      await toTest.requiredAttachToTransactionTest("bar");
      expect(queryEvents.length).toBe(6);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toContain("INSERT");
      expect(queryEvents[4].query).toContain("SELECT");
      expect(queryEvents[5].query).toBe("COMMIT");
    });

    it(`should create new transaction for propagation type REQUIRED`, async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));
      const userArg = {
        id: 1n,
        email: "foo@bar.com",
        firstname: "andy",
        lastname: "Baum",
      };
      const user = await toTest.requiredTest(userArg);
      expect(user.firstname).toBe(userArg.firstname);
      expect(user.lastname).toBe(userArg.lastname);
      expect(user.email).toBe(userArg.email);
      expect(queryEvents.length).toBe(4);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toBe("COMMIT");
    });

    it(`should rollback the transaction if something failed in the nested method for propagation type REQUIRED`, async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));
      const expectedError = new Error("some Error");
      try {
        await toTest.requiredNestedRollbackTest("bar", expectedError);
      } catch (err) {
        expect(queryEvents.length).toBe(7);
        expect(queryEvents[0].query).toBe("BEGIN");
        expect(queryEvents[1].query).toContain("INSERT");
        expect(queryEvents[2].query).toContain("SELECT");
        expect(queryEvents[3].query).toContain("SELECT");
        expect(queryEvents[4].query).toContain("UPDATE");
        expect(queryEvents[5].query).toContain("SELECT");
        expect(queryEvents[6].query).toBe("ROLLBACK");

        const user = await prismaClient.appUser.findFirst();
        expect(user).toBeNull();
      }
    });
  });

  describe("REQUIRES_NEW test", () => {
    it("should create a separate transaction for inside nested method call", async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));
      await toTest.requiresNewTestWithOneNestedMethodCall();
      expect(queryEvents.length).toBe(8);
      // the first transaction 1
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      // the new created separate transaction tx 1a
      expect(queryEvents[3].query).toBe("BEGIN");
      expect(queryEvents[4].query).toContain("INSERT");
      expect(queryEvents[5].query).toContain("SELECT");
      expect(queryEvents[6].query).toBe("COMMIT");

      // end of first transaction
      expect(queryEvents[7].query).toBe("COMMIT");
    });

    it.skip("should create a separate transaction for each nested method call", async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));
      await toTest.requiresNewTestWithMultipleNestedMethodCalls();
      console.log(queryEvents.map((s) => s.query));
      expect(1).toBe(1);
    });
  });

  it.skip("should return the expected result", async () => {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const email = `${firstName}.${lastName}@${faker.internet.domainName()}`;

    // const tx = await prismaClient.$begin();

    // const user = await tx.appUser.create({
    //   data: {
    //     firstname: firstName,
    //     lastname: lastName,
    //     email: email,
    //   },
    // });

    const firstName2 = faker.name.firstName();
    const lastName2 = faker.name.lastName();
    const email2 = `${firstName}.${lastName}@${faker.internet.domainName()}`;

    // const user2 = await tx.appUser.create({
    //   data: {
    //     firstname: firstName2,
    //     lastname: lastName2,
    //     email: email2,
    //   },
    // });

    // await tx.$commit();
    // await prismaClient.$queryRaw`INSERT INTO app_user(id,firstname,lastname,email) VALUES('foo','peter','klaus','frida@boo.com') RETURNING id`;
    // console.log(user);
    // const userCount = await prismaClient.user.count();
    // toTest.nestedRequiredAnnotationTest();
    expect(1).toBe(1);
  });

  describe("learning test", () => {
    it("should rollback interactive transaction", async () => {
      const queryEvents: Prisma.QueryEvent[] = [];
      const expectedError = new Error("some Error");
      prismaClient.$on("query", (event) => queryEvents.push(event));
      await prismaClient
        .$transaction(
          async (txClient) => {
            // create twins on one transaction, either both or nobody
            const firstname = faker.name.firstName();
            const lastname = faker.name.lastName();
            const emailTwin1 = `${firstname}.${lastname}@${faker.internet.domainName()}`;
            const twin1 = await txClient.appUser.create({
              data: {
                firstname,
                lastname,
                email: emailTwin1,
              },
            });
            const firstname2 = faker.name.firstName();
            const emailTwin2 = `${firstname2}.${lastname}@${faker.internet.domainName()}`;
            const twin2 = await txClient.appUser.create({
              data: {
                firstname: firstname2,
                lastname: lastname,
                email: emailTwin2,
              },
            });
            throw new Error("some Error");
          },
          { timeout: 300000 }
        )
        .catch(async (err) => {
          expect(err.message).toBe(expectedError.message);
        });

      expect(queryEvents.length).toBe(6);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toContain("INSERT");
      expect(queryEvents[4].query).toContain("SELECT");
      expect(queryEvents[5].query).toBe("ROLLBACK");
      const user = await prismaClient.appUser.findFirst();

      expect(user).toBeNull();
    });

    it("testing out calling functions, which are assigned in a promise ", async () => {
      let commit: () => void;
      let rollback: () => void;

      const txPromise = new Promise((resolve, reject) => {
        commit = () => resolve("success");
        rollback = () => reject("failed");
      });

      const c = () => {
        commit();
      };
      const r = () => {
        rollback();
      };
      // c();
      r();
      await txPromise
        .then((s) => expect(s).toBe("success"))
        .catch((s) => expect(s).toBe("failed"));
    });

    it("create own proxy", () => {
      // define the Fake Proxy
      function FakeProxy(target: any, handler: any) {
        return {
          get: handler.get
            ? (property: any) => handler.get(target, property)
            : (property: any) => target[property],
          set: handler.set
            ? handler.set
            : (property: any, value: any) => (target[property] = value),
        };
      }

      // check with empty handler
      const myObject = {
        name: "Andy",
      };
      const emptyHandler = {};
      const myProxy = FakeProxy(myObject, emptyHandler);
      expect(myProxy.get("name")).toBe("Andy");
      myProxy.set("name", "Tom");
      expect(myProxy.get("name")).toBe("Tom");

      const myObject2 = {
        name: "Andy",
      };

      // check with non empty handler
      const handler = {
        get: (target: any, property: any) => {
          return `Hello ${target[property]}`;
        },
      };
      const myProxy2 = FakeProxy(myObject2, handler);
      expect(myProxy2.get("name")).toBe("Hello Andy"); // would be nicer to say myProxy2.name

      myProxy2.set("name", "Tom"); // would be nicer to say myProxy.name = 'Tom'
      expect(myProxy2.get("name")).toBe("Hello Tom");

      // proxy class from javascript provides these kind of better syntax
    });

    it("using javascript proxy", async () => {
      async function fetchCharacterFromAPI(id: number) {
        try {
          const character = await axios.get(
            `https://rickandmortyapi.com/api/character/${id}`
          );
          return character.data;
        } catch (err) {
          console.error(err);
          throw err;
        }
      }

      interface Character {
        id?: number;
        name: string;
        status: string;
        species: string;
        cachingTime?: Date;
      }

      interface CharacterCache {
        [key: number]: Character;
        getGreeting: () => string;
        getAsyncGreeting: () => Promise<string>;
      }

      const characterCache: CharacterCache = {
        getGreeting: (): string => {
          return "hello";
        },
        getAsyncGreeting: function (): Promise<string> {
          return new Promise((resolve) => {
            setTimeout(() => resolve("async hello"), 1000);
          });
        },
      };

      const cacheHandler: ProxyHandler<CharacterCache> = {
        get: (target: CharacterCache, prop: string) => {
          const isNumber = !isNaN(Number(prop));
          if (isNumber) {
            const id = Number(prop);
            if (target[id]) {
              return target[id];
            }
            return fetchCharacterFromAPI(Number(prop)).then((character) => {
              characterCache[id] = { ...character, cachingTime: new Date() };
              return characterCache[id];
            });
          } else {
            return target[prop as keyof typeof target];
          }
        },
        has: (target: CharacterCache, prop: string) => {
          const isNumber = !isNaN(Number(prop));
          if (isNumber) {
            return Number(prop) in target;
          }
          return prop in target;
        },
        set: (target: CharacterCache, prop: string, newValue: any) => {
          const isNumber = !isNaN(Number(prop));
          if (isNumber) {
            target[Number(prop)] = { ...newValue, cachingTime: new Date() };
            return true;
          }
          return false;
        },
      };

      const characterCacheProxy = new Proxy(characterCache, cacheHandler);
      // first call
      let character = await characterCacheProxy[1];
      expect(characterCache[1]).toBeDefined();
      expect(character).toMatchObject({
        id: 1,
        name: "Rick Sanchez",
        status: "Alive",
        species: "Human",
      });
      expect(character.cachingTime).toBeInstanceOf(Date);
      const greet = characterCacheProxy.getGreeting();
      expect(greet).toBe("hello");

      const asyncGreet = await characterCacheProxy.getAsyncGreeting();
      expect(asyncGreet).toBe("async hello");

      // second call
      character = await characterCacheProxy[1];
      expect(character).toMatchObject({
        id: 1,
        name: "Rick Sanchez",
        status: "Alive",
        species: "Human",
      });
      expect(character.cachingTime).toBeInstanceOf(Date);
      expect(1 in characterCacheProxy).toBeTruthy();
      expect(2 in characterCacheProxy).toBeFalsy();

      characterCacheProxy[-2] = {
        name: "foo",
        status: "alive",
        species: "human",
      };

      character = await characterCacheProxy[-2];

      expect(characterCache[-2]).toBeDefined();
      expect(character).toMatchObject({
        name: "foo",
        status: "alive",
        species: "human",
      });
      expect(character.cachingTime).toBeInstanceOf(Date);
    });
  });
});
