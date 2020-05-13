const fs = require('fs');
const path = require('path');

const xray = require('aws-xray-sdk-core');
const { middleware: mwUtils } = xray;

const debug = require('debug')('plugin:xray');

module.exports = {
  /**
   *
   * @param {Object} options Options for the plugin
   * @param {String} options.segmentName Segment name to use in place of default segment name generator
   * @param {Boolean} options.captureAWS Specifies that
   * @param {Object} options.logger Logger to pass to xray
   * @param {Object} options.isAutomaticMode Puts xray into automatic mode
   * @param {Object[]} options.plugins Array of AWS plugins to pass to xray
   */
  setup: function(options) {
    if (!options.isAutomaticMode) {
      xray.enableManualMode();
    }

    const segmentName = options.segmentName || this._createSegmentName();
    mwUtils.setDefaultName(segmentName);

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
   * Creates a handler for the request that sets up xray
   * @returns {function}
   */
  createRequestHandler: function() {
    return async (request, h) => {
      const header = mwUtils.processHeaders(request);
      const name = mwUtils.resolveName(request.headers.host);

      const segment = new xray.Segment(name, header.Root, header.Parent);

      const { req, res } = request.raw;
      res.require = req;

      mwUtils.resolveSampling(header, segment, res);

      segment.addIncomingRequestData(new mwUtils.IncomingRequestData(req));

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

      res.on('finish', endSegment);
      res.on('close', endSegment);

      if (xray.isAutomaticMode()) {
        const ns = xray.getNamespace();
        request.app.xrayNamespace = ns;
        request.app.xrayContext = ns.createContext();
        ns.bindEmitter(req);
        ns.bindEmitter(res);
        ns.enter(request.app.xrayContext);
        xray.setSegment(segment);
      } else {
        request.segment = segment;
      }

      return h.continue;
    };
  },

  handleResponse: request => {
    const { xrayNamespace, xrayContext } = request.app;

    if (xrayNamespace && xrayContext) {
      xrayNamespace.exit(xrayContext);
    }
  },

  handleError: (request, error) => {
    const segment = xray.resolveSegment(request.segment);

    if (segment) {
      segment.close(error);

      xray
        .getLogger()
        .debug(
          'Closed express segment with error: { url: ' +
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
    }
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
