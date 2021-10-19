import { Msg, NatsError, Subscription } from 'nats'
import msgpack = require('notepack.io')
import { Adapter, BroadcastOptions, Room, SocketId } from 'socket.io-adapter'
import NatsIoClient from './NatsIoClient'
import UniqueId from './UniqueId'

// TODO: remove type assertion on Promise

export {default as NatsIoClient} from './NatsIoClient'
module.exports = exports = createAdapter

export function createAdapter() {
  return function (nsp: any, natsIoClient?: NatsIoClient) {
    return new NatsIoAdapter(nsp, natsIoClient)
  }
}

enum RequestType {
  SOCKETS = 0,
  ALL_ROOMS = 1,
  REMOTE_JOIN = 2,
  REMOTE_LEAVE = 3,
  REMOTE_DISCONNECT = 4,
  REMOTE_FETCH = 5,
  SERVER_SIDE_EMIT = 6,
}

interface Request {
  type: RequestType
  resolve: Function
  timeout: NodeJS.Timeout
  numSub?: number
  msgCount?: number
  [other: string]: any
}

export class NatsIoAdapter extends Adapter {
  public readonly namespace
  public readonly requestsTimeout: number
  public readonly uid: string

  private readonly channel: string
  private readonly requestChannel: string
  private readonly responseChannel: string
  private requests: Map<string, Request> = new Map()
  private subs: Map<string, Subscription> = new Map()

  private natsIoClient: NatsIoClient

  constructor(
    nsp: any,
    natsIoClient?: NatsIoClient
  ) {
    super(nsp)

    this.namespace = nsp
    this.requestsTimeout = 5000
    this.uid = new UniqueId().toString()

    const prefix = "socket.io"

    this.channel = `${prefix}#${nsp.name}#`
    this.requestChannel = `${prefix}-reqeust#${nsp.name}#`
    this.responseChannel = `${prefix}-response#${nsp.name}#`

    this.natsIoClient = natsIoClient ? natsIoClient : new NatsIoClient()
  }

  //-----------------------------------------------
  // method for node cluster

  public async allRooms(): Promise<Set<Room>> {
    const localRooms = new Set(this.rooms.keys())
    const numSub = await this.natsIoClient.nodes()

    const requestId = new UniqueId().toString()
    const request = msgpack.encode({
      requestId,
      type: RequestType.ALL_ROOMS,
    })

    return this.buildRequest(
      RequestType.SOCKETS,
      requestId,
      request,
      { rooms: localRooms },
    ) as Promise<Set<Room>>
  }

  public remoteJoin(id: SocketId, room: Room): Promise<void> {
    const requestId = new UniqueId().toString()
    const socket = this.nsp.sockets.get(id)

    if (socket) {
      socket.join(room)
      return Promise.resolve()
    }

    const request = msgpack.encode({
      requestId,
      type: RequestType.REMOTE_JOIN,
      socketId: id,
      room,
    })

    return this.buildRequest(
      RequestType.REMOTE_JOIN,
      requestId,
      request,
      {},
    ) as Promise<void>
  }

  public remoteLeave(id: SocketId, room: Room): Promise<void> {
    const requestId = new UniqueId().toString()

    const socket = this.nsp.sockets.get(id)
    if (socket) {
      socket.leave(room)
      return Promise.resolve()
    }

    const request = msgpack.encode({
      requestId,
      type: RequestType.REMOTE_LEAVE,
      socketId: id,
      room,
    })

    return this.buildRequest(
      RequestType.REMOTE_LEAVE,
      requestId,
      request,
      {},
    ) as Promise<void>
  }

  public remoteDisconnect(id: SocketId, room: Room): Promise<void> {
    const requestId = new UniqueId().toString()

    const socket = this.nsp.sockets.get(id)
    if (socket) {
      socket.disconnect(close)
      return Promise.resolve()
    }

    const request = msgpack.encode({
      requestId,
      type: RequestType.REMOTE_DISCONNECT,
      socketId: id,
      close,
    })

    return this.buildRequest(
      RequestType.REMOTE_DISCONNECT,
      requestId,
      request,
      {},
    ) as Promise<void>
  }

