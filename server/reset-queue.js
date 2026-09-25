require('dotenv').config();
const { checkQueue } = require('./queue');

async function main() {
  await checkQueue.obliterate({ force: true });
  console.log('Queue obliterated — the next job will be job 1.');
  process.exit(0);
}

main();