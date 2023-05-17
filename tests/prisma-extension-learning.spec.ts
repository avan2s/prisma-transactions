import { Prisma, PrismaClient } from "@prisma/client";

describe("Prisma extension learning tests for general purposes", () => {
  it("should extend prisma client with custom call function, which will get the same arguments as the findFirst method (with additional custom property) and returns the type of the results from findFirst method", async () => {
    const extension = Prisma.defineExtension({
      model: {
        $allModels: {
          // Define a new operation `customCall`.
          // T corresponds to the current model,
          // A corresponds to the arguments for the operation.
          customCall<T, A>(
            // `this` is the current type (for example
            // it might be `prisma.user` at runtime).
            this: T,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            x: Prisma.Exact<
              A,
              // For `customCall`, use the arguments from model `T` and the
              // operation `findFirst`. Add `customProperty` to the operation.
              Prisma.Args<T, "findFirst"> & { customProperty: boolean }
            >

            // Get the correct result types for the model of type `T`,
            // and the arguments of type `A` for `findFirst`.
            // `Prisma.Result` computes the result for a given operation
            // such as `select {id: true}` in function `main` below.
            //
          ): Prisma.Result<T, A, "findFirst"> {
            // Override type safety here, because we cannot
            // predict the result types in advance.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const client = Prisma.getExtensionContext(this) as {
              [key: string]: any;
            };
            this as { [key: string]: any };
            console.log(this);
            // this["findFirst"](x);
            return { firstname: "john", lastname: "" } as any;
          },
        },
      },
    });

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
    }).$extends(extension);

    const result = prismaClient.appUser.customCall({
      customProperty: true,
      where: {
        firstname: "john",
      },
    });
  });
});
