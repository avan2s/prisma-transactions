import axios from "axios";

describe("proxy learning tests", () => {
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

  it("using javascript proxy for a character cache", async () => {
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
