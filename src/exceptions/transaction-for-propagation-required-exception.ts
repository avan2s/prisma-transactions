import { TransactionPropagation } from "../interfaces";

export class TransactionForPropagationRequiredException extends Error {
  constructor(private propagation: TransactionPropagation) {
    super(`Transaction is required for propagation type ${propagation}`);
  }

  getPropagation() {
    return this.propagation;
  }
}
