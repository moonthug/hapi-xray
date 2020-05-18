const fs = require('fs');
const path = require('path');

const AWSXray = require('aws-xray-sdk-core');
const { middleware: mwUtils } = AWSXray;

const debug = require('debug')('plugin:xray');

const defaultOptions = {
  isAutomaticMode: true,
  logger: console
};

module.exports = {
  /**
   * Sets up the plugin for use
   * @param options Options for the plugin setup
   * @param {String} [options.segmentName] Segment name to use in place of default segment name generator
   * @param {Boolean} [options.captureAWS] Specifies that AWS calls should be captured. Requires aws-sdk package.
   * @param {Object} [options.logger] Logger to pass to xray
   * @param {Boolean} [options.isAutomaticMode] Puts xray into automatic or manual mode. Default is true (automatic)
   * @param {Object[]} [options.plugins] Array of AWS plugins to pass to xray
   */
  setup: function(options) {
    const localOptions = { ...defaultOptions, ...options };

    if (localOptions.logger) {
      AWSXray.setLogger(localOptions.logger);
    }

    const segmentName = localOptions.segmentName || this._createSegmentName();
    mwUtils.setDefaultName(segmentName);

    if (localOptions.isAutomaticMode) {
      AWSXray.enableAutomaticMode();
    } else {
      AWSXray.enableManualMode();
    }

    if (localOptions.plugins) {
      AWSXray.config(localOptions.plugins);
    }

    if (localOptions.captureAWS) {
      AWSXray.captureAWS(require('aws-sdk'));
    }
  },

  /**
   * Creates a handler for the request that sets up xray
   * @return {function}
   */
  createRequestHandler: function() {
    return async (request, h) => {
      const header = mwUtils.processHeaders(request);
      const name = mwUtils.resolveName(request.headers.host);

      const segment = new AWSXray.Segment(name, header.root, header.parent);

      const { req, res } = request.raw;
      res.req = req;

      mwUtils.resolveSampling(header, segment, res);

      segment.addIncomingRequestData(new mwUtils.IncomingRequestData(req));

      AWSXray.getLogger().debug(`Starting hapi segment: {
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

        const cause = AWSXray.utils.getCauseTypeFromHttpStatus(this.statusCode);
        if (cause) {
          segment[cause] = true;
        }

        segment.http.close(this);
        segment.close();

        AWSXray.getLogger().debug(
          'Closed hapi segment successfully: { url: ' +
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

      if (AWSXray.isAutomaticMode()) {
        const ns = AWSXray.getNamespace();
        if (!request.app) {
          request.app = {};
        }
        request.app.xrayNamespace = ns;
        request.app.xrayContext = ns.createContext();
        ns.bindEmitter(req);
        ns.bindEmitter(res);
        ns.enter(request.app.xrayContext);
        AWSXray.setSegment(segment);
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
    const segment = AWSXray.resolveSegment(request.segment);

    if (segment) {
      segment.close(error);

      AWSXray.getLogger().debug(
        'Closed hapi segment with error: { url: ' +
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
