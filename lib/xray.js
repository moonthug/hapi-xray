const fs = require('fs');
const path = require('path');

const xray = require('aws-xray-sdk');

const debug = require('debug')('plugin:xray');

// Setup XRay
xray.capturePromise();

module.exports = {
  /**
   *
   * @param {Object} options
   */
  setup: function(options) {
    const segmentName = options.segmentName || this._createSegmentName();
    xray.middleware.setDefaultName(segmentName);

    if (options.plugins) {
      xray.config(options.plugins);
    }

    if (options.logger) {
      xray.setLogger(options.logger);
    }

    if (options.captureAWS) {
      xray.captureAWS(require('aws-sdk'));
    }
  },

  /**
   *
   * @returns {function}
   */
  createRequestHandler: function() {
    return async (request, h) => {
      const header = xray.middleware.processHeaders(request);
      const name = xray.middleware.resolveName(request.headers.host);

      const segment = new xray.Segment(name, header.Root, header.Parent);

      xray.middleware.resolveSampling(header, segment, {
        req: request.raw.req
      });

      segment.addIncomingRequestData(
        new xray.middleware.IncomingRequestData(request.raw.req)
      );

      xray.getLogger().debug(`Starting hapi segment: {
        url: ${request.url},
        name: ${segment.name},
        trace_id: ${segment.trace_id},
        id: ${segment.id},
        sampled: ${!segment.notTraced}
      }`);

      //
      // Response Handler
      request.server.events.once('response', req => {
        if (!req.response) {
          segment.http.close(request.response);
          segment.close();
          return;
        }

        if (req.response.statusCode === 429) {
          segment.addThrottleFlag();
        }

        const cause = xray.utils.getCauseTypeFromHttpStatus(
          req.response.statusCode
        );

        if (cause) {
          segment[cause] = true;
        }

        if (request.response && request.response._error) {
          if (req.response.statusCode !== 404) {
            segment.addError(request.response._error);
          }
        }

        segment.http.close(request.response);
        segment.close();

        xray.getLogger().debug(`Closed hapi segment successfully: {
          url: ${request.url},
          name: ${segment.name},
          trace_id: ${segment.trace_id},
          id: ${segment.id},
          sampled: ${!segment.notTraced}
        }`);
      });

      const ns = xray.getNamespace();
      const context = ns.createContext();

      ns.bindEmitter(request.raw.req);
      ns.bindEmitter(request.raw.res);

      ns.enter(context);

      xray.setSegment(segment);

      return h.continue;
    };
  },

  /**
   *
   * @returns {String}
   * @private
   */
  _createSegmentName: function() {
    let segmentName = 'service';
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pjson = require(pkgPath);
      segmentName = `${pjson.name || 'service'}_${pjson.version || 'v1'}`;
    }
    return segmentName;
  }
};
