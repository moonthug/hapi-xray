const fs = require('fs');
const path = require('path');

const xray = require('aws-xray-sdk');

const debug = require('debug')('plugin:xray');

// Setup XRay
xray.enableManualMode();

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

    if (options.captureHTTP) {
      xray.captureHTTPsGlobal(require('http'), true);
    }

    if (options.capturePromises) {
      xray.capturePromises();
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

      let didEnd = false;

      const endSegment = function() {
        // ensure `endSegment` is only called once
        // in some versions of node.js 10.x and in all versions of node.js 11.x and higher,
        // the 'finish' and 'close' event are BOTH triggered.
        // Previously, only one or the other was triggered:
        // https://github.com/nodejs/node/pull/20611
        if (didEnd) {
          return;
        }

        didEnd = true;

        if (this.statusCode === 429) {
          segment.addThrottleFlag();
        }

        const cause = xray.utils.getCauseTypeFromHttpStatus(this.statusCode);
        if (cause) {
          segment[cause] = true;
        }

        segment.http.close(this);
        segment.close();

        xray
          .getLogger()
          .debug(
            'Closed express segment successfully: { url: ' +
              request.url +
              ', name: ' +
              segment.name +
              ', trace_id: ' +
              segment.trace_id +
              ', id: ' +
              segment.id +
              ', sampled: ' +
              !segment.notTraced +
              ' }'
          );
      };

      request.raw.res.on('finish', endSegment);
      request.raw.res.on('close', endSegment);

      // const ns = xray.getNamespace();
      // const context = ns.createContext();
      //
      // ns.bindEmitter(request.raw.req);
      // ns.bindEmitter(request.raw.res);
      //
      // ns.enter(context);
      //
      // xray.setSegment(segment);

      request.segment = segment;

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
