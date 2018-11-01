# hapi-xray

A HapiJS plugin to log requests and subsegments through AWSXray.

## Setup

At the moment, the plugin relies on the AWS credentials being set before being registered, or it will pull them from 
`~/.aws/credentials` as per the SDK default.

It basically works a lot like the Official Express version, however you use the HapiJS syntax to register the plugin (as
opposed to `app.use(AWSXRay.express.openSegment('defaultName'))`)

For more details on using X-Ray, see the [docs](https://docs.aws.amazon.com/xray-sdk-for-nodejs/latest/reference)

## Usage

Simply register as a normal plugin

```js
await server.register({
  plugin: require('hapi-xray'),
  options: {
    captureAWS: true
  }
});
```

You can then use the X-Ray SDK as normal in your routes and have `cls` make it accessible though out the current context

```js
const xray = require('aws-xray-sdk');

server.route({
  method: 'GET',
  path: '/hello',
  handler: (request, h) => {
    const segment = xray.getSegment();
    xray.captureFunc('db.getItem', function(subsegment1) {
      db.getItem();
    }, segment);
    
    return 'hello world';
  }
});
```

### Options

- `captureAWS` Enables AWS X-Ray to capture AWS calls
  - This requires having `aws-sdk` installed as a dependency
- `setLogger` Bind AWS X-Ray to a compatible logging interface `({ trace, debug, info })`

## Thanks

Based on the hard work @[AWS X-Ray Express Middleware](https://github.com/aws/aws-xray-sdk-node/tree/master/packages/express)
