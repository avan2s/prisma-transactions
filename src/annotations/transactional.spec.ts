import { AppUser, Prisma, PrismaClient } from "@prisma/client";

import { TransactionPropagation } from "../interfaces";
import prismaTxClientExtension from "../services/prisma-tx-client-extension";
import { prismaTxPropagationExtension } from "../services/prisma-tx-propagation-extension";
import { Transactional } from "./transactional";
import { EventEmitter } from "events";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const queryEvents: Prisma.QueryEvent[] = [];
function createPrismaTestClient() {
  const basePrisma = new PrismaClient({
    datasources: {
      db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
    },
    log: [
      {
        level: "query",
        emit: "event",
      },
    ],
  });
  basePrisma.$on("query", (event) => {
    queryEvents.push(event);
  });
  return basePrisma
    .$extends(prismaTxClientExtension)
    .$extends(prismaTxPropagationExtension);
}

export type IExtendedPrismaClient = ReturnType<typeof createPrismaTestClient>;

export type AppUserWithoutId = Omit<AppUser, "id">;

describe("Transactional Integration Test", () => {
  const prismaClient = createPrismaTestClient();

  const verifyQueryEvents = (
    events: Prisma.QueryEvent[],
    expectedQuerys: string[]
  ) => {
    expectedQuerys.forEach((expectedQuery, i) => {
      expect(events[i].query).toContain(expectedQuery);
    });
    expect(events.length).toBe(expectedQuerys.length);
  };

  beforeAll(async () => {
    await prismaClient.$connect();
  });

  beforeEach(async () => {
    await prismaClient.post.deleteMany();
    await prismaClient.appUser.deleteMany();
    queryEvents.splice(0, queryEvents.length);
  });

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  afterEach(async () => {
    await prismaClient.post.deleteMany();
    await prismaClient.appUser.deleteMany();
    queryEvents.splice(0, queryEvents.length);
  });

  describe("REQUIRED test", () => {
    it(`should create user inside a transactional context`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 600000 })
        public async createUser(user: AppUserWithoutId): Promise<AppUser> {
          const userResult = this.prisma.appUser.create({
            data: {
              firstname: user.firstname,
              lastname: user.lastname,
              email: user.email,
            },
          });

          return userResult;
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUser({
        email: "foo@bar.de",
        firstname: "John",
        lastname: "Doe",
      });

      verifyQueryEvents(queryEvents, ["BEGIN", "INSERT","COMMIT"]);
    });

    it(`should execute $queryRaw inside transactional context`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 60000 })
        public async select(): Promise<void> {
          return this.prisma
            .$queryRaw`INSERT into app_user(firstname, lastname,email) VALUES('Andy','Foo', 'Andy.Foo@gmail.com')`;
        }
      }
      const toTest = new TestClass(prismaClient);
      await toTest.select();

      const user = await prismaClient.appUser.findFirstOrThrow({
        select: { firstname: true },
      });
      expect(user.firstname).toBe("Andy");
    });

    it(`should attach to pre existing transaction`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 520000 })
        public async createUser(): Promise<void> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createPost(user);
        }

        @Transactional({ propagationType: "REQUIRED" })
        public async createPost(user: AppUser) {
          return await this.prisma.post.create({
            data: {
              comment: `comment 1`,
              userId: user.id,
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUser();
      // console.log(queryEvents.map((e) => e.query));

      verifyQueryEvents(queryEvents, [
        "BEGIN",
        "INSERT",
        "INSERT",
        "COMMIT",
      ]);
    });

    it(`should create 1 user and 5 Posts in sequence in same transaction`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 520000 })
        public async createUser(): Promise<void> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          for (let i = 1; i <= 5; i++) {
            await this.createPost(user, i);
          }
        }

        @Transactional({ propagationType: "REQUIRED" })
        public async createPost(user: AppUser, n: number) {
          return await this.prisma.post.create({
            data: {
              comment: `comment ${n}`,
              userId: user.id,
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUser();
      // console.log(queryEvents.map((e) => e.query));

      const inserts = Array.from<string>({length: 6}).fill("INSERT");
      verifyQueryEvents(queryEvents, ["BEGIN"].concat(inserts).concat(["COMMIT"]));
    });

    it(`should create 5 users in parallel inside same transaction`, async () => {
      const numberOfUsers = 5;
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createUsers(): Promise<void> {
          const userPromises = Array.from({ length: numberOfUsers }, (_, i) => {
            return this.prisma.appUser.create({
              data: {
                firstname: `John${i + 1}`,
                lastname: "Doe",
                email: `John${i + 1}.Doe@gmail.com`,
              },
            });
          });

          await Promise.all(userPromises);
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUsers();
      const inserts = Array.from<string>({length: numberOfUsers}).fill("INSERT");
      verifyQueryEvents(queryEvents, ["BEGIN"].concat(inserts).concat("COMMIT"));

      // console.log(queryEvents.map((e) => e.query));
      expect(await prismaClient.appUser.count()).toBe(numberOfUsers);
    });

    it(`should create two users in the same transaction with 2 calls from prisma.user.create in the same method`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 520000 })
        public async createUsers(): Promise<void> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });

          // await txContext?.txClient?.appUser.create({  // working
          await this.prisma.post.create({
            data: {
              userId: user.id,
              comment: "Example comment",
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUsers();
      // console.log(queryEvents.map((e) => e.query));

      verifyQueryEvents(queryEvents, [
        "BEGIN",
        "INSERT",
        "INSERT",
        "COMMIT",
      ]);
    });

    it(`should execute both prisma client count calls in the same method inside the same transaction`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 520000 })
        public async countUsersAndPosts(): Promise<void> {
          await this.prisma.appUser.count();
          await this.prisma.post.count();
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.countUsersAndPosts();
      // console.log(queryEvents.map((e) => e.query));

      verifyQueryEvents(queryEvents, [
        "BEGIN",
        "SELECT COUNT",
        "SELECT COUNT",
        "COMMIT",
      ]);
    });

    it(`should execute 100 count operations in 50 sequential separate transactions`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 520000 })
        public async countUsersAndPosts(): Promise<void> {
          await this.prisma.appUser.count();
          await this.prisma.post.count();
        }
      }
      const toTest = new TestClass(prismaClient);

      for (let i = 0; i < 100; i++) {
        // reset the query Events object
        queryEvents.length = 0;

        await toTest.countUsersAndPosts();

        verifyQueryEvents(queryEvents, [
          "BEGIN",
          "SELECT COUNT",
          "SELECT COUNT",
          "COMMIT",
        ]);
      }
    });

    it(`should rollback created user with post after error`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createUserWithPost(): Promise<void> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createPost(user);
          throw new Error("unexpected");
        }

        @Transactional({ propagationType: "REQUIRED" })
        public async createPost(user: AppUser) {
          return this.prisma.post.create({
            data: {
              userId: user.id,
              comment: "Example comment",
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);
      await toTest
        .createUserWithPost()
        .then(() => fail("error ecpected"))
        .catch(async (err) => {
          expect(err.message).toBe("unexpected");
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "INSERT",
            "ROLLBACK",
          ]);

          expect(await prismaClient.post.count()).toBe(0);
          expect(await prismaClient.appUser.count()).toBe(0);
        });
    });
  });

  describe("REQUIRES_NEW", () => {
    it(`should create a user in new transaction`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRES_NEW" })
        public async createUser(): Promise<AppUser> {
          const userResult = this.prisma.appUser.create({
            data: {
              email: "foo@bar.de",
              firstname: "John",
              lastname: "Doe",
            },
          });

          return userResult;
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUser();

      // console.log(queryEvents.map((q) => q.query));

      verifyQueryEvents(queryEvents, ["BEGIN", "INSERT", "COMMIT"]);
    });

    it(`should rollback the first user in REQUIRES_NEW but should keep the second created user in in new transaction`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRES_NEW" })
        public async createUserWithAdditionalUser(): Promise<void> {
          // this transaction we want to rollback
          await this.prisma.appUser.create({
            data: {
              email: "foo@bar.de",
              firstname: "John",
              lastname: "Doe",
            },
          });
          // this is executed in separate transaction and should be kept even after rollback
          await this.createUserToKeep();

          throw new Error("some error occured");
        }

        @Transactional({ propagationType: "REQUIRES_NEW" })
        public async createUserToKeep(): Promise<AppUser> {
          return this.prisma.appUser.create({
            data: {
              email: "to@keep.de",
              firstname: "To",
              lastname: "Keep",
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest
        .createUserWithAdditionalUser()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          // console.log(queryEvents.map((q) => q.query));
          expect(err.message).toBe("some error occured");
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "BEGIN", //  START - the new transaction to keep even when first transaction apply
            "INSERT",
            "COMMIT", // END - the end of the separate transaction
            "ROLLBACK",
          ]);

          expect(await prismaClient.appUser.count()).toBe(1);
          const user = await prismaClient.appUser.findFirst();
          expect(user?.firstname).toBe("To");
          expect(user?.lastname).toBe("Keep");
        });
    });

    it(`should rollback the first user in REQUIRED context but should keep the second created user in in new transaction because of REQUIRES_NEW context`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 120000 })
        public async createUserWithAdditionalUser(): Promise<void> {
          // this transaction we want to rollback
          await this.prisma.appUser.create({
            data: {
              email: "foo@bar.de",
              firstname: "John",
              lastname: "Doe",
            },
          });
          // this is executed in separate transaction and should be kept even after rollback
          await this.createUserToKeep();

          throw new Error("some error occured");
        }

        @Transactional({ propagationType: "REQUIRES_NEW", txTimeout: 120000 })
        public async createUserToKeep(): Promise<AppUser> {
          return this.prisma.appUser.create({
            data: {
              email: "to@keep.de",
              firstname: "To",
              lastname: "Keep",
            },
          });
        }
      }

      const toTest = new TestClass(prismaClient);

      await toTest
        .createUserWithAdditionalUser()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          // console.log(queryEvents.map((q) => q.query));
          expect(err.message).toBe("some error occured");
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "BEGIN",
            "INSERT",
            "COMMIT",
            "ROLLBACK",
          ]);

          expect(await prismaClient.appUser.count()).toBe(1);
          const user = await prismaClient.appUser.findFirst();
          expect(user?.firstname).toBe("To");
          expect(user?.lastname).toBe("Keep");
        });
    });

    it(`should rollback the first user in REQUIRED context but should keep 2 created users in REQUIRES NEW context`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED", txTimeout: 120000 })
        public async createUserWithAdditionalUser(): Promise<void> {
          // this transaction we want to rollback
          await this.prisma.appUser.create({
            data: {
              email: "foo@bar.de",
              firstname: "John",
              lastname: "Doe",
            },
          });
          // this is executed in separate transaction and should be kept even after rollback
          for (let i = 1; i <= 2; i++) {
            await this.createUserToKeep(i);
          }

          throw new Error("some error occured");
        }

        @Transactional({ propagationType: "REQUIRES_NEW", txTimeout: 120000 })
        public async createUserToKeep(i: number): Promise<AppUser> {
          return this.prisma.appUser.create({
            data: {
              email: "to@keep.de",
              firstname: "To",
              lastname: "Keep" + i,
            },
          });
        }
      }

      const toTest = new TestClass(prismaClient);

      await toTest
        .createUserWithAdditionalUser()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          // console.log(queryEvents.map((q) => q.query));
          expect(err.message).toBe("some error occured");
          verifyQueryEvents(queryEvents, [
            "BEGIN", // start parent transaction
            "INSERT",
            "BEGIN", // REQUIRES_NEW transaction 1
            "INSERT",
            "COMMIT",
            "BEGIN", // REQUIRES_NEW transaction 2
            "INSERT",
            "COMMIT",
            "ROLLBACK", // ROLLBACK parent transaction
          ]);
          //  the new transaction to keep even when first transaction apply
          expect(await prismaClient.appUser.count()).toBe(2);
          const users = await prismaClient.appUser.findMany({
            where: {
              lastname: { in: ["Keep1", "Keep2"] },
            },
          });
          expect(users[0]?.lastname).toBe("Keep1");
          expect(users[1]?.lastname).toBe("Keep2");
          expect(users.length).toBe(2);
        });
    });
  });

  describe("SUPPORTS", () => {
    it("should run in a non transactional context", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "SUPPORTS" })
        public async createAndFindUser(): Promise<AppUser> {
          // create an app user via query Raw because prisma client will always create a transaction
          await this.prisma.$queryRaw(
            Prisma.sql`INSERT into app_user(firstname, lastname,email) VALUES('John','Doe', 'John.Doe@gmail.com')`
          );
          return await this.prisma.appUser.findFirstOrThrow();
        }
      }

      const toTest = new TestClass(prismaClient);

      const user = await toTest.createAndFindUser();
      // console.log(queryEvents.map((f) => f.query));
      verifyQueryEvents(queryEvents, ["INSERT", "SELECT"]);
      expect(user.firstname).toBe("John");
    });

    it("should attach to current transaction created by REQUIRED context", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createTwoUsers(): Promise<void> {
          // create an app user via query Raw because prisma client will always create a transaction
          await this.prisma.$queryRaw(
            Prisma.sql`INSERT into app_user(firstname, lastname,email) VALUES('John','Doe', 'John.Doe@gmail.com')`
          );
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "SUPPORTS" })
        public async createOtherUser(): Promise<AppUser> {
          // should not create separate transaction here, should appent to the required context
          return this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });
        }
      }

      const toTest = new TestClass(prismaClient);

      await toTest.createTwoUsers();
      // console.log(queryEvents.map((f) => f.query));
      verifyQueryEvents(queryEvents, [
        "BEGIN",
        "INSERT",
        "INSERT", // inside SUPPORT context it should attach to the current transaction
        "COMMIT",
      ]);

      const users = await prismaClient.appUser.findMany();
      expect(users[0].firstname).toBe("John");
      expect(users[1].firstname).toBe("Peter");
      expect(users.length).toBe(2);
    });

    it("should rollback the transaction where the SUPPORTS context attach", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();

          throw new Error("unexpected");
        }

        @Transactional({ propagationType: "SUPPORTS" })
        public async createOtherUser(): Promise<AppUser> {
          // should not create separate transaction here, should appent to the required context
          return this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });
        }
      }

      const toTest = new TestClass(prismaClient);

      await toTest
        .createTwoUsers()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          expect(err.message).toBe("unexpected");
          // console.log(queryEvents.map((f) => f.query));
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "INSERT",
            "ROLLBACK",
          ]);

          const users = await prismaClient.appUser.findMany();
          expect(users.length).toBe(0);
        });
    });
  });

  describe("MANDATORY" as TransactionPropagation, () => {
    it("should append to existing transaction context", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "MANDATORY" })
        private async createOtherUser(): Promise<AppUser> {
          return this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest.createTwoUsers();
      verifyQueryEvents(queryEvents, [
        "BEGIN",
        "INSERT",
        "INSERT",
        "COMMIT",
      ]);
    });

    it("should rollback the whole transaction", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "MANDATORY" })
        private async createOtherUser(): Promise<AppUser> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });

          if (user) {
            throw new Error("unexpected");
          }
          return user;
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest
        .createTwoUsers()
        .then(() => fail("error was expected"))
        .catch((err) => {
          expect(err.message).toBe("unexpected");
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "INSERT",
            "ROLLBACK",
          ]);
        });
    });

    it("should throw exception because there is no transaction, where it can append to", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "MANDATORY" })
        private async createOtherUser(): Promise<AppUser> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });

          if (user) {
            throw new Error("unexpected");
          }
          return user;
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest
        .createTwoUsers()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          verifyQueryEvents(queryEvents, [
            "INSERT"
          ]);
          expect(err.message).toBe(
            "Transaction is required for propagation type MANDATORY"
          );
          const users = await prismaClient.appUser.findMany();
          expect(users[0]?.firstname).toBe("John");
          expect(users.length).toBe(1);
        });
    });
  });

  describe("NEVER", () => {
    it("should run as normal because it is not running inside a transaction", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "NEVER" })
        private async createOtherUser(): Promise<AppUser> {
          return await this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest.createTwoUsers();
      verifyQueryEvents(queryEvents, [
        "INSERT",
        "INSERT",
      ]);

      const users = await prismaClient.appUser.findMany();
      expect(users[0]?.firstname).toBe("John");
      expect(users[1]?.firstname).toBe("Peter");
      expect(users.length).toBe(2);
    });

    it("should create two users and one of them inside NEVER context and should keep both on error", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "NEVER" })
        private async createOtherUser(): Promise<AppUser> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });
          if (user) {
            throw new Error("unexpected");
          }

          return user;
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest
        .createTwoUsers()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          expect(err.message).toBe("unexpected");
          verifyQueryEvents(queryEvents, [
            "INSERT",
            "INSERT",
          ]);

          const users = await prismaClient.appUser.findMany();
          expect(users[0]?.firstname).toBe("John");
          expect(users[1]?.firstname).toBe("Peter");
          expect(users.length).toBe(2);
        });
    });

    it("should throw exception because running inside transaction context is not allowed and should rollback the transaction in required context", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createTwoUsers(): Promise<void> {
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.createOtherUser();
        }

        @Transactional({ propagationType: "NEVER" })
        private async createOtherUser(): Promise<AppUser> {
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "Peter",
              lastname: "Pan",
              email: "Peter.Pan@gmail.com",
            },
          });

          return user;
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest
        .createTwoUsers()
        .then(() => fail("error was expected"))
        .catch(async (err) => {
          expect(err.message).toBe(
            "Transactions are not supported for propagation type NEVER"
          );
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "ROLLBACK",
          ]);
          const users = await prismaClient.appUser.findMany();
          expect(users.length).toBe(0);
        });
    });
  });

  describe("NOT_SUPPORTED", () => {
    it("should be executed in non transactional context, because transaction context is not supported", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "NOT_SUPPORTED" })
        public async createUser(): Promise<void> {
          // use $queryRaw instead of create because prisma client creates always a transaction for create statements
          // in order not to confuse the developer here with BEGIN and COMMIT $queryRaw is used
          return this.prisma
            .$queryRaw`INSERT into app_user(firstname, lastname,email) VALUES('John','Doe', 'John.Doe@gmail.com')`;
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest.createUser();
      verifyQueryEvents(queryEvents, ["INSERT"]);
      expect((await prismaClient.appUser.findFirstOrThrow()).lastname).toBe(
        "Doe"
      );
    });

    it("should suspend REQUIRED context and run in non transactional context - verify with error", async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createTwoUsers(): Promise<void> {
          // this will run in its own transaction
          await prismaClient.appUser.create({
            data: {
              firstname: "Andy",
              lastname: "Foo",
              email: "Andy.Foo@gmail.com",
            },
          });
          await this.createUser();
          throw new Error("unexpected");
        }

        @Transactional({ propagationType: "NOT_SUPPORTED" })
        public async createUser(): Promise<void> {
          // this method does not support transactions, but instead of NEVER it will not complain, just suspend the caller transaction
          // use $queryRaw instead of create because prisma client creates always a transaction for create statements
          // in order not to confuse the developer here with BEGIN and COMMIT $queryRaw is used
          return this.prisma
            .$queryRaw`INSERT into app_user(firstname, lastname,email) VALUES('John','Doe', 'John.Doe@gmail.com')`;
        }
      }

      const toTest = new TestClass(prismaClient);
      await toTest
        .createTwoUsers()
        .then(() => fail("error expected"))
        .catch(async (err: Error) => {
          expect(err.message).toBe("unexpected");
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "INSERT",
            "ROLLBACK",
          ]);
          const users = await prismaClient.appUser.findMany();
          // NOT SUPPORTED context is not affected by the roleback, it does not support transactions
          // and therefore the created record in the NOT_SUPPORTED context is not affected by the error
          expect(users.length).toBe(1);
          expect(users[0].lastname).toBe("Doe");
        });
    });
  });

  describe("Multiple Service Use Cases", () => {
    it("should rollback the user from UserService and the post from PostService from same transaction", async () => {
      class PostService {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createPost(userId: bigint): Promise<void> {
          // this will run in its own transaction
          await this.prisma.post.create({
            data: {
              userId: userId,
              comment: "my comment",
            },
          });
        }
      }
      class UserService {
        constructor(
          private prisma: IExtendedPrismaClient,
          private postService: PostService
        ) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createUserWithPost(): Promise<void> {
          // this will run in its own transaction
          const user = await this.prisma.appUser.create({
            data: {
              firstname: "Andy",
              lastname: "Foo",
              email: "Andy.Foo@gmail.com",
            },
          });
          await this.postService.createPost(user.id);
          throw new Error("unexpected");
        }
      }

      const postService = new PostService(prismaClient);
      const userService = new UserService(prismaClient, postService);
      await userService
        .createUserWithPost()
        .then(() => fail("error expected"))
        .catch(async (err: Error) => {
          expect(err.message).toBe("unexpected");
          verifyQueryEvents(queryEvents, [
            "BEGIN",
            "INSERT",
            "INSERT",
            "ROLLBACK",
          ]);
          const users = await prismaClient.appUser.findMany();
          expect(users.length).toBe(0);
        });
    });
  });

  describe("expected non working use cases - using this library", () => {
    it("transaction already closed when running setTimeout callback without waiting", async () => {
      class UserService {
        constructor(
          private prisma: IExtendedPrismaClient,
          private eventEmitter = new EventEmitter()
        ) {}

        public on(
          event: string,
          listener: (arg: PrismaClientKnownRequestError) => void
        ): void {
          this.eventEmitter.on(event, listener);
        }

        @Transactional({ propagationType: "REQUIRED", txTimeout: 500 })
        public async createUserWithPost(): Promise<void> {
          // this will run in its own transaction
          await this.prisma.appUser.create({
            data: {
              firstname: "Andy",
              lastname: "Foo",
              email: "Andy.Foo@gmail.com",
            },
          });

          setTimeout(async () => {
            await this.prisma.appUser
              .create({
                data: {
                  firstname: "Peter",
                  lastname: "Pan",
                  email: "Peter.Pan@gmail.com",
                },
              })
              .catch((err) => {
                // this is an expected error
                this.eventEmitter.emit(
                  "error",
                  err as PrismaClientKnownRequestError
                );
              });
          }, 550);
        }
      }
      const toTest = new UserService(prismaClient);
      const errorPromise = new Promise((resolve, reject) => {
        toTest.on("error", (err) => {
          reject(err);
        });
      });

      await toTest.createUserWithPost();
      await errorPromise.catch((err) => {
        expect(err.meta?.error).toContain("Transaction already closed");
      });
    });

    it(`FIXME! should create user in transaction asynchronously without waiting`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createUserWithPost(): Promise<void> {
          // NOTE: you do not wait - so the method will finish and the REQUIRED context will close the transaction
          this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);

      await toTest.createUserWithPost().catch((err: Error) => {
        expect(err.message).toContain(
          "Make sure that the end of the method represents a finished state of the transactional database operations"
        );
      });
    });
  });
});
