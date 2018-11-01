const { register } = require('./plugin');
const pjson = require('../package');
/**
 *
 * NPM Module
 */
module.exports = {
  /**
   *
   * HAPI Plugin
   */
  plugin: {
    register,
    name: 'hapi-xray',
    version: pjson.version
  }
};