  //-----------------------------------------------
  // Override Adapter implementation

  public async init() {
    await this.natsIoClient.initialize()
    this.natsIoClient.subscribe(
      this.requestChannel+'*',
      (err, msg) => this.onrequest(err, msg),
    )
  }

  public async close() {
    await this.natsIoClient.close()
  }

  public async addAll(id: SocketId, rooms: Set<Room>) {
    super.addAll(id, rooms)
    rooms.forEach(async (room) => {
      const key = `${this.channel}${room}`
      if (this.subs.get(key) === undefined) {
        const subscribe = await this.natsIoClient.subscribe(
            key,
            (err, msg) => this.onmessage(room, err, msg)
        )
        this.subs.set(key, subscribe)
      }
    })
  }

  public async del(id: SocketId, room: Room) {
    this.unsub(id, room)
    super.del(id, room)
  }

  public async delAll(id: SocketId) {
    if (!this.sids.has(id)) {
      return
    }
    this.sids.get(id)
      ?.forEach(room => this.unsub(id, room))
    super.delAll(id)
  }

  private async unsub(id: SocketId, room: Room) {
    const _room = this.rooms.get(room)
    if (_room != null && _room.size === 1 && _room.has(id)) {
      // only this "id" has left in room
      const subscribe = this.subs.get(`${this.channel}${room}`)
      if (subscribe) {
        await subscribe.unsubscribe()
      }
    }
  }

  public broadcast(packet: any, opts: BroadcastOptions) {
    packet.nsp = this.nsp.name

    if (!opts.flags?.local) {
      opts.rooms.forEach((room) => {
        const msg = msgpack.encode([this.uid, packet, {
          rooms: [room], // only supports one room send
          except: [...new Set(opts.except)],
          flags: opts.flags,
        }])
        this.natsIoClient.publish(`${this.channel}${room}`, msg)
      })
    }
    super.broadcast(packet, opts)
  }

  public async sockets(rooms: Set<Room>): Promise<Set<Room>> {
    const localSockets: Set<string> = await super.sockets(rooms)
    const numSub = await this.natsIoClient.nodes()

    if (numSub <= 1) {
      return Promise.resolve(localSockets)
    }
    
    const requestId = new UniqueId().toString()
    const request = msgpack.encode({
      requestId,
      type: RequestType.SOCKETS,
      rooms: [...rooms],
    })
    
    return this.buildRequest(
      RequestType.SOCKETS,
      requestId,
      request,
      { sockets: localSockets },
    ) as Promise<Set<Room>>
  }

  // socketRooms method is not essential for adapter
  /*
  public socketRooms(id: SocketId): Set<Room> | undefined {
    return undefined
  }*/

  public async fetchSockets(opts: BroadcastOptions): Promise<any[]> {
    const localSockets = await super.fetchSockets(opts)

    if (opts.flags?.local) {
      return localSockets
    }
    
    const requestId = new UniqueId().toString()
    const request = msgpack.encode({
      requestId,
      type: RequestType.REMOTE_FETCH,
      opts: {
        rooms: [...opts.rooms],
        except: opts.except ? [...opts.except] : [],
      }
    })

    return await this.buildRequest(
      RequestType.REMOTE_FETCH,
      requestId,
      request,
      { sockets: localSockets },
    ) as Promise<any[]>
  }

  public addSockets(opts: BroadcastOptions, rooms: Room[]) {
    if (opts.flags?.local) {
      return super.addSockets(opts, rooms)
    }

    const request = msgpack.encode({
      type: RequestType.REMOTE_JOIN,
      opts: {
        rooms: [...opts.rooms],
        except: opts.except ? [...opts.except] : [],
      }
    })

    this.natsIoClient.publish(this.requestChannel, request)
  }

  public delSockets(opts: BroadcastOptions, rooms: Room[]) {
    if (opts.flags?.local) {
      return super.delSockets(opts, rooms)
    }

    const request = msgpack.encode({
      type: RequestType.REMOTE_DISCONNECT,
      opts: {
        rooms: [...opts.rooms],
        except: opts.except ? [...opts.except] : [],
      },
      close,
    })

    this.natsIoClient.publish(this.requestChannel, request)
  }

