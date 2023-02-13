import { Transactional } from "./transactional";

export class TestClass {

  @Transactional({ propagationType: 'REQUIRED' })
  public requiredAnnotationTest(): void {
    console.log('Doing something');
  }

  @Transactional({ propagationType: 'REQUIRED' })
  public nestedRequiredAnnotationTest(): void {
    console.log('do something 2');
    this.requiredAnnotationTest();
  }
}


describe('Example Test', () => {
  let toTest = new TestClass();

  it('should return the expected result', () => {
    toTest.nestedRequiredAnnotationTest();
    expect(1).toBe(1);
  });
});
