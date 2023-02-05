type Propagation = 'REQUIRED' | 'REQUIRES_NEW' | 'SUPPORTS' | 'NOT_SUPPORTED' | 'MANDATORY' | 'NEVER';

export interface TransactionOptions {
    propagationType: Propagation
}