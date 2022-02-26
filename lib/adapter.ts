import type { Msg, NatsError } from 'nats'
import { Adapter, BroadcastOptions, Room, SocketId } from 'socket.io-adapter'
import type { 
  Request,
  RequestOptsMapping,
  RequestPayload,
  RequestPromiseMapping,
  RequestType,
  ResponsePayload,
  ResponsePayloadMapping,
} from './adapter.types'

import RequestBuilder from './builder/requestBuilder'
import ResponseBuilder from './builder/responseBuilder'

import MsgPackModule from './module/msgPackModule'
import RequestStoreModule from './module/RequestStoreModule'
import PubSubModule from './module/pubSubModule'

import NatsIoClient from './service/natsIoClient'
import UniqueId from './service/uniqueId'

const debug = require('debug')('socket.io-adapter')

/**
 * Returns a function that will create a NatsIoAdapter instance
 * 
 * @param natsIoClient - a nats.io client that will be used to pub/sub messages
 * 
 * @public
 */
export default class NatsIoAdapter extends Adapter {
  public readonly requestsTimeout: number
  public readonly uid: string

  private readonly channel: string
  private readonly requestChannel: string
  private readonly responseChannel: string
  private RequestStoreModule: RequestStoreModule
  private pubsub: PubSubModule

  /**
   * Adapter constructor
   * 
   * @param nsp - the namespace
   * @param natsIoClient - a nats.io client that will be used to pub/sub messages
   */
  constructor(nsp: any, natsIoClient?: NatsIoClient) {
    super(nsp)

    this.requestsTimeout = 500
    this.uid = new UniqueId().toString()

    const prefix = 'socket.io'

    this.channel = `${prefix}${nsp.name}`
    this.requestChannel = `${prefix}-reqeust${nsp.name}`
    this.responseChannel = `${prefix}-response${nsp.name}`
    
    this.RequestStoreModule = new RequestStoreModule(this.requestsTimeout)
    this.pubsub = new PubSubModule(natsIoClient)
    this.init()
  }

  //-----------------------------------------------
  // methods for node cluster

  public async allRooms() {
    debug('AllRooms method')
    const localRooms = new Set(this.rooms.keys())

    return this.sendRequestWithPromise<'ALL_ROOMS'>(
      { type: 'ALL_ROOMS', requestId: new UniqueId().toString() },
      { rooms: localRooms },
    )
  }

  public remoteJoin(id: SocketId, room: Room) {
    debug('RemoteJoin method')
    const socket = this.nsp.sockets.get(id)
    if (socket) {
      socket.join(room)
      return Promise.resolve()
    }

    return this.sendRequestWithPromise<'REMOTE_JOIN'>(
      { type: 'REMOTE_JOIN', requestId: new UniqueId().toString(), socketId: id, room, },
      {},
    )
  }

  public remoteLeave(id: SocketId, room: Room) {
    debug('RemoteLeave method')
    const socket = this.nsp.sockets.get(id)
    if (socket) {
      socket.leave(room)
      return Promise.resolve()
    }

    return this.sendRequestWithPromise<'REMOTE_LEAVE'>(
      { type: 'REMOTE_LEAVE', requestId: new UniqueId().toString(), socketId: id, room, },
      {},
    )
  }

  public remoteDisconnect(id: SocketId, close?: boolean) {
    const socket = this.nsp.sockets.get(id)
    if (socket) {
      socket.disconnect(close)
      return Promise.resolve()
    }

    return this.sendRequestWithPromise<'REMOTE_DISCONNECT'>(
      { type: 'REMOTE_DISCONNECT', requestId: new UniqueId().toString(), socketId: id, close, },
      {},
    )
  }

  //-----------------------------------------------
  // Override methods to implement adapter

  public async init() {
    debug('init')
    await this.pubsub.init(this.requestChannel, this.onrequest)
  }

  public async close() {
    debug('close')
    await this.pubsub.close()
  }

  public async addAll(id: SocketId, rooms: Set<Room>) {
    debug('Internal addAll')
    super.addAll(id, rooms)
    for (const room of this.rooms.keys()) {
      const sub = this.pubsub.getBinder(room, this.channel)?.subscribe(
        this.channel + room,
        {callback: (err, msg) => this.onmessage(room, err, msg)}
      )
      if (sub) {
        this.pubsub.register(this.channel + room, sub)
      }
    }
  }

  public async del(id: SocketId, room: Room) {
    debug('Internal del')
    this.unsub(id, room)
    super.del(id, room)
  }

  public async delAll(id: SocketId) {
    debug('Internal delAll')
    if (!this.sids.has(id)) {
      return
    }
    this.sids.get(id)?.forEach(room => this.unsub(id, room))
    super.delAll(id)
  }

