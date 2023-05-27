import { AppUser, Prisma, PrismaClient } from "@prisma/client";

import { TransactionPropagation } from "../interfaces";
import prismaTxClientExtension from "../services/prisma-tx-client-extension";
import { prismaTxPropagationExtension } from "../services/prisma-tx-propagation-extension";
import { Transactional } from "./transactional";
function createPrismaTestClient() {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: "postgresql://postgres:postgres@localhost:6005/postgres" },
    },
    log: [
      {
        level: "query",
        emit: "event",
      },
    ],
  })
    .$extends(prismaTxClientExtension)
    .$extends(prismaTxPropagationExtension);
  return prisma;
}

export type IExtendedPrismaClient = ReturnType<typeof createPrismaTestClient>;

export type AppUserWithoutId = Omit<AppUser, "id">;

describe("Transactional Integration Test", () => {
  const queryEvents: Prisma.QueryEvent[] = [];
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

    prismaClient.$on("query", (event) => {
      queryEvents.push(event);
    });
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

        @Transactional({ propagationType: "REQUIRED", txTimeout: 60000 })
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

      verifyQueryEvents(queryEvents, ["BEGIN", "INSERT", "SELECT", "COMMIT"]);
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
        "SELECT",
        "INSERT",
        "SELECT",
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

      expect(queryEvents[0].query).toBe("BEGIN");

      const expectedNumberOfOperationsForInsert =
        ["SELECT", "INSERT"].length * 6;
      for (let i = 1; i <= expectedNumberOfOperationsForInsert; i += 2) {
        expect(queryEvents[i].query).toContain("INSERT");
        expect(queryEvents[i + 1].query).toContain("SELECT");
      }

      expect(queryEvents[13].query).toBe("COMMIT");
      expect(queryEvents.length).toBe(14);
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
      const queries = queryEvents.map((e) => e.query);

      expect(queries[0]).toBe("BEGIN");
      expect(queries[queries.length - 1]).toBe("COMMIT");
      expect(queries.filter((query) => query.includes("INSERT")).length).toBe(
        numberOfUsers
      );
      expect(queries.filter((query) => query.includes("SELECT")).length).toBe(
        numberOfUsers
      );

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

      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toContain("INSERT");
      expect(queryEvents[4].query).toContain("SELECT");
      expect(queryEvents[5].query).toBe("COMMIT");
      expect(queryEvents.length).toBe(6);
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

      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("SELECT COUNT");
      expect(queryEvents[2].query).toContain("SELECT COUNT");
      expect(queryEvents[3].query).toBe("COMMIT");
      expect(queryEvents.length).toBe(4);
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
        queryEvents.length = 0;

        await toTest.countUsersAndPosts();

        expect(queryEvents[0].query).toBe("BEGIN");
        expect(queryEvents[1].query).toContain("SELECT COUNT");
        expect(queryEvents[2].query).toContain("SELECT COUNT");
        expect(queryEvents[3].query).toBe("COMMIT");
        expect(queryEvents.length).toBe(4);
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
            "SELECT",
            "INSERT",
            "SELECT",
            "ROLLBACK",
          ]);

          expect(await prismaClient.post.count()).toBe(0);
          expect(await prismaClient.appUser.count()).toBe(0);
        });
    });

    it.skip(`FIXME! should create user in transaction asynchronously without waiting`, async () => {
      class TestClass {
        constructor(private prisma: IExtendedPrismaClient) {}

        @Transactional({ propagationType: "REQUIRED" })
        public async createUserWithPost(): Promise<void> {
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

      await toTest.createUserWithPost();
      // console.log(queryEvents.map((e) => e.query));
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[5].query).toBe("COMMIT");
      expect(queryEvents.length).toBe(6);
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

      expect(queryEvents.length).toBe(4);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toBe("COMMIT");
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
          expect(queryEvents[0].query).toBe("BEGIN");
          expect(queryEvents[1].query).toContain("INSERT");
          expect(queryEvents[2].query).toContain("SELECT");

          //  the new transaction to keep even when first transaction apply
          expect(queryEvents[3].query).toBe("BEGIN");
          expect(queryEvents[4].query).toContain("INSERT");
          expect(queryEvents[5].query).toContain("SELECT");
          expect(queryEvents[6].query).toBe("COMMIT");
          expect(queryEvents[7].query).toBe("ROLLBACK");
          expect(queryEvents.length).toBe(8);

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
          expect(queryEvents[0].query).toBe("BEGIN");
          expect(queryEvents[1].query).toContain("INSERT");
          expect(queryEvents[2].query).toContain("SELECT");

          //  the new transaction to keep even when first transaction apply
          expect(queryEvents[3].query).toBe("BEGIN");
          expect(queryEvents[4].query).toContain("INSERT");
          expect(queryEvents[5].query).toContain("SELECT");
          expect(queryEvents[6].query).toBe("COMMIT");
          expect(queryEvents[7].query).toBe("ROLLBACK");
          expect(queryEvents.length).toBe(8);

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
          expect(queryEvents[0].query).toBe("BEGIN");
          expect(queryEvents[1].query).toContain("INSERT");
          expect(queryEvents[2].query).toContain("SELECT");

          // REQUIRES_NEW transactions
          expect(queryEvents[3].query).toBe("BEGIN");
          expect(queryEvents[4].query).toContain("INSERT");
          expect(queryEvents[5].query).toContain("SELECT");
          expect(queryEvents[6].query).toContain("COMMIT");

          expect(queryEvents[7].query).toBe("BEGIN");
          expect(queryEvents[8].query).toContain("INSERT");
          expect(queryEvents[9].query).toContain("SELECT");
          expect(queryEvents[10].query).toBe("COMMIT");

          //  the new transaction to keep even when first transaction apply
          expect(queryEvents[11].query).toBe("ROLLBACK");
          expect(queryEvents.length).toBe(12);

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
      expect(queryEvents[0].query).toContain("INSERT");
      expect(queryEvents[1].query).toContain("SELECT");
      expect(queryEvents.length).toBe(2);
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
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      // inside SUPPORT context it should attach to the current transaction
      expect(queryEvents[2].query).toContain("INSERT");
      expect(queryEvents[3].query).toContain("SELECT");

      expect(queryEvents[4].query).toContain("COMMIT");
      expect(queryEvents.length).toBe(5);

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
            "SELECT",
            "INSERT",
            "SELECT",
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
        "SELECT",
        "INSERT",
        "SELECT",
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
            "SELECT",
            "INSERT",
            "SELECT",
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
            "BEGIN",
            "INSERT",
            "SELECT",
            "COMMIT",
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
        "BEGIN",
        "INSERT",
        "SELECT",
        "COMMIT",
        "BEGIN",
        "INSERT",
        "SELECT",
        "COMMIT",
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
            "BEGIN",
            "INSERT",
            "SELECT",
            "COMMIT",
            "BEGIN",
            "INSERT",
            "SELECT",
            "COMMIT",
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
            "SELECT",
            "ROLLBACK",
          ]);
          const users = await prismaClient.appUser.findMany();
          expect(users.length).toBe(0);
        });
    });
  });
});
