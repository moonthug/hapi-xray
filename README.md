# hapi-xray

A HapiJS plugin to log requests and subsegments through AWSXray.

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

### Options

- `captureAWS` Enables AWS X-Ray to capture AWS calls
  - This requires having `aws-sdk` installed as a dependency
- `setLogger` Bind AWS X-Ray to a compatible logging interface `({ trace, debug, info })`

## Thanks

Based on the hard work @[AWS X-Ray Express Middleware](https://github.com/aws/aws-xray-sdk-node/tree/master/packages/express)
