import { Transactional } from "./transactional";

export class TestClass {

  @Transactional({propagationType: 'REQUIRED'})
  public myMethod(): void{
      console.log('Doing something');
  }

  @Transactional({propagationType: 'REQUIRED'})
  public myMethod2(): void{
    console.log('do something 2')
      this.myMethod();
  }
}


describe('Example Test', () => {
  let toTest = new TestClass();

  it('should return the expected result', () => {
    toTest.myMethod2();
    expect(1).toBe(1);
  });
});
