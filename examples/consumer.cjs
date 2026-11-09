const { createPolicy } = require('../implementation/desktop/src/policy.cjs');
const settings = { scheme: 'example', appName: 'Example', partition: 'persist:example', serverOrigin: 'https://server.example', webRoot: require('node:path').resolve(__dirname, '../tests/fixtures'), modeEvent: 'example:mode', externalOrigins: ['https://store.example'] };
module.exports = { settings, policy: createPolicy(settings) };
