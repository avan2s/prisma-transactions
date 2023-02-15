import { Propagation } from "../interfaces/transaction-options";

export class TransactionForPropagationTypeNotSupportedException extends Error {
  constructor(private propagation: Propagation) {
    const message = `Transactions are not supported for propagation type ${propagation}`;
    super(message);
  }

  getPropagation() {
    return this.propagation;
  }
}
