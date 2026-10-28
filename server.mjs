import 'express';
// Use our checked production JavaScript; avoid a second platform-specific TS compilation.
export { default } from './dist/server/server/vercel.js';
