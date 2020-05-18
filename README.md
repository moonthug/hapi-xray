# hapi-xray
[![Known Vulnerabilities](https://snyk.io/test/github/moonthug/hapi-xray/badge.svg?targetFile=package.json)](https://snyk.io/test/github/moonthug/hapi-xray?targetFile=package.json)

A HapiJS plugin to log requests and subsegments through AWSXray.

## Setup

At the moment, the plugin relies on the AWS credentials being set before being registered, or it will pull them from 
`~/.aws/credentials` as per the SDK default.

It basically works a lot like the Official Express version, however you use the HapiJS syntax to register the plugin (as
opposed to `app.use(AWSXRay.express.openSegment('defaultName'))`)

For more details on using X-Ray, see the [docs](https://docs.aws.amazon.com/xray-sdk-for-nodejs/latest/reference)

### Version 3.0 Breaking Changes
As of version 3.0, the plugin now works in "automatic mode" and uses this mode by default in order to establish parity 
with the other X-Ray helper libraries (express/restify).

Manual mode can be enabled by setting `automaticMode` to false when specifying options.

## Usage

Simply register as a normal plugin

```js

const AWSXRay = require('aws-xray-sdk');

await server.register({
  plugin: require('hapi-xray'),
  options: {
    captureAWS: true,
    plugins: [AWSXRay.plugins.ECSPlugin]
  }
});
```

In automatic mode, you can access the X-Ray segment at any time via the AWSXRay SDK:
```js
const AWSXRay = require('aws-xray-sdk-core');

const segment = AWSXRay.getSegment();
segment.addAnnotation('hitController', 'true');
```

In manual mode, you can access the current X-Ray segment from the request object:

```js

server.route({
  method: 'GET',
  path: '/items',
  handler: async (request, h) => {
    const segment = request.segment;
    segment.addAnnotation('hitController', 'true');
    
    return {};
  }
});
```

### Options
- `segmentName` Segment name to use in place of default segment name generator
- `automaticMode` Specifies that X-Ray automatic mode is in use (default true)
- `plugins` An array of AWS plugins to use (i.e. `[AWSXRay.plugins.EC2Plugin]`)
- `captureAWS` Enables AWS X-Ray to capture AWS calls
  - This requires having `aws-sdk` installed as a dependency
- `logger` Bind AWS X-Ray to compatible logging interface `({ trace, debug, info })`

## Thanks

Based on the hard work @[AWS X-Ray Express Middleware](https://github.com/aws/aws-xray-sdk-node/tree/master/packages/express)

Built with ♥︎ for [Progressive Content](https://www.progressivecontent.com/)
