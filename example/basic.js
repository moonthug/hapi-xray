const Hapi = require('hapi');
const xray = require('aws-xray-sdk');

const server = Hapi.server({
  host: 'localhost',
  port: 8000
});

server.route({
  method: 'GET',
  path: '/hello',
  handler: (request, h) => {
    const segment = xray.getSegment();
    xray.captureFunc('1', function(subsegment1) {
      subsegment1.addAnnotation('valid', 'true');
      xray.captureFunc('2', function(subsegment2) {
        subsegment2.addMetadata('hello', 'there');
        console.log('do some stuff...');
      }, subsegment1);
    }, segment);
    return 'hello world';
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
