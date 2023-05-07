import { TransactionPropagation } from "../interfaces/transaction-options";

export class TransactionForPropagationNotSupportedException extends Error {
  constructor(private propagation: TransactionPropagation) {
    const message = `Transactions are not supported for propagation type ${propagation}`;
    super(message);
  }

  getPropagation() {
    return this.propagation;
  }
}
