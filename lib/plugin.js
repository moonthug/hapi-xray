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
      type: 'onPreAuth',
      method: xray.createRequestHandler()
    });
  }
};
