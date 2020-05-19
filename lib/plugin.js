const xray = require('./xray');

/**
 *
 * @param {Server} server
 * @param {object} options
 */
module.exports = {
  register: (server, options) => {
    xray.setup(options);

    server.ext({
      type: 'onRequest',
      method: xray.createRequestHandler()
    });

    server.events.on('request', (request, event, tags) => {
      if (tags.error) {
        xray.handleError(request, event.error);
      }
    });

    server.events.on('response', request => xray.handleResponse(request));
  }
};
