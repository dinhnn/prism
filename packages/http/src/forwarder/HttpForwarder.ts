import { IForwarder, IPrismInput } from '@stoplight/prism-core';
import { IHttpOperation, IServer } from '@stoplight/types';
import axios, { CancelToken } from 'axios';
import { toError } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import * as Task from 'fp-ts/lib/Task';
import { fold, TaskEither, tryCatch } from 'fp-ts/lib/TaskEither';
import { NO_BASE_URL_ERROR } from '../router/errors';
import { IHttpConfig, IHttpRequest, IHttpResponse, ProblemJsonError } from '../types';
import updateHostHeaders from './utils/updateHostHeaders';

export class HttpForwarder implements IForwarder<IHttpOperation, IHttpRequest, IHttpConfig, IHttpResponse> {
  public async forward(opts: {
    resource?: IHttpOperation;
    input: IPrismInput<IHttpRequest>;
    timeout?: number;
    cancelToken?: CancelToken;
  }): Promise<IHttpResponse> {
    return pipe(
      this.fforward(opts),
      fold<unknown, IHttpResponse, IHttpResponse>(e => {
        throw e;
      }, Task.of),
    )();
  }

  public fforward(opts: {
    resource?: IHttpOperation;
    input: IPrismInput<IHttpRequest>;
    timeout?: number;
    cancelToken?: CancelToken;
  }): TaskEither<Error, IHttpResponse> {
    return tryCatch<Error, IHttpResponse>(async () => {
      const inputData = opts.input.data;
      const baseUrl =
        opts.resource && opts.resource.servers && opts.resource.servers.length > 0
          ? this.resolveServerUrl(opts.resource.servers[0])
          : inputData.url.baseUrl;

      if (!baseUrl) {
        throw ProblemJsonError.fromTemplate(NO_BASE_URL_ERROR);
      }

      const response = await axios({
        method: inputData.method,
        baseURL: baseUrl,
        url: inputData.url.path,
        params: inputData.url.query,
        responseType: 'text',
        data: inputData.body,
        headers: updateHostHeaders(baseUrl, inputData.headers),
        validateStatus: () => true,
        timeout: Math.max(opts.timeout || 0, 0),
        ...(opts.cancelToken !== undefined && { cancelToken: opts.cancelToken }),
      });

      return {
        statusCode: response.status,
        headers: response.headers,
        body: response.data,
        responseType: (response.request && response.request.responseType) || '',
      };
    }, toError);
  }

  private resolveServerUrl(server: IServer) {
    if (!server.variables) {
      return server.url;
    }

    return server.url.replace(/{(.*?)}/g, (_match, variableName) => {
      const variable = server.variables![variableName];
      if (!variable) {
        throw new Error(`Variable '${variableName}' is not defined, cannot parse input.`);
      }

      return variable.default || variable.enum![0];
    });
  }
}