  private async unsub(id: SocketId, room: Room) {
    debug('Internal unsub')
    const _room = this.rooms.get(room)
    if (_room != null && _room.size === 1 && _room.has(id)) {
      await this.pubsub.unsubscribe(this.channel + room)
    }
  }

  public async broadcast(packet: any, opts: BroadcastOptions) {
    debug('Broadcast')
    packet.nsp = this.nsp.name
    super.broadcast(packet, opts)
    if (opts.flags?.local) {
      return
    }
    const proms: Promise<void>[] = []
    opts.rooms.forEach((room: string) => proms.push(this.sendMessage(packet, room, opts)))
    await Promise.allSettled(proms)
  }

  public async sockets(rooms: Set<Room>) {
    debug('Internal sockets')
    const localSockets: Set<string> = await super.sockets(rooms)
    return this.sendRequestWithPromise<'SOCKETS'>(
      {type: 'SOCKETS', requestId: new UniqueId().toString(), rooms: [...rooms],},
      { sockets: localSockets },
    )
  }

  public async fetchSockets(opts: BroadcastOptions) {
    debug('FetchSocket')
    const sockets = await super.fetchSockets(opts)
    if (opts.flags?.local) {
      return sockets
    }
    return await this.sendRequestWithPromise<'REMOTE_FETCH'>(
      RequestBuilder.remoteFetch(opts),
      { sockets: sockets }
    )
  }

  public async addSockets(opts: BroadcastOptions, rooms: Room[]) {
    debug('addSocket')
    super.addSockets(opts, rooms)
    if (opts.flags?.local) {
      return
    }
    return await this.sendRequest(RequestBuilder.addSockets(opts, rooms))
  }

  public async delSockets(opts: BroadcastOptions, rooms: Room[]) {
    debug('delSocket')
    super.delSockets(opts, rooms)
    if (opts.flags?.local) {
      return
    }
    return await this.sendRequest(RequestBuilder.delSockets(opts, rooms))
  }

  public async disconnectSockets(opts: BroadcastOptions, close: boolean) {
    debug('disConnectSocket')
    super.disconnectSockets(opts, close)
    if (opts.flags?.local) {
      return
    }
    return await this.sendRequest(RequestBuilder.disconnSockets(opts, close))
  }

  public serverSideEmit(packet: any[]): void {
    this.sendRequest(RequestBuilder.serverSideEmit(this.uid, packet))
  }

  //-----------------------------------------------
  // Message logic

  private onmessage(room: string, err: NatsError | null, msg: Msg) {
    debug('onmessage on %s', room)
    if (err) {
      this.emit('error', err)
      return
    }
    if(!room || !this.rooms.has(room)) {
      return
    }

    const { uid, packet, opts: _opts } = MsgPackModule.decodeMessage(msg.data)
    if (this.uid === uid || !msg.subject.includes(this.nsp.name)) {
      return
    }
    super.broadcast(packet, {
      rooms: new Set<string>(_opts.rooms),
      except: new Set<string>(_opts.except),
    })
  }

  private async sendMessage(packet: any, room: Room, opts: any) {
    this.pubsub.publishRaw(
      this.channel + room,
      MsgPackModule.encodeMessage(this.uid, room, packet, opts)
    )
  }

  //-----------------------------------------------
  // Request logic (Request from other node)

  private onrequest(_room: string, err: NatsError | null, msg: Msg) {
    if (err) {
      return this.emit('error', err)
    }
    if (msg.subject.includes(this.requestChannel)) {
      this._onrequest(MsgPackModule.decodeRequestPayload(msg.data))
    }
  }

  private async _onrequest(request: RequestPayload) {
    if (request.type === 'ALL_ROOMS') {
      const rooms = this.rooms.keys()
      await this.sendResponse(request.type, ResponseBuilder.allRooms(request, rooms))
    } else if (request.type === 'SOCKETS') {
      const sockets = await super.sockets(new Set(request.rooms))
      await this.sendResponse(request.type, ResponseBuilder.sockets(request, sockets))
    } else if (request.type === 'REMOTE_JOIN') {
      const socket = this.nsp.sockets.get(request.socketId)
      if (!socket) {
        return
      }
      socket.join(request.room)
      await this.sendResponse(request.type, ResponseBuilder.bare(request))
    } else if (request.type === 'REMOTE_LEAVE') {
      const socket = this.nsp.sockets.get(request.socketId)
      if (!socket) {
        return
      }
      socket.leave(request.room)
      await this.sendResponse(request.type, ResponseBuilder.bare(request))
    } else if (request.type === 'REMOTE_DISCONNECT') {
      const socket = this.nsp.sockets.get(request.socketId)
      if (!socket) {
        return
      }
      socket.disconnect(request.close)
      await this.sendResponse(request.type, ResponseBuilder.bare(request))
    } else if (request.type === 'REMOTE_FETCH') {
      const sockets = await super.fetchSockets(ResponseBuilder.broadcastOpt(request))
      await this.sendResponse(request.type, ResponseBuilder.remoteFetch(request, sockets))
    } else if (request.type === 'ADD_SOCKETS') {
      super.addSockets(ResponseBuilder.broadcastOpt(request), request.rooms)
    } else if (request.type === 'DEL_SOCKETS') {
      super.delSockets(ResponseBuilder.broadcastOpt(request), request.rooms)
    } else if (request.type === 'DISCONNECT_SOCKETS') {
      super.disconnectSockets(ResponseBuilder.broadcastOpt(request), request.close)
    }
  }

