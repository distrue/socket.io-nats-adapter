import {encode, decode} from 'messagepack'

import type {
  RequestPayload,
  RequestType,
  ResponsePayloadMapping,
} from '../adapter.types'

export default class MsgPackModule {
  // RequestPayload: have RequestType in payload -> polymorphic interface
  // ResponsePayload: don't have RequestType in payload -> generic-specified interface

  public static encodeMessage(uid: string, room: string, packet: any, opts: any) {
    const res = encode({
      uid: uid,
      packet: packet,
      opts: {
        rooms: [room],
        except: [...new Set(opts.except)],
        flags: opts.flags,
      },
    })
    return res
  }

  public static decodeMessage(msg: Uint8Array): {uid: string, packet: any, opts: any} {
    const {uid, packet, opts} = decode(msg)
    return {uid, packet, opts}
  }

  public static encodeRequestPayload(request: RequestPayload): Uint8Array {
    // TODO(v2): add active type checker
    return encode(request)
  }

  public static decodeRequestPayload(payload: Uint8Array): RequestPayload {
    // TODO(v2): add active type checker
    return decode<RequestPayload>(payload)
  }

  public static encodeResponsePayload<T extends RequestType>(
    requestType: T,
    response: ResponsePayloadMapping<T>,
  ): Uint8Array {
    // TODO(v0.2): add active type checker
    return encode(response)
  }

  public static decodeResponsePayload<T extends RequestType>(
    requestType: T,
    payload: Uint8Array,
  )
    : ResponsePayloadMapping<T> {
    // TODO(v0.2): add active type checker
    return decode<ResponsePayloadMapping<T>>(payload)
  }
}
