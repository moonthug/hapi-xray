const Hapi = require('hapi');
const xray = require('aws-xray-sdk');

const debug = require('debug')('hapi-xray');

const server = Hapi.server({
  host: 'localhost',
  port: 8000
});

server.route({
  method: 'GET',
  path: '/',
  handler: (request, h) => {
    const segment = xray.getSegment();
    segment.addAnnotation('hitController', 'true');

    return { hello: 'world' };
  }
});

const start = async () => {
  try {
    await server.register({
      plugin: require('../'),
      options: {
        captureAWS: false
      }
    });
    await server.start();
  } catch (err) {
    console.log(err);
    process.exit(1);
  }

  console.log('Server running at:', server.info.uri);
};

start();
