import { MyPrismaClient } from "./my-prisma-service";

const prismaClient = new MyPrismaClient({
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

describe("My Prisma Client test", () => {
  it("test transactional propagation", async () => {
    const users = await prismaClient.appUser.findMany();
    expect(users.length).toBe(0);
  });
});
