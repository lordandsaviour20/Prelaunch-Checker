export class ScanCancelledError extends Error {
    constructor() {
      super('Scan cancelled by user');
      this.name = 'ScanCancelledError';
    }
  }