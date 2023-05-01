describe("extended promise learning tests ", () => {
  it("testing out calling functions, which are assigned in a promise - resolve by commit ", async () => {
    let commit: () => void;
    let rollback: () => void;
    let resolveSomething: () => void;

    const txPromise = new Promise((resolve, reject) => {
      commit = () => resolve("success");
      resolveSomething = () => resolve("something");
      rollback = () => reject("failed");
    });

    const c = () => {
      commit();
    };
    const r = () => {
      rollback();
    };
    const s = () => {
      resolveSomething();
    };
    c();
    // r();
    await txPromise.then((s) => expect(s).toBe("success"));
  });

  it("testing out calling functions, which are assigned in a promise - resolve by something", async () => {
    let commit: () => void;
    let rollback: () => void;
    let resolveSomething: () => void;

    const txPromise = new Promise((resolve, reject) => {
      commit = () => resolve("success");
      resolveSomething = () => resolve("something");
      rollback = () => reject("failed");
    });

    const c = () => {
      commit();
    };
    const r = () => {
      rollback();
    };
    const s = () => {
      resolveSomething();
    };
    s();
    // r();
    await txPromise.then((s) => expect(s).toBe("something"));
  });

  it("testing out calling functions, which are assigned in a promise - reject by something", async () => {
    let commit: () => void;
    let rollback: () => void;
    let resolveSomething: () => void;

    const txPromise = new Promise((resolve, reject) => {
      commit = () => resolve("success");
      resolveSomething = () => resolve("something");
      rollback = () => reject("failed");
    });

    const c = () => {
      commit();
    };
    const r = () => {
      rollback();
    };
    const s = () => {
      resolveSomething();
    };
    r();
    await txPromise.catch((s) => expect(s).toBe("failed"));
  });
});