  //-----------------------------------------------
  // Response logic (Response from other node)

  private async onresponse(requestId: string, err: NatsError | null, msg: Msg) {
    if (err) {
      return this.emit('error', err)
    }
    const request = this.RequestStoreModule.get(requestId)
    if (!request) {
      return
    }
    const response = MsgPackModule.decodeResponsePayload(request.type, msg.data)
    await this._onresponse(requestId, request, response)
  }

  private async _onresponse(id: string, request: Request, response: ResponsePayload) {
    if (request.type === 'ALL_ROOMS') {
      const { rooms } = <ResponsePayloadMapping<'ALL_ROOMS'>> response
      rooms.forEach((s) => request.payload.rooms.add(s))
      this.updateRequest(request, id)
    } else if (request.type === 'SOCKETS') {
      const { sockets } = <ResponsePayloadMapping<'SOCKETS'>> response
      sockets.forEach((s) => request.payload.sockets.add(s))
      this.updateRequest(request, id)
    } else if (request.type === 'REMOTE_FETCH') {
      const { sockets } = <ResponsePayloadMapping<'REMOTE_FETCH'>> response
      sockets.forEach((s) => request.payload.sockets.push(s))
      this.updateRequest(request, id)
    } else if (['REMOTE_JOIN', 'REMOTE_LEAVE', 'REMOTE_DISCONNECT'].includes(request.type)) {
      this.updateRequest(request, id)
    }
  }

  //-----------------------------------------------
  // Request/response type guard

  private sendRequest(payload: RequestPayload): void {
    this.pubsub.publishRaw(this.requestChannel, MsgPackModule.encodeRequestPayload(payload))
  }

  private async sendRequestWithPromise<T extends RequestType>(
    payload: RequestPayload, opts: RequestOptsMapping<T>): Promise<RequestPromiseMapping<T>> {
    if (!('requestId' in payload) || !payload.requestId) {
      return new Promise(() => {})
    }
    const type = payload.type
    const requestId = payload.requestId
    return new Promise(async (res, rej) => {
      await this.RequestStoreModule.put(requestId, type, res, rej, opts)
      setTimeout(() => this.resolveReqWithTimeout(requestId), this.requestsTimeout)
      this.pubsub.publishRaw(this.requestChannel, MsgPackModule.encodeRequestPayload(payload))
      const sub = this.pubsub.getBinder(requestId, this.responseChannel)
        ?.subscribe(this.responseChannel + requestId,
          {callback: (err, msg) => this.onresponse(requestId, err, msg)})
      if (sub) {
        this.pubsub.register(this.responseChannel + requestId, sub)
      }
    })
  }

  private sendResponse <T extends RequestType>(
    requestType: RequestType, payload: ResponsePayloadMapping<T>): void {
    this.pubsub.publishRaw(this.responseChannel + payload.requestId,
      MsgPackModule.encodeResponsePayload(requestType, payload))
  }

  // ------------------------------------------
  // Promise clear process

  private updateRequest(request: Request, requestId: string) {
    if (!request.resolve) {
      return
    }
    if (['REMOTE_JOIN', 'REMOTE_LEAVE', 'REMOTE_DISCONNECT'].includes(request.type)) {
      this.clearProcess(requestId)
      request.resolve()
    }
  }

  private resolveReqWithTimeout(requestId: string) {
    const request = this.RequestStoreModule.get(requestId)
    if (!request) {
      return
    }
    this.clearProcess(requestId)

    if (request.type === 'SOCKETS') {
      request.resolve(request.payload.sockets)
    } else if (request.type === 'ALL_ROOMS') {
      request.resolve(request.payload.rooms)
    } else if (request.type === 'REMOTE_FETCH') {
      request.resolve(request.payload.sockets)
    }
  }

  private clearProcess(requestId: string) {
    this.RequestStoreModule.del(requestId)
    this.pubsub.unsubscribe(this.responseChannel + requestId)
  }
}
