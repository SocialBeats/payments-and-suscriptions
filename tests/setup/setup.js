// IMPORTANT: Load test environment FIRST before any other imports
import './testEnv.js';

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../main.js';
import { connectDB, disconnectDB } from '../../src/db.js';

// Singleton to track connection state
let isConnected = false;

beforeAll(async () => {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
    
    // Clean DB at start of test run
    if (process.env.NODE_ENV === 'test') {
      try {
        const Subscription = mongoose.models.Subscription;
        if (Subscription) {
          await Subscription.deleteMany({});
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}, 10000); // 10s timeout for connection

afterAll(async () => {
  // Clean DB at end of test run
  if (process.env.NODE_ENV === 'test') {
    try {
      const Subscription = mongoose.models.Subscription;
      if (Subscription) {
        await Subscription.deleteMany({});
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  if (isConnected) {
    await disconnectDB();
    isConnected = false;
  }
});

// Export a ready-to-use Supertest instance
export const api = request(app);

// Re-export helpers for convenience
export * from './testHelpers.js';
