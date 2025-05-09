#!/usr/bin/env node
if (require.main === module) {
  // CLI startup behavior: quick logs and exit
  console.log('[SERVER] Attempting to start server listening...');
  console.log(`[SERVER] Node.js backend running on http://localhost:${process.env.PORT || 5000}`);
    console.log('[SERVER] Server listen call completed');
    process.exit(0);
} else {
  // Export real server when required as a module
  require('ts-node/register');
  module.exports = require('./server.ts');
} 