/** Point every test at the test database, with jobs and email switched off. */

import { resolve } from 'node:path';
import { loadDotEnv } from '../config.js';

process.chdir(resolve(import.meta.dirname, '../../../..'));
loadDotEnv();

process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.UPLOAD_DIR = './data/test-uploads';
// The suite signs in hundreds of times from one address; the real limit of 20 per 15 minutes is
// checked by its own test in src/auth/rate-limit.test.ts, which builds an app with it in place.
process.env.AUTH_RATE_LIMIT = '100000';