  public disconnectSockets(opts: BroadcastOptions, close: boolean) {
    if (opts.flags?.local) {
      return super.disconnectSockets(opts, close)
    }

    const request = msgpack.encode({
      type: RequestType.REMOTE_DISCONNECT,
      opts: {
        rooms: [...opts.rooms],
        except: opts.except ? [...opts.except] : [],
      },
      close,
    })

    this.natsIoClient.publish(this.requestChannel, request)
  }

  // TODO: implement SSE
  public serverSideEmit(packet: any[]): void {
  }

  // TODO: implement SSE
  public serverSideEmitWithAck(packet: any[]): void {
  }

  //

  private async buildRequest(
    requestType: RequestType, // TODO(after): update to closure to parse specific payload
    requestId: string,
    request: string,
    payload: Object
  ) {
    const numSub = await this.natsIoClient.nodes()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.requests.has(requestId)) {
          reject(new Error(`Timeout occured on ${requestType} response`))
        }
        this.requests.delete(requestId)
      }, this.requestsTimeout)

      this.requests.set(requestId, {
        type: requestType,
        numSub,
        resolve,
        timeout,
        msgCount: 1,
        payload,
      })

      this.natsIoClient.publish(this.requestChannel, request)
      this.natsIoClient.subscribe(
        `${this.responseChannel}${requestId}`,
        (err, msg) => this.onresponse(requestId, err, msg)
      ).then(sub => {
        this.subs.set(`${this.responseChannel}${requestId}`, sub)
      })
    })
  }

  //-----------------------------------------------
  // data sent to our node
  private onmessage(
    room: string,
    err: NatsError | null,
    msg: Msg
  ) {
    // TODO: deal with NatsError
    this._onmessage(room, msg.data.toString())
  }

  private _onmessage(room: string, msg: string) {
    if(!room || !this.rooms.has(room)) {
      // ignore unknown room
      return
    }

    // TODO: update 'any' assertion on message decode
    const args: any = msgpack.decode(msg)
    const [uid, packet, _opts] = args

    if (this.uid === uid) {
      // ignore same uid, this should not happen due to NATS no echo option
      return
    }

    if (!room.includes(this.channel)) {
      // ignore different namespace
      return
    }
    const opts = {
      rooms: new Set<string>(_opts.rooms), // need type checking on _opts
      except: new Set<string>(_opts.except),
    }

    super.broadcast(packet, opts)
  }

  // request from other node
  private onrequest(err: NatsError | null, msg: Msg) {
    // ignore if echo'ed request
    // -> 정확하게 checking 하고 싶다면 다시 한번 payload에 uid 추가
    // TODO: deal with NatsError
    this._onrequest(msg.subject, msg.data.toString())
  }

  private async _onrequest(topic: string, msg: string) {
    if (!topic.includes(this.requestChannel)) {
      // ignore if it is not request
      return
    }

    const request: any = msgpack.decode(msg)
    // TODO: if failed to decode -> exit

    // also check uid
    // ignore if request is from this node (check requests set)

    let socket, response

    switch (request.type) {
      case RequestType.SOCKETS:
        const sockets = await super.sockets(new Set(request.payload.rooms))
        response = msgpack.encode({
          requestId: request.requestId,
          sockets: [...sockets],
        })
        await this.natsIoClient.publish(
          `${this.responseChannel}${request.requestId}`,
          response,
        )
        break
      case RequestType.REMOTE_JOIN:
        if (request.opts) {
          const opts = {
            rooms: new Set<Room>(request.opts.rooms),
            except: new Set<Room>(request.opts.except),
          }
          return super.addSockets(opts, request.rooms)
        }
        socket = this.namespace.sockets.get(request.sid)
        if (!socket) {
          return
        }

        socket.join(request.room)
        response = msgpack.encode({ requestId: request.requestId })
        await this.natsIoClient.publish(
          `${this.responseChannel}${request.requestId}`,
          response,
        )
        break
      case RequestType.REMOTE_LEAVE:
        if (request.opts) {
          const opts = {
            rooms: new Set<Room>(request.opts.rooms),
            except: new Set<Room>(request.opts.except),
          }
          return super.delSockets(opts, request.rooms)
        }
        socket = this.namespace.sockets.get(request.sid)
        if (!socket) {
          return
        }

        socket.leave(request.room)
        response = msgpack.encode({ requestId: request.requestId })
        await this.natsIoClient.publish(
          `${this.responseChannel}${request.requestId}`,
          response,
        )
        break
      case RequestType.REMOTE_DISCONNECT:
        if (request.opts) {
          const opts = {
            rooms: new Set<Room>(request.opts.rooms),
            except: new Set<Room>(request.opts.except),
          }
          return super.disconnectSockets(opts, request.close)
        }
        socket = this.namespace.sockets.get(request.sid)
        if (!socket) {
          return
        }
        socket.disconnect(request.close)
        response = msgpack.encode({ requestId: request.requestId })
        await this.natsIoClient.publish(
          `${this.responseChannel}${request.requestId}`,
          response,
        )
        break
      case RequestType.REMOTE_FETCH:
        const opts = {
          rooms: new Set<Room>(request.opts.rooms),
          except: new Set<Room>(request.opts.except),
        };
        const localSockets = await super.fetchSockets(opts);

        response = msgpack.encode({
          requestId: request.requestId,
          sockets: localSockets.map((socket) => ({
            id: socket.id,
            handshake: socket.handshake,
            rooms: [...socket.rooms],
            data: socket.data,
          })),
        })

        await this.natsIoClient.publish(
          `${this.responseChannel}${request.requestId}`,
          response,
        )
        break
      case RequestType.SERVER_SIDE_EMIT: // TODO: implement server_side_emit
      default:
        return
        // ignore unknown request type
    }
  }

  // response of request
  private async onresponse(
    requestId: string,
    err: NatsError | null,
    msg: Msg
  ) {
    await this._onresponse(requestId, msg.subject, msg.data.toString())
    const sub = this.subs.get(`${this.responseChannel}${requestId}`)
    if (sub) {
      await sub.unsubscribe()
    }
  }

  private async _onresponse(requestId: string, topic: string, msg: string) {
    const response: any = msgpack.decode(msg)
    // TODO: deal with case if msgpack decode fails

    if (!requestId || !this.requests.has(requestId)) {
      return
    }
    const request: any = this.requests.get(requestId)
    
    switch(request.type) {
      case RequestType.SOCKETS:
      case RequestType.REMOTE_FETCH:
        request.msgCount += 1

        // ignore if response does not contain 'sockets' key
        if (!response.sockets || !Array.isArray(response.sockets)) {
          return
        }
        if (request.type === RequestType.SOCKETS) {
          response.sockets.forEach((s: SocketId) => request.sockets.add(s))
        } else {
          response.sockets.forEach((s: SocketId) => request.sockets.push(s))
        }

        if (request.msgCount === request.numSub) {
          this.clearRequest(request, requestId)
        }
        break
      case RequestType.ALL_ROOMS:
        request.msgCount += 1

        // ignore if response does not contain 'rooms' key
        if (!response.rooms || !Array.isArray(response.rooms)) {
          return
        }
        response.rooms.forEach((s: SocketId) => request.rooms.add(s))

        if (request.msgCount === request.numSub) {
          this.clearRequest(request, requestId)
        }
        break
      case RequestType.REMOTE_JOIN:
      case RequestType.REMOTE_LEAVE:
      case RequestType.REMOTE_DISCONNECT:
        this.clearRequest(request, requestId)
        break
      case RequestType.SERVER_SIDE_EMIT: // TODO: implement SSE
      default:
        return
    }
  }

  private clearRequest(request: any, requestId: string) {
    clearTimeout(request.timeout)
    if (request.resolve) {
      request.resolve(request.sockets)
    }
    this.requests.delete(requestId)
  }
}
