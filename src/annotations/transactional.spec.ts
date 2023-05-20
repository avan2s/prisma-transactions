import { AppUser, Prisma, PrismaClient } from "@prisma/client";

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
const prismaClient = createPrismaTestClient();

export type AppUserWithoutId = Omit<AppUser, "id">;

describe("Transactional Integration Test", () => {
  const wait = async (milliseconds: number) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, milliseconds);
    });
  };

  beforeAll(async () => {
    await prismaClient.$connect();
  });

  beforeEach(async () => {
    await prismaClient.post.deleteMany();
    await prismaClient.appUser.deleteMany();
  });

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  afterEach(async () => {
    await prismaClient.post.deleteMany();
    await prismaClient.appUser.deleteMany();
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
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => queryEvents.push(event));

      await toTest.createUser({
        email: "foo@bar.de",
        firstname: "John",
        lastname: "Doe",
      });

      expect(queryEvents.length).toBe(4);
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toBe("COMMIT");
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
          await this.prisma.appUser.create({
            data: {
              firstname: "John",
              lastname: "Doe",
              email: "John.Doe@gmail.com",
            },
          });
          await this.shouldAttachToExisting();
        }

        @Transactional({ propagationType: "REQUIRED" })
        public async shouldAttachToExisting() {
          await this.prisma.appUser.create({
            data: {
              firstname: `Peter`,
              lastname: "Foo",
              email: "Peter.Foo@gmail.com",
            },
          });
        }
      }
      const toTest = new TestClass(prismaClient);
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => {
        queryEvents.push(event);
      });

      await toTest.createUser();
      // console.log(queryEvents.map((e) => e.query));

      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[3].query).toContain("INSERT");
      expect(queryEvents[4].query).toContain("SELECT");
      expect(queryEvents[5].query).toBe("COMMIT");
      expect(queryEvents.length).toBe(6);
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
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => {
        queryEvents.push(event);
      });

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
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => {
        queryEvents.push(event);
      });

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

      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => {
        queryEvents.push(event);
      });

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
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => {
        queryEvents.push(event);
      });

      try {
        await toTest.createUserWithPost();
      } catch (err) {
        expect(queryEvents[0].query).toBe("BEGIN");
        expect(queryEvents[1].query).toContain("INSERT");
        expect(queryEvents[2].query).toContain("SELECT");
        expect(queryEvents[3].query).toContain("INSERT");
        expect(queryEvents[4].query).toContain("SELECT");

        // the rollback happens, but after the error is thrown and handled here. Wait for the rollback here
        await wait(20);
        expect(queryEvents[5].query).toBe("ROLLBACK");
        expect(queryEvents.length).toBe(6);

        expect(await prismaClient.post.count()).toBe(0);
        expect(await prismaClient.appUser.count()).toBe(0);
      }
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
      const queryEvents: Prisma.QueryEvent[] = [];
      prismaClient.$on("query", (event) => {
        queryEvents.push(event);
      });

      await toTest.createUserWithPost();
      // console.log(queryEvents.map((e) => e.query));
      expect(queryEvents[0].query).toBe("BEGIN");
      expect(queryEvents[1].query).toContain("INSERT");
      expect(queryEvents[2].query).toContain("SELECT");
      expect(queryEvents[5].query).toBe("COMMIT");
      expect(queryEvents.length).toBe(6);
    });
  });
});
