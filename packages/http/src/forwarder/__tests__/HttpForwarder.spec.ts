import * as axios from 'axios';

import { ProblemJsonError } from '../../';
import { httpInputs, httpOperations, httpRequests } from '../../__tests__/fixtures';
import { NO_BASE_URL_ERROR } from '../../router/errors';
import { HttpForwarder } from '../HttpForwarder';

const { version: prismVersion } = require('../../../package.json');

jest.mock('axios', () => ({
  default: jest.fn().mockResolvedValue({ status: 200 }),
}));

describe('HttpForwarder', () => {
  const forwarder = new HttpForwarder();

  describe('forward()', () => {
    describe("parameters haven't been provided", () => {
      it('proxies request correctly', async () => {
        const request = {
          ...httpRequests[0],
          data: {
            ...httpInputs[0],
            url: { ...httpInputs[0].url, baseUrl: 'http://api.example.com' },
          },
        };

        await forwarder.forward({ input: request });

        expect(axios.default).toHaveBeenCalledWith({
          method: 'get',
          url: '/todos',
          baseURL: 'http://api.example.com',
          responseType: 'text',
          validateStatus: expect.any(Function),
          timeout: 0,
          headers: {
            'user-agent': `Prism/${prismVersion}`,
          },
        });
      });
    });

    describe('no servers defined', () => {
      describe('baseUrl is not set', () => {
        it('throws error', async () => {
          const request = Object.assign({}, httpRequests[0]);
          await expect(forwarder.forward({ input: request })).rejects.toThrowError(
            ProblemJsonError.fromTemplate(NO_BASE_URL_ERROR),
          );
        });
      });
    });

    describe('headers are provided', () => {
      describe('host header is not present', () => {
        it('does not modifies headers', async () => {
          const request = {
            ...httpRequests[0],
            data: {
              ...httpInputs[0],
              headers: { 'x-test': 'b' },
              url: { ...httpInputs[0].url, baseUrl: 'http://api.example.com' },
            },
          };

          await forwarder.forward({ input: request });

          expect(axios.default).toHaveBeenCalledWith({
            method: 'get',
            url: '/todos',
            baseURL: 'http://api.example.com',
            responseType: 'text',
            validateStatus: expect.any(Function),
            headers: {
              'x-test': 'b',
              'user-agent': `Prism/${prismVersion}`,
            },
            timeout: 0,
          });
        });
      });

      describe('host header is present', () => {
        it('modifies headers', async () => {
          const request = {
            ...httpRequests[0],
            data: {
              ...httpInputs[0],
              headers: { host: 'localhost' },
              url: { ...httpInputs[0].url, baseUrl: 'http://api.example.com' },
            },
          };

          await forwarder.forward({ input: request });

          expect(axios.default).toHaveBeenCalledWith({
            method: 'get',
            url: '/todos',
            baseURL: 'http://api.example.com',
            responseType: 'text',
            validateStatus: expect.any(Function),
            headers: {
              host: 'api.example.com',
              forwarded: 'host=localhost',
              'user-agent': `Prism/${prismVersion}`,
            },
            timeout: 0,
          });
        });
      });
    });

    describe('parameters are valid', () => {
      describe('server url has no variables', () => {
        it('proxies request correctly', async () => {
          jest.spyOn(axios, 'default').mockResolvedValue({
            status: 200,
            headers: {
              'Content-type': 'application/json',
            },
            data: '[{},{}]',
            statusText: 'ok',
            config: {},
          });

          const response = await forwarder.forward({
            input: httpRequests[0],
            resource: Object.assign({}, httpOperations[0], {
              servers: [{ url: 'http://api.example.com' }],
            }),
          });

          expect(response).toMatchSnapshot();

          expect(axios.default).toHaveBeenCalledWith({
            method: 'get',
            url: '/todos',
            baseURL: 'http://api.example.com',
            responseType: 'text',
            validateStatus: expect.any(Function),
            timeout: 0,
            headers: {
              'user-agent': `Prism/${prismVersion}`,
            },
          });
        });
      });

      describe('server url has variables', () => {
        it('fails when variable is not defined', async () => {
          return expect(
            forwarder.forward({
              input: httpRequests[0],
              resource: Object.assign({}, httpOperations[0], {
                servers: [
                  {
                    url: 'http://{var1}.example.com',
                    variables: {
                      var2: {},
                    },
                  },
                ],
              }),
            }),
          ).rejects.toThrowErrorMatchingSnapshot();
        });

        it('substitutes url with default variable values', async () => {
          await forwarder.forward({
            input: httpRequests[0],
            resource: Object.assign({}, httpOperations[0], {
              servers: [
                {
                  url: 'http://{var1}.example.com',
                  variables: {
                    var1: {
                      default: 'api',
                    },
                  },
                },
              ],
            }),
          });

          expect(axios.default).toHaveBeenCalledWith(
            expect.objectContaining({ baseURL: 'http://api.example.com', url: '/todos' }),
          );
        });

        it('substitutes url with first variable value if there is no default one', async () => {
          await forwarder.forward({
            input: httpRequests[0],
            resource: Object.assign({}, httpOperations[0], {
              servers: [
                {
                  url: 'http://{var1}.example.com',
                  variables: {
                    var1: {
                      enum: ['api', 'api2'],
                    },
                  },
                },
              ],
            }),
          });

          expect(axios.default).toHaveBeenCalledWith(
            expect.objectContaining({ baseURL: 'http://api.example.com', url: '/todos' }),
          );
        });
      });
    });

    describe('timeout is provided', () => {
      it('overrides default timeout', async () => {
        await forwarder.forward({
          input: {
            ...httpRequests[0],
            data: {
              ...httpInputs[0],
              url: { ...httpInputs[0].url, baseUrl: 'http://api.example.com' },
            },
          },
          timeout: 100,
        });

        expect(axios.default).toHaveBeenCalledWith(expect.objectContaining({ timeout: 100 }));
      });

      it('cannot be lower than 0', async () => {
        await forwarder.forward({
          input: {
            ...httpRequests[0],
            data: {
              ...httpInputs[0],
              url: { ...httpInputs[0].url, baseUrl: 'http://api.example.com' },
            },
          },
          timeout: -2,
        });

        expect(axios.default).toHaveBeenCalledWith(expect.objectContaining({ timeout: 0 }));
      });
    });

    it('accepts cancel token', async () => {
      const cancelToken = { token: 'foo' } as any;
      await forwarder.forward({
        input: {
          ...httpRequests[0],
          data: {
            ...httpInputs[0],
            url: { ...httpInputs[0].url, baseUrl: 'http://api.example.com' },
          },
        },
        timeout: 100,
        cancelToken,
      });

      expect(axios.default).toHaveBeenCalledWith(expect.objectContaining({ cancelToken }));
    });
  });
});
