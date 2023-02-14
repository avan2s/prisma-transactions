import { v4 as uuidv4 } from "uuid";

export class TransactionManager {
  private transactionNumberToDbClient = new Map<string, string>();

  public async createTransaction() {
    const key = this.generateRandomTransactionNumber();
    const value = `DB-Client-${key}`;
    this.transactionNumberToDbClient.set(key, value);
    return key;
  }

  public async getTransaction(transactionNumber: string) {
    return this.transactionNumberToDbClient.get(transactionNumber);
  }

  public deleteTransaction(transactionNumber: string) {
    return this.transactionNumberToDbClient.delete(transactionNumber);
  }

  public generateRandomTransactionNumber() {
    return uuidv4();
  }
}

const transactionManager = new TransactionManager();
export default transactionManager;
