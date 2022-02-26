import type { Request, RequestType, RequestOptsMapping } from '../adapter.types'

export default class RequestStoreModule {

  private map: Map<string, Request> = new Map()
  private requests: Map<string, Request> = new Map()

  constructor(requestsTimeout: number) { }

  public del(requestId: string) {
    this.requests.delete(requestId)
  }

  public get(requestId: string): Request | undefined {
    return this.requests.get(requestId)
  }

  public put<T extends RequestType>(
    requestId: string,
    requestType: T,
    resolve: Function,
    reject: Function,
    opts: RequestOptsMapping<T>
  ) {
    const request = { resolve, }

    if (requestType === 'SOCKETS') {
      this.map.set(requestId, {
        type: requestType,
        ...request,
        payload: <RequestOptsMapping<'SOCKETS'>> opts,
      })
    } else if (requestType === 'ALL_ROOMS') {
      this.map.set(requestId, {
        type: requestType,
        ...request,
        payload: <RequestOptsMapping<'ALL_ROOMS'>> opts,
      })
    } else if (requestType === 'REMOTE_FETCH') {
      this.map.set(requestId, {
        type: requestType,
        ...request,
        payload: <RequestOptsMapping<'REMOTE_FETCH'>> opts,
      })
    } else if (['REMOTE_JOIN', 'REMOTE_LEAVE', 'REMOTE_DISCONNECT'].includes(requestType)) {
      this.map.set(requestId, {
        type: requestType as ('REMOTE_JOIN' | 'REMOTE_LEAVE' | 'REMOTE_DISCONNECT'),
        ...request,
      })
    }
  }
}
