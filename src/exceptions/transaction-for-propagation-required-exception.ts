import { Propagation } from "../interfaces/transaction-options";

export class TransactionForPropagationRequiredException extends Error {
  constructor(private propagation: Propagation) {
    super(`Transaction is required for propagation type ${propagation}`);
  }

  getPropagation() {
    return this.propagation;
  }
}
