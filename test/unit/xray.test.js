const xray = require('aws-xray-sdk-core');
const chai = require('chai');
const sinon = require('sinon').createSandbox();
const sinonChai = require('sinon-chai');
const { assert } = chai;

const hapiXray = require('../../lib/xray');
const SegmentEmitter = require('aws-xray-sdk-core/lib/segment_emitter.js');
const ServiceConnector = require('aws-xray-sdk-core/lib/middleware/sampling/service_connector.js');

const mwUtils = xray.middleware;
const IncomingRequestData = xray.middleware.IncomingRequestData;
const Segment = xray.Segment;

chai.should();
chai.use(sinonChai);

const utils = require('../test-utils');

describe('Hapi plugin', function() {
  const defaultName = 'defaultName';
  const hostName = 'expressMiddlewareTest';
  const parentId = '2c7ad569f5d6ff149137be86';
  const traceId = '1-f9194208-2c7ad569f5d6ff149137be86';

  afterEach(function() {
    sinon.restore();
  });

  describe('#setup', function() {
    it('should set the default segment name on xray', function() {
      hapiXray.setup({ segmentName: 'test segment' });
      assert.equal(mwUtils.defaultName, 'test segment');
    });

    it('should generate the default segment name on xray', function() {
      hapiXray.setup({});
      assert.isTrue(mwUtils.defaultName.includes('hapi-xray'));
    });

    it('should be set to automatic mode by default on xray', function() {
      hapiXray.setup({});
      assert.equal(xray.isAutomaticMode(), true);
    });

    it('should set automatic mode on xray', function() {
      hapiXray.setup({ automaticMode: false });
      assert.equal(xray.isAutomaticMode(), false);
    });

    it('should set the passed logger', function() {
      const testLogger = { error: () => 'error', debug: () => 'debug' };
      hapiXray.setup({ logger: testLogger });
      assert.equal(xray.getLogger(), testLogger);
    });

    it('should call captureAWS when captureAWS is true', function() {
      const captureSpy = sinon.spy(xray, 'captureAWS');
      hapiXray.setup({ captureAWS: true });
      assert.equal(captureSpy.callCount, 1);
    });

    it('should set plugins when provided', function() {
      const pluginSpy = sinon.spy(xray.plugins.ECSPlugin, 'getData');
      hapiXray.setup({ plugins: [xray.plugins.ECSPlugin] });
      assert.equal(pluginSpy.callCount, 1);
    });
  });

  describe('#createRequestHandler', function() {
    let request, req, res;
    const h = {
      continue: () => Promise.resolve('blah')
    };

    beforeEach(function() {
      req = {
        method: 'GET',
        url: '/',
        connection: {
          remoteAddress: 'localhost'
        },
        headers: { host: 'myHostName' }
      };

      req.emitter = new utils.TestEmitter();
      req.on = utils.onEvent;

      res = {
        req: req,
        header: {}
      };
      res.emitter = new utils.TestEmitter();
      res.on = utils.onEvent;

      request = {
        url: req.url,
        headers: req.headers,
        raw: { req, res }
      };
    });

    it('should return a request handler function', function() {
      hapiXray.setup({});
      const handler = hapiXray.createRequestHandler();
      assert.isFunction(handler);
    });

    it('should run the request handler function and create a request segment', async function() {
      hapiXray.setup({ automaticMode: false });
      const handler = hapiXray.createRequestHandler();
      const result = await handler(request, h);
      assert.isDefined(result);
      assert.isDefined(request.segment);
      assert.isDefined(request.segment.trace_id);
      assert.isDefined(request.segment.id);
      assert.isDefined(request.segment.start_time);
      assert.isDefined(request.segment.name);
      assert.isDefined(request.segment.aws);
      assert.isDefined(request.segment.http);
    });

    describe('when handling a request', function() {
      let addReqDataSpy,
        newSegmentSpy,
        onEventStub,
        processHeadersStub,
        resolveNameStub;

      beforeEach(function() {
        hapiXray.setup({ automaticMode: false });
        newSegmentSpy = sinon.spy(Segment.prototype, 'init');
        addReqDataSpy = sinon.spy(Segment.prototype, 'addIncomingRequestData');

        onEventStub = sinon.stub(res, 'on');

        processHeadersStub = sinon
          .stub(mwUtils, 'processHeaders')
          .returns({ root: traceId, parent: parentId, sampled: '0' });
        resolveNameStub = sinon
          .stub(mwUtils, 'resolveName')
          .returns(defaultName);

        req.headers = { host: hostName };
      });

      afterEach(function() {
        sinon.restore();
        delete process.env.AWS_XRAY_TRACING_NAME;
      });

      it('should call mwUtils.processHeaders to split the headers, if any', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        processHeadersStub.should.have.been.calledOnce;
        processHeadersStub.should.have.been.calledWithExactly(request);
      });

      it('should call mwUtils.resolveName to find the name of the segment', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        resolveNameStub.should.have.been.calledOnce;
        resolveNameStub.should.have.been.calledWithExactly(
          request.headers.host
        );
      });

      it('should create a new segment', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        newSegmentSpy.should.have.been.calledOnce;
        newSegmentSpy.should.have.been.calledWithExactly(
          defaultName,
          traceId,
          parentId
        );
      });

      it('should add a new http property on the segment', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        addReqDataSpy.should.have.been.calledOnce;
        addReqDataSpy.should.have.been.calledWithExactly(
          sinon.match.instanceOf(IncomingRequestData)
        );
      });

      it('should add a finish and close event to the response', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        onEventStub.should.have.been.calledTwice;
        onEventStub.should.have.been.calledWithExactly(
          'finish',
          sinon.match.typeOf('function')
        );
        onEventStub.should.have.been.calledWithExactly(
          'close',
          sinon.match.typeOf('function')
        );
      });
    });

    describe('when the request completes', function() {
      beforeEach(function() {
        sinon.stub(SegmentEmitter);
        sinon.stub(ServiceConnector);
      });

      afterEach(function() {
        sinon.restore();
      });

      it('should add the error flag on the segment on 4xx', function() {
        const getCauseStub = sinon
          .stub(xray.utils, 'getCauseTypeFromHttpStatus')
          .returns('error');

        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        res.statusCode = 400;
        res.emitter.emit('finish');

        assert.equal(request.segment.error, true);
        getCauseStub.should.have.been.calledWith(400);
      });

      it('should add the fault flag on the segment on 5xx', function() {
        const getCauseStub = sinon
          .stub(xray.utils, 'getCauseTypeFromHttpStatus')
          .returns('fault');

        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        res.statusCode = 500;
        res.emitter.emit('finish');

        assert.equal(request.segment.fault, true);
        getCauseStub.should.have.been.calledWith(500);
      });

      it('should add the throttle flag and error flag on the segment on a 429', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        res.statusCode = 429;
        res.emitter.emit('finish');

        assert.equal(request.segment.throttle, true);
        assert.equal(request.segment.error, true);
      });

      it('should add nothing on anything else', function() {
        const handler = hapiXray.createRequestHandler();
        handler(request, h);

        res.statusCode = 200;
        res.emitter.emit('finish');

        assert.notProperty(request.segment, 'error');
        assert.notProperty(request.segment, 'fault');
        assert.notProperty(request.segment, 'throttle');
      });
    });
  });
});
