import type { Request, RequestType, RequestOptsMapping } from '../adapter.types'

export default class RequestStoreModule {

  private requestsTimeout
  private map: Map<string, Request> = new Map()
  private requests: Map<string, Request> = new Map()

  constructor(requestsTimeout: number) {
    this.requestsTimeout = requestsTimeout
  }

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
    opts: RequestOptsMapping<T>,
    numSub: number
  ) {
    const timeout = setTimeout(() => {
      if (this.requests.has(requestId)) {
        reject(new Error(`Timeout occured on ${requestType} response`))
      }
      this.map.delete(requestId)
    }, this.requestsTimeout)

    const request = { resolve, timeout, }
    const allNodes = { numSub, msgCount: 1, }

    if (requestType === 'SOCKETS') {
      this.map.set(requestId, {
        type: requestType,
        ...request,
        ...allNodes,
        payload: <RequestOptsMapping<'SOCKETS'>> opts,
      })
    } else if (requestType === 'ALL_ROOMS') {
      this.map.set(requestId, {
        type: requestType,
        ...request,
        ...allNodes,
        payload: <RequestOptsMapping<'ALL_ROOMS'>> opts,
      })
    } else if (requestType === 'REMOTE_FETCH') {
      this.map.set(requestId, {
        type: requestType,
        ...request,
        ...allNodes,
        payload: <RequestOptsMapping<'REMOTE_FETCH'>> opts,
      })
    } else if (['REMOTE_JOIN', 'REMOTE_LEAVE', 'REMOTE_DISCONNECT'].includes(requestType)) {
      this.map.set(requestId, {
        // TODO: update with NotFunction<T>
        type: requestType as ('REMOTE_JOIN' | 'REMOTE_LEAVE' | 'REMOTE_DISCONNECT'),
        ...request,
      })
    }
  }
}
